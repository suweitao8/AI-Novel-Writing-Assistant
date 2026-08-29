import * as pc from "playcanvas";

import {
  clamp,
  buildBlocking3dGroundGridLines,
  DEFAULT_FOV,
  drawBlocking3dGroundGrid,
  loadAsset,
  MAX_DEVICE_PIXEL_RATIO,
  updateBlocking3dCameraAzimuth,
  type ContainerResource,
} from "@/pages/drama/comicDrama/components/blocking3d";
import { computeSourceBounds } from "@/pages/models/modelLibrary3d/modelViewerApp";
import {
  loadStudioEnvironment,
  type StudioEnvironmentHandle,
} from "@/pages/models/modelLibrary3d/studioEnvironmentRuntime";

export interface AnimationPreviewOptions {
  canvas: HTMLCanvasElement;
  /** 角色 + 动作片段所在的 GLB 地址。 */
  glbUrl: string;
  /** 初始播放的动作片段名。 */
  clipName: string;
  onStatus?: (status: string) => void;
  /** 片段加载或播放出错（切换片段失败等）。 */
  onError?: (message: string) => void;
}

export interface AnimationPreview {
  /** 切换播放的动作片段（同一 GLB 内）。 */
  play: (clipName: string) => void;
  destroy: () => void;
}

export interface AnimationPreviewHandle {
  /** 加载完成后的预览器；加载或初始化失败时 reject。 */
  ready: Promise<AnimationPreview>;
  /** 立即销毁底层应用（加载中也可调用），阻止后续就绪回调。 */
  cancel: () => void;
}

interface AnimTrackLike {
  name?: unknown;
}

interface AnimLayerLike {
  play: (name: string) => void;
}

interface AnimComponentLike {
  baseLayer?: AnimLayerLike | null;
  playing: boolean;
  rootBone: unknown;
  assignAnimation: (name: string, track: unknown, layer?: number, speed?: number, loop?: boolean) => void;
}

const DEFAULT_VIEW = { azim: -155, elev: -8 } as const;

/**
 * 动画库预览器：加载「角色 + 动作片段」GLB，循环播放指定片段。
 * 相机与布光和模型 3D 编辑器同一套 Orbit 方案，但不带 gizmo 与变换编辑。
 *
 * 画布上的 PlayCanvas 应用必须独占创建：应用构造是同步的，加载是异步的。
 * 同一个 canvas 上并发存在两个 Application（React StrictMode 双执行 effect
 * 时的典型场景）会共享同一个 WebGL 上下文，先销毁的那个会破坏存活一方的
 * 渲染循环，因此暴露 cancel() 让调用方在 effect 清理时同步销毁未就绪的应用。
 */
