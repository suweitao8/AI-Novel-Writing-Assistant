import * as pc from "playcanvas";

import {
  clamp,
  createMaterial,
  createPlane,
  DEFAULT_FOV,
  loadAsset,
  MAX_DEVICE_PIXEL_RATIO,
  updateBlocking3dCameraAzimuth,
  type ContainerResource,
} from "@/pages/drama/comicDrama/components/blocking3d";
import { computeSourceBounds } from "@/pages/models/modelLibrary3d/modelViewerApp";
import { attachStudioBackdrop } from "@/pages/models/modelLibrary3d/studioBackdrop";
import { setupStudioLighting, upgradeStudioEnvironment } from "@/pages/models/modelLibrary3d/studioLighting";

export interface AnimationPreviewOptions {
  canvas: HTMLCanvasElement;
  /** 角色 + 动作片段所在的 GLB 地址。 */
  glbUrl: string;
  /** 初始播放的动作片段名。 */
  clipName: string;
  /** 打开页面时从已保存关键帧恢复到的时间。 */
  initialTimeSeconds?: number;
  onStatus?: (status: string) => void;
  /** 片段加载或播放出错（切换片段失败等）。 */
  onError?: (message: string) => void;
  /** 播放或拖动时间轴时回传当前时间、时长和播放状态。 */
  onTimeChange?: (timeSeconds: number, durationSeconds: number, playing: boolean) => void;
}

export interface AnimationPreview {
  /** 切换播放的动作片段（同一 GLB 内）。 */
  play: (clipName?: string) => void;
  pause: () => void;
  setTime: (timeSeconds: number) => void;
  getTime: () => number;
  getDuration: () => number;
  isPlaying: () => boolean;
  fitView: () => void;
  resetView: () => void;
  /** 抓取当前已渲染帧，返回适合动画卡片使用的 JPEG data URL。 */
  capturePreviewFrame: () => string;
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
  duration?: unknown;
}

interface AnimLayerLike {
  play: (name: string) => void;
  pause?: () => void;
  activeStateCurrentTime?: number;
  activeStateDuration?: number;
}

interface AnimComponentLike {
  baseLayer?: AnimLayerLike | null;
  playing: boolean;
  rootBone: unknown;
  assignAnimation: (name: string, track: unknown, layer?: number, speed?: number, loop?: boolean) => void;
}

interface CameraState {
  azim: number;
  elev: number;
  distance: number;
  focalPoint: [number, number, number];
}

const GROUND_HALF_SIZE = 5;
const CAPTURE_SIZE = { width: 640, height: 360 } as const;
const DEFAULT_VIEW = { azim: -35, elev: -12 } as const;

