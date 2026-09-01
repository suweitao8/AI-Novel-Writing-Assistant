import * as pc from "playcanvas";

import type { ModelLibraryEntry } from "@/config/modelLibrary";
import {
  loadAsset,
  mountBlocking3dOffscreenCanvas,
  type ContainerResource,
} from "@/pages/drama/comicDrama/components/blocking3d";
import { applyModelMaterials } from "./modelMaterials";
import {
  collectModelPreviewPoints,
  computeSourceBounds,
  getNormalizedModelPreviewBounds,
  normalizeModelPreviewPoints,
} from "./modelViewerApp";
import {
  fitModelPreviewCamera,
  MODEL_PREVIEW_FRAMING,
  type ModelPreviewBounds,
  type ModelPreviewVector,
} from "./modelPreviewFraming";
import { loadStudioEnvironment } from "./studioEnvironmentRuntime";

/**
 * 模型库缩略图生成器：复用一个离屏 PlayCanvas 画布，逐个加载模型、
 * 自动取景后抓成一帧 JPEG dataURL。结果存进 localStorage，同一个
 * 模型文件只生成一次；队列传空且闲置一段时间后销毁画布释放 WebGL 上下文。
 */

// 缩略图按卡片小图输出 JPEG：数百模型的缓存体量必须压进 localStorage 配额。
const THUMBNAIL_SIZE = { width: 256, height: 192 } as const;
const JPEG_QUALITY = 0.75;
const STORAGE_KEY = "model-library:thumbnails:v28";
const IDLE_DESTROY_MS = 8000;
const STUDIO_INIT_WATCHDOG_MS = 30_000;
const RENDER_WATCHDOG_MS = 30_000;

/** 给异步阶段加看门狗：单步挂起只损失当前一步，队列永不永久停摆。 */
function withWatchdog<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}

type Listener = () => void;
const listeners = new Set<Listener>();
const memoryCache = new Map<string, string>();
const pendingEntries = new Map<string, ModelLibraryEntry>();
let storageEnabled = true;
let studio: {
  destroy: () => void;
} | null = null;
let studioPromise: Promise<{
  render: (entry: ModelLibraryEntry) => Promise<string>;
  destroy: () => void;
}> | null = null;
let processing = false;
let studioGeneration = 0;
let pendingStudioDestroy: (() => void) | null = null;
let idleTimer: ReturnType<typeof setTimeout> | null = null;
let cachePersistIdleId: number | null = null;
let cachePersistTimer: number | null = null;

const nextFrame = () =>
  new Promise<void>((resolve) => {
    // rAF 在窗口被遮挡或后台标签页会无限停摆，而取帧等待是缩略图管线里
    // 唯一依赖帧回调的环节——只等 rAF 时队列会无报错地永久卡死。定时器
    // 兜底保证任何可见性状态下都能继续出图：后台标签的定时器节流只降低
    // 生成速度，不会中断队列。
    let settled = false;
    const settle = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    requestAnimationFrame(settle);
    setTimeout(settle, 50);
  });

function loadStorageCache(): void {
  if (memoryCache.size > 0 || !storageEnabled) return;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Record<string, string>;
    for (const [id, dataUrl] of Object.entries(parsed)) {
      if (typeof dataUrl === "string" && dataUrl.startsWith("data:image/")) memoryCache.set(id, dataUrl);
    }
  } catch {
    storageEnabled = false;
  }
}

function persistCache(): void {
  if (!storageEnabled) return;
  try {
    const payload: Record<string, string> = {};
    for (const [id, dataUrl] of memoryCache) payload[id] = dataUrl;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // 超出配额等场景直接放弃持久化，内存缓存仍然生效。
    storageEnabled = false;
  }
}

function scheduleCachePersist(): void {
  if (!storageEnabled || cachePersistIdleId !== null || cachePersistTimer !== null) return;
  const flush = () => {
    cachePersistIdleId = null;
    cachePersistTimer = null;
    persistCache();
  };
  const idleWindow = window as Window & {
    requestIdleCallback?: (callback: () => void, options?: { timeout?: number }) => number;
  };
  if (typeof idleWindow.requestIdleCallback === "function") {
    cachePersistIdleId = idleWindow.requestIdleCallback(flush, { timeout: 1000 });
  } else {
    cachePersistTimer = window.setTimeout(flush, 250);
  }
}

export function getThumbnail(id: string): string | null {
  loadStorageCache();
  return memoryCache.get(id) ?? null;
}

export function subscribeThumbnails(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * 模型详情页使用自己的可见预览画布，不能与卡片缩略图同时占用一套 HDRI
 * WebGL 资源。取消当前工作室后，回到模型库时会按当前卡片重新排队生成。
 */
export function disposeThumbnailStudio(): void {
  // 释放缩略图工作室必须在路由切换时立即完成。当前 render Promise 会在
  // generation 失效后自行收束；详情页不能为了等待一个已销毁的后台任务而
  // 阻塞可见 3D 查看器的启动。
  studioGeneration += 1;
  pendingEntries.clear();
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = null;
  pendingStudioDestroy?.();
  pendingStudioDestroy = null;
  studio?.destroy();
  studio = null;
  studioPromise = null;
}

function emitThumbnails(): void {
  for (const listener of listeners) listener();
}

function scheduleIdleDestroy(): void {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    idleTimer = null;
    if (pendingEntries.size === 0 && studio) {
      studio.destroy();
      studio = null;
      studioPromise = null;
    }
  }, IDLE_DESTROY_MS);
}