export function openAnimationPreview(options: AnimationPreviewOptions): AnimationPreviewHandle {
  const { canvas } = options;
  const app = new pc.Application(canvas, {
    mouse: new pc.Mouse(canvas),
    graphicsDeviceOptions: {
      antialias: true,
      alpha: false,
      preserveDrawingBuffer: true,
      powerPreference: "high-performance",
    },
  });
  app.setCanvasFillMode(pc.FILLMODE_NONE);
  app.setCanvasResolution(pc.RESOLUTION_AUTO);

  const cameraEntity = new pc.Entity("animation-preview-camera");
  cameraEntity.addComponent("camera", {
    clearColor: new pc.Color(0.075, 0.09, 0.115),
    fov: DEFAULT_FOV,
    nearClip: 0.05,
    farClip: 200,
  });
  app.root.addChild(cameraEntity);
  // 与漫剧场景视图一致：envAtlas 只承担 HDR 照明，可见背景由固定在世界
  // 原点的有限半圆穹顶提供，避免天空球随相机轨道旋转。
  cameraEntity.camera!.layers = cameraEntity.camera!.layers.filter(
    (layerId) => layerId !== pc.LAYERID_SKYBOX,
  );
  cameraEntity.camera!.toneMapping = pc.TONEMAP_ACES;
  app.scene.exposure = 1;

  const characterRoot = new pc.Entity("animation-preview-character");
  app.root.addChild(characterRoot);

  let studioEnvironment: StudioEnvironmentHandle | null = null;
  let groundGridLines: ReturnType<typeof buildBlocking3dGroundGridLines> = [];

  const cameraState: { azim: number; elev: number; distance: number } = {
    azim: DEFAULT_VIEW.azim,
    elev: DEFAULT_VIEW.elev,
    distance: 3.4,
  };
  const syncCamera = () => {
    const elevation = cameraState.elev * pc.math.DEG_TO_RAD;
    const azimuth = cameraState.azim * pc.math.DEG_TO_RAD;
    const cosElevation = Math.cos(elevation);
    cameraEntity.setPosition(
      Math.sin(azimuth) * cosElevation * cameraState.distance,
      0.9 + Math.sin(-elevation) * cameraState.distance,
      Math.cos(azimuth) * cosElevation * cameraState.distance,
    );
    cameraEntity.setEulerAngles(cameraState.elev, cameraState.azim, 0);
  };
  syncCamera();

  let destroyed = false;
  let dragState: { pointerId: number; x: number } | null = null;

  const onPointerDown = (event: PointerEvent) => {
    if (destroyed || event.button !== 2) return;
    dragState = { pointerId: event.pointerId, x: event.clientX };
    canvas.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: PointerEvent) => {
    if (destroyed || !dragState || event.pointerId !== dragState.pointerId) return;
    const dx = event.clientX - dragState.x;
    dragState.x = event.clientX;
    cameraState.azim = updateBlocking3dCameraAzimuth(cameraState.azim, dx);
    syncCamera();
  };
  const onPointerUp = (event: PointerEvent) => {
    if (!dragState || event.pointerId !== dragState.pointerId) return;
    dragState = null;
    try {
      canvas.releasePointerCapture(event.pointerId);
    } catch {
      /* 指针已释放 */
    }
  };
  const onWheel = (event: WheelEvent) => {
    if (destroyed) return;
    event.preventDefault();
    cameraState.distance = clamp(cameraState.distance * (event.deltaY > 0 ? 1.08 : 0.92), 1, 20);
    syncCamera();
  };
  const onContextMenu = (event: MouseEvent) => event.preventDefault();

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("wheel", onWheel, { passive: false });
  canvas.addEventListener("contextmenu", onContextMenu);

  const resize = () => {
    const rect = canvas.parentElement?.getBoundingClientRect();
    if (!rect) return;
    app.graphicsDevice.maxPixelRatio = Math.min(window.devicePixelRatio || 1, MAX_DEVICE_PIXEL_RATIO);
    app.resizeCanvas(rect.width, rect.height);
  };
  resize();
  const resizeObserver = new ResizeObserver(resize);
  if (canvas.parentElement) resizeObserver.observe(canvas.parentElement);

  const cleanup = () => {
    if (destroyed) return;
    destroyed = true;
    resizeObserver.disconnect();
    canvas.removeEventListener("pointerdown", onPointerDown);
    canvas.removeEventListener("pointermove", onPointerMove);
    canvas.removeEventListener("pointerup", onPointerUp);
    canvas.removeEventListener("wheel", onWheel);
    canvas.removeEventListener("contextmenu", onContextMenu);
    studioEnvironment?.destroy();
    studioEnvironment = null;
    characterRoot.destroy();
    app.destroy();
  };

  options.onStatus?.("正在加载动作");

  let asset: pc.Asset | null = null;
  const ready = (async (): Promise<AnimationPreview> => {
    try {
      const assetPromise = loadAsset(app, options.glbUrl, "container");
      const environmentPromise = loadStudioEnvironment(app);
      const [assetResult, environmentResult] = await Promise.allSettled([
        assetPromise,
        environmentPromise,
      ]);
      if (assetResult.status === "rejected" || environmentResult.status === "rejected") {
        if (assetResult.status === "fulfilled") app.assets.remove(assetResult.value);
        if (environmentResult.status === "fulfilled") environmentResult.value.destroy();
        if (assetResult.status === "rejected") throw assetResult.reason;
        if (environmentResult.status === "rejected") throw environmentResult.reason;
        throw new Error("预览资源加载失败。");
      }
      asset = assetResult.value;
      studioEnvironment = environmentResult.value;
      if (destroyed) throw new Error("预览已关闭。");
      if (!studioEnvironment.hasVisibleBackdrop) {
        throw new Error("HDRI 场景环境加载失败。");
      }
      groundGridLines = buildBlocking3dGroundGridLines(studioEnvironment.settings);

      const resource = asset.resource as ContainerResource | null;
      const model = resource?.instantiateRenderEntity?.({ castShadows: true });
      if (!model) {
        throw new Error("动作文件里没有可显示的角色。");
      }

      // 底部中心落到原点：先在恒等变换下求源几何包围盒，再一次性平移。
      characterRoot.addChild(model);
      app.root.syncHierarchy();
      const bounds = computeSourceBounds(model);
      if (bounds) {
        model.setPosition(-bounds.center[0], -(bounds.center[1] - bounds.halfExtents[1]), -bounds.center[2]);
      }

      const tracks = new Map<string, unknown>();
      for (const clipAsset of resource?.animations ?? []) {
        const track = clipAsset.resource as AnimTrackLike | null;
        if (track && typeof track.name === "string") tracks.set(track.name, track);
      }
      if (tracks.size === 0) {
        throw new Error("动作文件里没有可播放的动作片段。");
      }

      model.addComponent("anim", { activate: true });
      const anim = model.anim as unknown as AnimComponentLike | undefined;
      if (!anim) {
        throw new Error("角色缺少可用的动作组件。");
      }
      anim.rootBone = model;

      const playClip = (clipName: string) => {
        const track = tracks.get(clipName);
        if (!track) {
          options.onError?.(`动作片段「${clipName}」不在当前文件里。`);
          return;
        }
        anim.assignAnimation(clipName, track, 0, 1, true);
        anim.playing = true;
        anim.baseLayer?.play(clipName);
      };
      playClip(options.clipName);
      options.onStatus?.("");

      app.on("update", () => {
        if (destroyed) return;
        drawBlocking3dGroundGrid(app, groundGridLines);
      });
      app.start();

      return {
        play: playClip,
        destroy: cleanup,
      };
    } catch (error) {
      if (asset) {
        app.assets.remove(asset);
        asset = null;
      }
      studioEnvironment?.destroy();
      studioEnvironment = null;
      cleanup();
      throw error;
    }
  })();

  return {
    ready,
    cancel: () => {
      if (asset) app.assets.remove(asset);
      cleanup();
    },
  };
}