/**
 * 动画库完整预览器：加载「角色 + 动作片段」统一 GLB，使用模型库相同的
 * HDR 棚拍环境，并提供时间轴、关键帧截图和基础 Orbit 相机控制。
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
  const camera = cameraEntity.camera!;
  // envAtlas 只负责光照，摄影棚穹顶负责可视背景，避免天空层与穹顶重叠。
  camera.layers = camera.layers.filter((layerId) => layerId !== pc.LAYERID_SKYBOX);
  setupStudioLighting(app, camera, { castShadows: true });

  let studioEnvDisposed = false;
  let studioEnvCleanup: (() => void) | null = null;
  let studioBackdropCleanup: (() => void) | null = null;
  const disposeStudioEnv = () => {
    studioEnvDisposed = true;
    studioEnvCleanup?.();
    studioBackdropCleanup?.();
    studioEnvCleanup = null;
    studioBackdropCleanup = null;
  };
  void upgradeStudioEnvironment(app).then((cleanup) => {
    if (studioEnvDisposed) {
      cleanup();
      return;
    }
    studioEnvCleanup = cleanup;
  });
  void attachStudioBackdrop(app, { camera: cameraEntity, radius: 12 }).then((handle) => {
    if (!handle) return;
    if (studioEnvDisposed) {
      handle.destroy();
      return;
    }
    studioBackdropCleanup = handle.destroy;
  });

  const ground = createPlane(
    app,
    "animation-preview-ground",
    [0, -0.01, 0],
    [GROUND_HALF_SIZE * 2, 1, GROUND_HALF_SIZE * 2],
    createMaterial(new pc.Color(0.12, 0.15, 0.19)),
  );
  ground.render!.receiveShadows = true;

  const characterRoot = new pc.Entity("animation-preview-character");
  app.root.addChild(characterRoot);

  const cameraState: CameraState = {
    azim: DEFAULT_VIEW.azim,
    elev: DEFAULT_VIEW.elev,
    distance: 3.4,
    focalPoint: [0, 0.85, 0],
  };
  const syncCamera = () => {
    const elevation = cameraState.elev * pc.math.DEG_TO_RAD;
    const azimuth = cameraState.azim * pc.math.DEG_TO_RAD;
    const cosElevation = Math.cos(elevation);
    const distance = cameraState.distance;
    cameraEntity.setPosition(
      cameraState.focalPoint[0] + Math.sin(azimuth) * cosElevation * distance,
      cameraState.focalPoint[1] + Math.sin(-elevation) * distance,
      cameraState.focalPoint[2] + Math.cos(azimuth) * cosElevation * distance,
    );
    cameraEntity.setEulerAngles(cameraState.elev, cameraState.azim, 0);
  };
  syncCamera();

  let modelCenterY = 0.85;
  let modelRadius = 0.85;
  const fitCameraTo = (centerY: number, radius: number) => {
    const fovRad = DEFAULT_FOV * pc.math.DEG_TO_RAD;
    cameraState.focalPoint = [0, centerY, 0];
    cameraState.distance = clamp((Math.max(radius, 0.25) / Math.sin(fovRad / 2)) * 1.3, 1, 60);
    syncCamera();
  };
  const fitView = () => fitCameraTo(modelCenterY, modelRadius);
  const resetView = () => {
    cameraState.azim = DEFAULT_VIEW.azim;
    cameraState.elev = DEFAULT_VIEW.elev;
    fitView();
  };

  let destroyed = false;
  let dragState: { button: number; pointerId: number; x: number; y: number } | null = null;

  const onPointerDown = (event: PointerEvent) => {
    if (destroyed) return;
    if (event.button !== 2) return;
    dragState = { button: event.button, pointerId: event.pointerId, x: event.clientX, y: event.clientY };
    canvas.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: PointerEvent) => {
    if (destroyed || !dragState || event.pointerId !== dragState.pointerId) return;
    const dx = event.clientX - dragState.x;
    const dy = event.clientY - dragState.y;
    dragState.x = event.clientX;
    dragState.y = event.clientY;
    cameraState.azim = updateBlocking3dCameraAzimuth(cameraState.azim, dx);
    cameraState.elev = clamp(cameraState.elev + dy * 0.25, -89, 89);
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
    cameraState.distance = clamp(cameraState.distance * (event.deltaY > 0 ? 1.08 : 0.92), 1, 60);
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

  let asset: pc.Asset | null = null;
  const cleanup = () => {
    if (destroyed) return;
    destroyed = true;
    resizeObserver.disconnect();
    canvas.removeEventListener("pointerdown", onPointerDown);
    canvas.removeEventListener("pointermove", onPointerMove);
    canvas.removeEventListener("pointerup", onPointerUp);
    canvas.removeEventListener("wheel", onWheel);
    canvas.removeEventListener("contextmenu", onContextMenu);
    if (asset) app.assets.remove(asset);
    characterRoot.destroy();
    disposeStudioEnv();
    app.destroy();
  };

  options.onStatus?.("正在加载动作");

  const ready = (async (): Promise<AnimationPreview> => {
    try {
      asset = await loadAsset(app, options.glbUrl, "container");
      if (destroyed) throw new Error("预览已关闭。");

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
        modelCenterY = bounds.halfExtents[1];
        modelRadius = Math.hypot(bounds.halfExtents[0], bounds.halfExtents[1], bounds.halfExtents[2]);
      }
      fitView();

      const tracks = new Map<string, AnimTrackLike>();
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

      let activeClipName = options.clipName;
      let currentTime = 0;
      let durationSeconds = 0;

      const readDuration = (track: AnimTrackLike | null): number => {
        const trackDuration = typeof track?.duration === "number" ? track.duration : 0;
        const layerDuration = typeof anim.baseLayer?.activeStateDuration === "number"
          ? anim.baseLayer.activeStateDuration
          : 0;
        return Math.max(trackDuration, layerDuration, 0);
      };
      const clampTime = (timeSeconds: number) => {
        if (!Number.isFinite(timeSeconds)) return 0;
        return durationSeconds > 0
          ? clamp(timeSeconds, 0, durationSeconds)
          : Math.max(0, timeSeconds);
      };
      const readCurrentTime = () => {
        const layerTime = anim.baseLayer?.activeStateCurrentTime;
        if (typeof layerTime === "number" && Number.isFinite(layerTime)) {
          currentTime = durationSeconds > 0 ? clamp(layerTime, 0, durationSeconds) : Math.max(0, layerTime);
        }
        return currentTime;
      };
      const notifyTime = () => {
        options.onTimeChange?.(readCurrentTime(), durationSeconds, anim.playing);
      };
      const applyTime = (timeSeconds: number) => {
        currentTime = clampTime(timeSeconds);
        if (anim.baseLayer && typeof anim.baseLayer.activeStateCurrentTime === "number") {
          anim.baseLayer.activeStateCurrentTime = currentTime;
        }
        app.render();
        notifyTime();
      };

      const playClip = (clipName = activeClipName) => {
        const track = tracks.get(clipName);
        if (!track) {
          options.onError?.(`动作片段「${clipName}」不在当前文件里。`);
          return;
        }
        activeClipName = clipName;
        anim.assignAnimation(clipName, track, 0, 1, true);
        durationSeconds = readDuration(track);
        anim.playing = true;
        anim.baseLayer?.play(clipName);
        applyTime(currentTime);
      };

      const pause = () => {
        readCurrentTime();
        anim.playing = false;
        anim.baseLayer?.pause?.();
        notifyTime();
      };
      const setTime = (timeSeconds: number) => {
        anim.playing = false;
        anim.baseLayer?.pause?.();
        applyTime(timeSeconds);
      };
      const getTime = () => readCurrentTime();
      const getDuration = () => durationSeconds;
      const isPlaying = () => anim.playing;
      const capturePreviewFrame = () => {
        if (destroyed) throw new Error("预览已关闭。");
        app.render();
        const target = document.createElement("canvas");
        target.width = CAPTURE_SIZE.width;
        target.height = CAPTURE_SIZE.height;
        const context = target.getContext("2d");
        if (!context) throw new Error("无法创建关键帧截图。");
        context.drawImage(canvas, 0, 0, CAPTURE_SIZE.width, CAPTURE_SIZE.height);
        return target.toDataURL("image/jpeg", 0.86);
      };

      playClip(options.clipName);
      if (typeof options.initialTimeSeconds === "number") {
        const initialTime = options.initialTimeSeconds;
        applyTime(initialTime);
        anim.playing = true;
        anim.baseLayer?.play(activeClipName);
        notifyTime();
      }
      options.onStatus?.("");

      app.on("update", () => {
        if (destroyed) return;
        for (let value = -GROUND_HALF_SIZE; value <= GROUND_HALF_SIZE; value += 0.5) {
          const major = Number.isInteger(value) && value % 3 === 0;
          const color = new pc.Color(
            major ? 0.4 : 0.24,
            major ? 0.44 : 0.28,
            major ? 0.52 : 0.36,
            major ? 0.6 : 0.36,
          );
          app.drawLine(
            new pc.Vec3(value, 0.004, -GROUND_HALF_SIZE),
            new pc.Vec3(value, 0.004, GROUND_HALF_SIZE),
            color,
            false,
          );
          app.drawLine(
            new pc.Vec3(-GROUND_HALF_SIZE, 0.004, value),
            new pc.Vec3(GROUND_HALF_SIZE, 0.004, value),
            color,
            false,
          );
        }
        if (anim.playing) notifyTime();
      });
      app.start();

      return {
        play: playClip,
        pause,
        setTime,
        getTime,
        getDuration,
        isPlaying,
        fitView,
        resetView,
        capturePreviewFrame,
        destroy: cleanup,
      };
    } catch (error) {
      cleanup();
      throw error;
    }
  })();

  return {
    ready,
    cancel: cleanup,
  };
}
