import * as pc from "playcanvas";

import type { ModelLibraryEntry } from "@/config/modelLibrary";
import {
  buildBlocking3dGroundGridLines,
  clamp,
  DEFAULT_FOV,
  drawBlocking3dGroundGrid,
  loadAsset,
  type ContainerResource,
} from "@/pages/drama/comicDrama/components/blocking3d";
import { applyModelMaterials } from "./modelMaterials";
import { computeSourceBounds } from "./modelViewerApp";
import { loadStudioEnvironment } from "./studioEnvironmentRuntime";

/**
 * 模型库缩略图生成器：复用一个离屏 PlayCanvas 画布，逐个加载模型、
 * 自动取景后抓成一帧 PNG dataURL。结果存进 localStorage，同一个
 * 模型文件只生成一次；队列传空且闲置一段时间后销毁画布释放 WebGL 上下文。
 */

// 缩略图按卡片小图输出 JPEG：数百模型的缓存体量必须压进 localStorage 配额。
const THUMBNAIL_SIZE = { width: 288, height: 216 } as const;
const JPEG_QUALITY = 0.75;
const STORAGE_KEY = "model-library:thumbnails:v19";
const IDLE_DESTROY_MS = 8000;

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
let idleTimer: ReturnType<typeof setTimeout> | null = null;

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

export function getThumbnail(id: string): string | null {
  loadStorageCache();
  return memoryCache.get(id) ?? null;
}

export function subscribeThumbnails(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
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

/** 请求一张缩略图；已缓存返回 true，否则进入生成队列（完成后广播订阅者）。 */
export function ensureThumbnail(entry: ModelLibraryEntry): boolean {
  loadStorageCache();
  if (memoryCache.has(entry.id)) return true;
  if (!pendingEntries.has(entry.id)) {
    pendingEntries.set(entry.id, entry);
    void processQueue();
  }
  scheduleIdleDestroy();
  return false;
}

async function processQueue(): Promise<void> {
  if (processing) return;
  processing = true;
  try {
    if (!studioPromise) {
      studioPromise = createThumbnailStudio();
    }
    const active = await studioPromise;
    studio = active;
    for (;;) {
      const next = pendingEntries.values().next();
      if (next.done) break;
      const entry = next.value;
      try {
        const dataUrl = await active.render(entry);
        memoryCache.set(entry.id, dataUrl);
        persistCache();
        emitThumbnails();
      } catch {
        // 单个模型生成失败只影响自己，卡片保持占位图标。
      } finally {
        pendingEntries.delete(entry.id);
      }
    }
  } finally {
    processing = false;
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
  const app = new pc.Application(canvas, {
    graphicsDeviceOptions: { antialias: true, alpha: false, preserveDrawingBuffer: true },
  });
  app.setCanvasFillMode(pc.FILLMODE_NONE);
  // 离屏画布不在 DOM 里：clientWidth 恒为 0，AUTO 分辨率会把画布清成 0×0；
  // FIXED 模式必须显式带上宽高，让引擎直接设定绘图缓冲尺寸。
  app.setCanvasResolution(pc.RESOLUTION_FIXED, THUMBNAIL_SIZE.width, THUMBNAIL_SIZE.height);
  app.autoRender = false;

  const cameraEntity = new pc.Entity("thumb-camera");
  cameraEntity.addComponent("camera", {
    clearColor: new pc.Color(0.13, 0.15, 0.19),
    fov: DEFAULT_FOV,
    nearClip: 0.05,
    farClip: 200,
  });
  app.root.addChild(cameraEntity);
  // 与编辑器一致：envAtlas 只承担光照，不渲染成无限天空球，背景只留穹顶。
  cameraEntity.camera!.layers = cameraEntity.camera!.layers.filter(
    (layerId) => layerId !== pc.LAYERID_SKYBOX,
  );
  cameraEntity.camera!.toneMapping = pc.TONEMAP_ACES;
  app.scene.exposure = 1;
  // 卡片统一使用室内默认环境，并等待可见穹顶与环境光都装配完成后再出图。
  const studioEnvironment = await loadStudioEnvironment(app, undefined, {
    lightingProfile: "model-preview",
  });
  if (!studioEnvironment.hasVisibleBackdrop) {
    studioEnvironment.destroy();
    app.destroy();
    throw new Error("HDRI 场景环境加载失败。");
  }
  const gridLines = buildBlocking3dGroundGridLines(studioEnvironment.settings);

  const frame = (centerY: number, radius: number) => {
    const fovRad = DEFAULT_FOV * pc.math.DEG_TO_RAD;
    const distance = clamp((Math.max(radius, 0.25) / Math.sin(fovRad / 2)) * 1.3, 0.35, 60);
    const azim = -35 * pc.math.DEG_TO_RAD;
    const elev = -18 * pc.math.DEG_TO_RAD;
    const target = new pc.Vec3(0, centerY, 0);
    cameraEntity.setPosition(
      target.x + Math.sin(azim) * Math.cos(elev) * distance,
      target.y + Math.sin(-elev) * distance,
      target.z + Math.cos(azim) * Math.cos(elev) * distance,
    );
    cameraEntity.lookAt(target);
  };

  const drawFrame = () => {
    drawBlocking3dGroundGrid(app, gridLines);
    app.render();
  };

  let destroyed = false;

  return {
    async render(entry) {
      if (destroyed) throw new Error("缩略图画布已销毁。");
      const asset = await loadAsset(app, entry.fileUrl, "container");
      try {
        const resource = asset.resource as ContainerResource | null;
        const inner = resource?.instantiateRenderEntity?.({ castShadows: false });
        if (!inner) throw new Error("模型没有可显示的网格。");
        const root = new pc.Entity("thumb-model");
        root.addChild(inner);
        const unitScale = entry.unitScale > 0 ? entry.unitScale : 1;
        const adjust = new pc.Entity("thumb-adjust");
        adjust.addChild(root);
        app.root.addChild(adjust);

        // 与编辑器一致：恒等变换下取「含节点偏移」的源包围盒，再一次性
        // 应用米换算与底部中心落原点偏移。
        app.root.syncHierarchy();
        const bounds = computeSourceBounds(inner);
        let centerY = 0.5;
        let radius = 0.5;
        if (bounds) {
          adjust.setLocalScale(unitScale, unitScale, unitScale);
          adjust.setPosition(
            -bounds.center[0] * unitScale,
            -(bounds.center[1] - bounds.halfExtents[1]) * unitScale,
            -bounds.center[2] * unitScale,
          );
          centerY = bounds.halfExtents[1] * unitScale;
          radius = Math.hypot(bounds.halfExtents[0], bounds.halfExtents[1], bounds.halfExtents[2]) * unitScale;
        }
        // 先把真实材质套上再取景，缩略图必须是带纹理的最终外观。
        await applyModelMaterials(app, root, entry.materials);
        frame(centerY, radius);
        drawFrame();
        drawFrame();
        const dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
        if (!dataUrl.startsWith("data:image/jpeg")) throw new Error("缩略图画布没有输出有效图像。");
        adjust.destroy();
        return dataUrl;
      } finally {
        app.assets.remove(asset);
      }
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      studioEnvironment.destroy();
      app.destroy();
    },
  }
}