function startProcessQueue(): void {
  void processQueue();
}

/** 请求一张缩略图；已缓存返回 true，否则进入生成队列（完成后广播订阅者）。 */
export function ensureThumbnail(entry: ModelLibraryEntry): boolean {
  loadStorageCache();
  if (memoryCache.has(entry.id)) return true;
  if (!pendingEntries.has(entry.id)) {
    pendingEntries.set(entry.id, entry);
  }
  if (!processing) startProcessQueue();
  scheduleIdleDestroy();
  return false;
}

export function cancelThumbnail(id: string): void {
  pendingEntries.delete(id);
}

async function processQueue(): Promise<void> {
  if (processing) return;
  processing = true;
  const generation = studioGeneration;
  let active: Awaited<ReturnType<typeof createThumbnailStudio>>;
  try {
    if (!studioPromise) {
      studioPromise = createThumbnailStudio();
    }
    active = await withWatchdog(studioPromise, STUDIO_INIT_WATCHDOG_MS, "缩略图画布初始化超时。");
    if (generation !== studioGeneration) {
      active.destroy();
      processing = false;
      if (pendingEntries.size > 0) startProcessQueue();
      return;
    }
  } catch {
    // Do not leave a rejected initialization Promise cached forever. A later
    // card request can retry after WebGL, the browser, or the asset server
    // becomes available again.
    if (generation === studioGeneration) {
      // 初始化看门狗超时时画布应用仍在挂起，先销毁它释放 WebGL 上下文。
      if (studioPromise !== null) {
        pendingStudioDestroy?.();
        pendingStudioDestroy = null;
      }
      studioPromise = null;
    }
    processing = false;
    if (generation === studioGeneration) {
      scheduleIdleDestroy();
    } else if (pendingEntries.size > 0) {
      startProcessQueue();
    }
    return;
  }

  studio = active;
  try {
    for (;;) {
      if (generation !== studioGeneration) break;
      const next = pendingEntries.values().next();
      if (next.done) break;
      const entry = next.value;
      try {
        const dataUrl = await withWatchdog(
          active.render(entry),
          RENDER_WATCHDOG_MS,
          "缩略图生成超时。",
        );
        memoryCache.set(entry.id, dataUrl);
        scheduleCachePersist();
        emitThumbnails();
      } catch {
        // 单个模型生成失败或超时只影响自己，卡片保持占位图标。
      } finally {
        pendingEntries.delete(entry.id);
      }
    }
  } finally {
    processing = false;
  }
  if (generation !== studioGeneration) {
    if (pendingEntries.size > 0) startProcessQueue();
    return;
  }
  scheduleIdleDestroy();
}

