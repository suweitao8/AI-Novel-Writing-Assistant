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

const GROUND_HALF_SIZE = 3;
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
  app.scene.exposure = 1;
  app.scene.ambientLight = new pc.Color(0.42, 0.42, 0.46);

  const cameraEntity = new pc.Entity("animation-preview-camera");
  cameraEntity.addComponent("camera", {
    clearColor: new pc.Color(0.075, 0.09, 0.115),
    fov: DEFAULT_FOV,
    nearClip: 0.05,
    farClip: 200,
  });
  app.root.addChild(cameraEntity);

  const keyLight = new pc.Entity("animation-preview-key-light");
  keyLight.addComponent("light", {
    type: "directional",
    intensity: 1.1,
    castShadows: true,
    shadowBias: 0.35,
    normalOffsetBias: 0.05,
    shadowDistance: 15,
  });
  keyLight.setEulerAngles(48, 32, 0);
  app.root.addChild(keyLight);

  const fillLight = new pc.Entity("animation-preview-fill-light");
  fillLight.addComponent("light", { type: "directional", intensity: 0.32 });
  fillLight.setEulerAngles(-28, -142, 0);
  app.root.addChild(fillLight);

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
    characterRoot.destroy();
    app.destroy();
  };

  options.onStatus?.("正在加载动作");

  let asset: pc.Asset | null = null;
  const ready = (async (): Promise<AnimationPreview> => {
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
      for (let value = -GROUND_HALF_SIZE; value <= GROUND_HALF_SIZE; value += 0.5) {
        const major = Number.isInteger(value) && value % 3 === 0;
        const color = new pc.Color(major ? 0.4 : 0.24, major ? 0.44 : 0.28, major ? 0.52 : 0.36, major ? 0.6 : 0.36);
        app.drawLine(new pc.Vec3(value, 0.004, -GROUND_HALF_SIZE), new pc.Vec3(value, 0.004, GROUND_HALF_SIZE), color, false);
        app.drawLine(new pc.Vec3(-GROUND_HALF_SIZE, 0.004, value), new pc.Vec3(GROUND_HALF_SIZE, 0.004, value), color, false);
      }
    });
    app.start();

    return {
      play: playClip,
      destroy: cleanup,
    };
  })();

  return {
    ready,
    cancel: () => {
      if (asset) app.assets.remove(asset);
      cleanup();
    },
  };
}
