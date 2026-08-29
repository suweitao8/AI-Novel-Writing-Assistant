import * as pc from "playcanvas";

import type { AnimationLibraryEntry } from "@/config/animationLibrary";
import {
  clamp,
  createMaterial,
  createPlane,
  DEFAULT_FOV,
  loadAsset,
  type ContainerResource,
} from "@/pages/drama/comicDrama/components/blocking3d";
import { computeSourceBounds } from "@/pages/models/modelLibrary3d/modelViewerApp";
import { setupStudioLighting, upgradeStudioEnvironment } from "@/pages/models/modelLibrary3d/studioLighting";
import { attachStudioBackdrop } from "@/pages/models/modelLibrary3d/studioBackdrop";

/**
 * 动画库缩略图生成器：与模型库缩略图同一套「离屏 PlayCanvas 画布 + localStorage
 * 缓存」方案，差别是先把动作片段装配到角色上、摆到片段中段的代表帧再抓图，
 * 让卡片预览图反映动作姿态而不是绑定姿态。
 */

const THUMBNAIL_SIZE = { width: 288, height: 216 } as const;
const JPEG_QUALITY = 0.75;
const STORAGE_KEY = "animation-library:thumbnails:v2";
const IDLE_DESTROY_MS = 8000;

type Listener = () => void;
const listeners = new Set<Listener>();
const memoryCache = new Map<string, string>();
const pendingEntries = new Map<string, AnimationLibraryEntry>();
let storageEnabled = true;
let studio: { destroy: () => void } | null = null;
let studioPromise: Promise<{
  render: (entry: AnimationLibraryEntry) => Promise<string>;
  destroy: () => void;
}> | null = null;
let processing = false;
let idleTimer: ReturnType<typeof setTimeout> | null = null;

interface AnimTrackLike {
  name?: unknown;
}

interface AnimLayerLike {
  play: (name: string) => void;
  activeStateCurrentTime?: number;
}

interface AnimComponentLike {
  baseLayer?: AnimLayerLike | null;
  playing: boolean;
  rootBone: unknown;
  assignAnimation: (name: string, track: unknown, layer?: number, speed?: number, loop?: boolean) => void;
}

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

export function getAnimationThumbnail(id: string): string | null {
  loadStorageCache();
  return memoryCache.get(id) ?? null;
}

export function subscribeAnimationThumbnails(listener: Listener): () => void {
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

/** 请求一张动画缩略图；已缓存返回 true，否则进入生成队列（完成后广播订阅者）。 */
export function ensureAnimationThumbnail(entry: AnimationLibraryEntry): boolean {
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
      studioPromise = createAnimationThumbnailStudio();
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
        // 单个动画生成失败只影响自己，卡片保持占位图标。
      } finally {
        pendingEntries.delete(entry.id);
      }
    }
  } finally {
    processing = false;
  }
  scheduleIdleDestroy();
}

const nextFrame = () =>
  new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve());
  });

async function createAnimationThumbnailStudio(): Promise<{
  render: (entry: AnimationLibraryEntry) => Promise<string>;
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

  const cameraEntity = new pc.Entity("anim-thumb-camera");
  cameraEntity.addComponent("camera", {
    clearColor: new pc.Color(0.13, 0.15, 0.19),
    fov: DEFAULT_FOV,
    nearClip: 0.05,
    farClip: 200,
  });
  app.root.addChild(cameraEntity);
  cameraEntity.camera!.layers = cameraEntity.camera!.layers.filter(
    (layerId) => layerId !== pc.LAYERID_SKYBOX,
  );
  setupStudioLighting(app, cameraEntity.camera!);
  await upgradeStudioEnvironment(app);
  const backdrop = await attachStudioBackdrop(app, { radius: 30 });

  const ground = createPlane(
    app,
    "anim-thumb-ground",
    [0, -0.01, 0],
    [12, 1, 12],
    createMaterial(new pc.Color(0.16, 0.18, 0.22)),
  );
  ground.render!.receiveShadows = false;

  const gridLines: Array<{ start: pc.Vec3; end: pc.Vec3; color: pc.Color }> = [];
  for (let value = -3; value <= 3; value += 0.5) {
    const color = new pc.Color(0.3, 0.34, 0.42, 0.4);
    gridLines.push({ start: new pc.Vec3(value, 0.004, -3), end: new pc.Vec3(value, 0.004, 3), color });
    gridLines.push({ start: new pc.Vec3(-3, 0.004, value), end: new pc.Vec3(3, 0.004, value), color });
  }

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
    for (const line of gridLines) app.drawLine(line.start, line.end, line.color, false);
    app.render();
  };

  // 动作片段评估依赖应用帧循环（autoRender=false 只关自动出图，update 照常触发）。
  app.start();

  let destroyed = false;

  return {
    async render(entry) {
      if (destroyed) throw new Error("缩略图画布已销毁。");
      const asset = await loadAsset(app, entry.fileUrl, "container");
      try {
        const resource = asset.resource as ContainerResource | null;
        const model = resource?.instantiateRenderEntity?.({ castShadows: false });
        if (!model) throw new Error("动作文件里没有可显示的角色。");
        model.addComponent("anim", { activate: true });
        const anim = model.anim as unknown as AnimComponentLike | undefined;
        if (!anim) throw new Error("角色缺少可用的动作组件。");

        // 底部中心落到原点（按绑定姿态取景，动作姿态都在同一活动范围内）。
        app.root.addChild(model);
        app.root.syncHierarchy();
        const bounds = computeSourceBounds(model);
        let centerY = 0.9;
        let radius = 1;
        if (bounds) {
          model.setPosition(-bounds.center[0], -(bounds.center[1] - bounds.halfExtents[1]), -bounds.center[2]);
          centerY = bounds.halfExtents[1];
          radius = Math.hypot(bounds.halfExtents[0], bounds.halfExtents[1], bounds.halfExtents[2]);
        }

        const tracks = new Map<string, unknown>();
        for (const clipAsset of resource?.animations ?? []) {
          const track = clipAsset.resource as AnimTrackLike | null;
          if (track && typeof track.name === "string") tracks.set(track.name, track);
        }
        const track = tracks.get(entry.clipName);
        if (!track) throw new Error(`动作片段「${entry.clipName}」不在当前文件里。`);
        anim.rootBone = model;
        anim.assignAnimation(entry.clipName, track, 0, 1, true);
        anim.playing = true;
        anim.baseLayer?.play(entry.clipName);

        // 摆到片段中段的代表帧：先等一帧让片段状态建立，再定位时间并等评估生效。
        await nextFrame();
        const layer = anim.baseLayer;
        if (layer && typeof layer.activeStateCurrentTime === "number") {
          layer.activeStateCurrentTime = Math.max(entry.durationSeconds * 0.4, 0.05);
        }
        await nextFrame();
        await nextFrame();

        frame(centerY, radius);
        drawFrame();
        drawFrame();
        const dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
        if (!dataUrl.startsWith("data:image/jpeg")) throw new Error("缩略图画布没有输出有效图像。");
        model.destroy();
        return dataUrl;
      } finally {
        app.assets.remove(asset);
      }
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      backdrop?.destroy();
      app.destroy();
    },
  };
}