async function createThumbnailStudio(): Promise<{
  render: (entry: ModelLibraryEntry) => Promise<string>;
  destroy: () => void;
}> {
  const canvas = document.createElement("canvas");
  canvas.width = THUMBNAIL_SIZE.width;
  canvas.height = THUMBNAIL_SIZE.height;
  const offscreenCanvasMount = mountBlocking3dOffscreenCanvas(
    canvas,
    THUMBNAIL_SIZE.width,
    THUMBNAIL_SIZE.height,
  );
  const app = new pc.Application(canvas, {
    graphicsDeviceOptions: { antialias: true, alpha: false, preserveDrawingBuffer: true },
  });
  app.setCanvasFillMode(pc.FILLMODE_NONE);
  // 隐藏 DOM 容器负责提供正常布局；FIXED 模式仍显式带上宽高，避免
  // 缩略图绘图缓冲尺寸受页面 CSS 或容器测量时机影响。
  app.setCanvasResolution(pc.RESOLUTION_FIXED, THUMBNAIL_SIZE.width, THUMBNAIL_SIZE.height);
  app.autoRender = false;

  const cameraEntity = new pc.Entity("thumb-camera");
  cameraEntity.addComponent("camera", {
    clearColor: new pc.Color(0.13, 0.15, 0.19),
    fov: MODEL_PREVIEW_FRAMING.fovDegrees,
    nearClip: 0.05,
    farClip: 200,
  });
  app.root.addChild(cameraEntity);
  // 与编辑器一致：envAtlas 只承担光照，不渲染成无限天空球，背景只留穹顶。
  cameraEntity.camera!.layers = cameraEntity.camera!.layers.filter(
    (layerId) => layerId !== pc.LAYERID_SKYBOX,
  );
  app.scene.exposure = 1;
  // The shared environment builds its HDR projection/materials through the
  // running PlayCanvas lifecycle. Keep the RAF alive while asynchronous HDRI
  // and model resources initialise; autoRender remains disabled, so capture
  // is still explicitly controlled below.
  let studioEnvironment: Awaited<ReturnType<typeof loadStudioEnvironment>> | null = null;
  let destroyed = false;
  let appDestroyed = false;
  const destroy = () => {
    destroyed = true;
    studioEnvironment?.destroy();
    studioEnvironment = null;
    if (appDestroyed) return;
    appDestroyed = true;
    pc.AppBase.cancelTick(app);
    app.destroy();
    offscreenCanvasMount();
  };
  // The environment load is asynchronous. Keep an early destroy handle so
  // leaving the library can release the WebGL app before the studio promise
  // has resolved and before processQueue receives the final handle.
  pendingStudioDestroy = destroy;

  try {
    app.start();
    // 卡片统一使用室内默认环境，并等待可见穹顶与环境光都装配完成后再出图。
    const loadedEnvironment = await loadStudioEnvironment(app, undefined, {
      camera: cameraEntity.camera!,
      lightingProfile: "model-preview",
    });
    if (destroyed) {
      loadedEnvironment.destroy();
      throw new Error("缩略图画布已销毁。");
    }
    studioEnvironment = loadedEnvironment;
    if (!studioEnvironment.hasVisibleBackdrop) {
      throw new Error("HDRI 场景环境加载失败。");
    }

    const frame = (bounds: ModelPreviewBounds, points: readonly ModelPreviewVector[] = []) => {
      const fit = fitModelPreviewCamera(
        bounds,
        THUMBNAIL_SIZE.width / THUMBNAIL_SIZE.height,
        points,
      );
      const target = new pc.Vec3(...fit.target);
      const azim = fit.azimuthDegrees * pc.math.DEG_TO_RAD;
      const elev = fit.elevationDegrees * pc.math.DEG_TO_RAD;
      const distance = fit.distance;
      cameraEntity.camera!.nearClip = Math.max(0.001, Math.min(0.05, distance * 0.05));
      cameraEntity.setPosition(
        target.x + Math.sin(azim) * Math.cos(elev) * distance,
        target.y + Math.sin(-elev) * distance,
        target.z + Math.cos(azim) * Math.cos(elev) * distance,
      );
      cameraEntity.lookAt(target);
    };

    const drawFrame = () => {
      app.render();
    };

    const handle: {
      render: (entry: ModelLibraryEntry) => Promise<string>;
      destroy: () => void;
    } = {
      async render(entry) {
        if (destroyed) throw new Error("缩略图画布已销毁。");
        const asset = await loadAsset(app, entry.fileUrl, "container");
        let adjust: pc.Entity | null = null;
        try {
          if (destroyed) throw new Error("缩略图画布已销毁。");
          const resource = asset.resource as ContainerResource | null;
          const inner = resource?.instantiateRenderEntity?.({ castShadows: true });
          if (!inner) throw new Error("模型没有可显示的网格。");
          const root = new pc.Entity("thumb-model");
          root.addChild(inner);
          const unitScale = entry.unitScale > 0 ? entry.unitScale : 1;
          adjust = new pc.Entity("thumb-adjust");
          adjust.addChild(root);
          app.root.addChild(adjust);

          // 与编辑器一致：恒等变换下取「含节点偏移」的源包围盒，再一次性
          // 应用米换算与底部中心落原点偏移。
          app.root.syncHierarchy();
          const bounds = computeSourceBounds(inner);
          const sourcePoints = collectModelPreviewPoints(inner);
          let previewBounds: ModelPreviewBounds = {
            min: [-0.5, 0, -0.5],
            max: [0.5, 1, 0.5],
          };
          let previewPoints: ModelPreviewVector[] = [];
          if (bounds) {
            adjust.setLocalScale(unitScale, unitScale, unitScale);
            adjust.setPosition(
              -bounds.center[0] * unitScale,
              -(bounds.center[1] - bounds.halfExtents[1]) * unitScale,
              -bounds.center[2] * unitScale,
            );
            previewBounds = getNormalizedModelPreviewBounds(bounds, unitScale);
            previewPoints = normalizeModelPreviewPoints(sourcePoints, bounds, unitScale);
          }
          // 先把真实材质套上再取景，缩略图必须是带纹理的最终外观。
          await applyModelMaterials(app, root, entry.materials);
          app.root.syncHierarchy();
          frame(previewBounds, previewPoints);
          await nextFrame();
          drawFrame();
          drawFrame();
          const dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
          if (!dataUrl.startsWith("data:image/jpeg")) throw new Error("缩略图画布没有输出有效图像。");
          return dataUrl;
        } finally {
          // 失败路径也要摘除半成品实体，避免反复重试时残留实体累积占住显存。
          adjust?.destroy();
          app.assets.remove(asset);
        }
      },
      destroy,
    };
    return handle;
  } catch (error) {
    destroy();
    throw error;
  } finally {
    if (pendingStudioDestroy === destroy) pendingStudioDestroy = null;
  }
}
