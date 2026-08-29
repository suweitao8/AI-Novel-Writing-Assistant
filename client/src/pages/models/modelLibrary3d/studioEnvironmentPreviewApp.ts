import * as pc from "playcanvas";

import {
  clamp,
  DEFAULT_FOV,
  MAX_DEVICE_PIXEL_RATIO,
  updateBlocking3dCameraAzimuth,
} from "@/pages/drama/comicDrama/components/blocking3d";
import {
  DEFAULT_STUDIO_ENVIRONMENT_PRESET_ID,
  getStudioEnvironmentDiameterMeters,
  getStudioEnvironmentDiameterPreference,
  getStudioEnvironmentRadiusMeters,
  getStudioEnvironmentPreset,
  saveStudioEnvironmentDiameterPreference,
  type StudioEnvironmentPresetId,
} from "./studioEnvironmentPresets";
import { loadStudioEnvironment, type StudioEnvironmentHandle } from "./studioEnvironmentRuntime";

export interface StudioEnvironmentPreviewOptions {
  canvas: HTMLCanvasElement;
  environmentPresetId?: StudioEnvironmentPresetId;
  environmentDiameterMeters?: number;
  onStatus?: (status: string) => void;
}

export interface StudioEnvironmentPreview {
  readonly canvas: HTMLCanvasElement;
  getEnvironmentPreset: () => StudioEnvironmentPresetId;
  getEnvironmentDiameter: () => number;
  setEnvironmentPreset: (presetId: StudioEnvironmentPresetId) => Promise<boolean>;
  setEnvironmentDiameter: (diameterMeters: number) => Promise<boolean>;
  resetView: () => void;
  destroy: () => void;
}

interface OrbitState {
  azim: number;
  elev: number;
  distance: number;
  focalPoint: [number, number, number];
}

const DEFAULT_VIEW = {
  azim: -35,
  elev: -12,
  focalPoint: [0, 1.15, 0] as [number, number, number],
} as const;

/**
 * 独立的 HDRI 预览视口：只创建相机和共享的有限半球环境，不放入模型、
 * 角色或道具。这样用户调节直径时看到的是纯环境的覆盖范围与投影效果。
 */
export async function createStudioEnvironmentPreview(
  options: StudioEnvironmentPreviewOptions,
): Promise<StudioEnvironmentPreview> {
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

  const cameraEntity = new pc.Entity("studio-environment-preview-camera");
  cameraEntity.addComponent("camera", {
    clearColor: new pc.Color(0.075, 0.09, 0.115),
    fov: DEFAULT_FOV,
    nearClip: 0.05,
    farClip: 200,
  });
  app.root.addChild(cameraEntity);
  const camera = cameraEntity.camera!;
  // envAtlas 只负责环境光；可见内容交给有限半球，避免无限天空盒盖掉直径变化。
  camera.layers = camera.layers.filter((layerId) => layerId !== pc.LAYERID_SKYBOX);

  const { setupStudioLighting } = await import("./studioLighting");
  setupStudioLighting(app, camera, { castShadows: false });

  let destroyed = false;
  let environmentRequestId = 0;
  let currentEnvironment: StudioEnvironmentHandle | null = null;
  const initialPresetId = options.environmentPresetId ?? DEFAULT_STUDIO_ENVIRONMENT_PRESET_ID;
  let currentPresetId = initialPresetId;
  let currentDiameterMeters = getStudioEnvironmentDiameterMeters(
    options.environmentDiameterMeters ?? getStudioEnvironmentDiameterPreference(initialPresetId),
  );
  let currentRadiusMeters = getStudioEnvironmentRadiusMeters(currentDiameterMeters);

  const cameraState: OrbitState = {
    ...DEFAULT_VIEW,
    distance: 3,
    focalPoint: [...DEFAULT_VIEW.focalPoint],
  };

  const getCameraMaxDistance = () => Math.max(0.5, currentRadiusMeters * 0.85);
  const getDefaultCameraDistance = () => clamp(
    Math.max(1.25, currentRadiusMeters * 0.55),
    0.35,
    getCameraMaxDistance(),
  );

  const syncCamera = () => {
    const elevation = cameraState.elev * pc.math.DEG_TO_RAD;
    const azimuth = cameraState.azim * pc.math.DEG_TO_RAD;
    const cosElevation = Math.cos(elevation);
    cameraState.distance = clamp(cameraState.distance, 0.35, getCameraMaxDistance());
    cameraEntity.setPosition(
      cameraState.focalPoint[0] + Math.sin(azimuth) * cosElevation * cameraState.distance,
      cameraState.focalPoint[1] + Math.sin(-elevation) * cameraState.distance,
      cameraState.focalPoint[2] + Math.cos(azimuth) * cosElevation * cameraState.distance,
    );
    cameraEntity.setEulerAngles(cameraState.elev, cameraState.azim, 0);
  };

  const loadEnvironmentPreset = async (
    presetId: StudioEnvironmentPresetId,
    diameterMeters?: number,
  ): Promise<boolean> => {
    if (destroyed) return false;
    const requestId = ++environmentRequestId;
    const preset = getStudioEnvironmentPreset(presetId);
    const nextDiameterMeters = getStudioEnvironmentDiameterMeters(
      diameterMeters ?? getStudioEnvironmentDiameterPreference(presetId) ?? preset.diameterMeters,
    );
    options.onStatus?.("正在加载 HDRI 环境");
    let nextEnvironment: StudioEnvironmentHandle;
    try {
      nextEnvironment = await loadStudioEnvironment(app, presetId, {
        diameterMeters: nextDiameterMeters,
      });
    } catch {
      if (requestId === environmentRequestId) options.onStatus?.("HDRI 环境加载失败");
      return false;
    }
    if (destroyed || requestId !== environmentRequestId) {
      nextEnvironment.destroy();
      return false;
    }
    if (!nextEnvironment.hasVisibleBackdrop) {
      nextEnvironment.destroy();
      options.onStatus?.("HDRI 环境加载失败");
      return false;
    }
    const previousEnvironment = currentEnvironment;
    currentEnvironment = nextEnvironment;
    currentPresetId = nextEnvironment.presetId;
    currentDiameterMeters = nextEnvironment.diameterMeters;
    currentRadiusMeters = nextEnvironment.radiusMeters;
    saveStudioEnvironmentDiameterPreference(nextEnvironment.presetId, nextEnvironment.diameterMeters);
    previousEnvironment?.destroy();
    syncCamera();
    options.onStatus?.("");
    return true;
  };

  const panCamera = (dx: number, dy: number) => {
    const azimuth = cameraState.azim * pc.math.DEG_TO_RAD;
    const elevation = cameraState.elev * pc.math.DEG_TO_RAD;
    const cosElevation = Math.cos(elevation);
    const screenRight = new pc.Vec3(Math.cos(azimuth), 0, -Math.sin(azimuth));
    const screenUp = new pc.Vec3(
      Math.sin(azimuth) * Math.sin(elevation),
      cosElevation,
      Math.cos(azimuth) * Math.sin(elevation),
    );
    const scale = clamp(cameraState.distance * 0.00125, 0.003, 0.04);
    cameraState.focalPoint = [
      clamp(cameraState.focalPoint[0] + (-screenRight.x * dx + screenUp.x * dy) * scale, -60, 60),
      clamp(cameraState.focalPoint[1] + (-screenRight.y * dx + screenUp.y * dy) * scale, -60, 60),
      clamp(cameraState.focalPoint[2] + (-screenRight.z * dx + screenUp.z * dy) * scale, -60, 60),
    ];
    syncCamera();
  };

  let dragState: { button: number; pointerId: number; x: number; y: number } | null = null;
  const onPointerDown = (event: PointerEvent) => {
    if (destroyed) return;
    canvas.focus();
    dragState = { button: event.button, pointerId: event.pointerId, x: event.clientX, y: event.clientY };
    canvas.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: PointerEvent) => {
    if (destroyed || !dragState || event.pointerId !== dragState.pointerId) return;
    const dx = event.clientX - dragState.x;
    const dy = event.clientY - dragState.y;
    dragState.x = event.clientX;
    dragState.y = event.clientY;
    if (dragState.button === 0) {
      cameraState.azim = updateBlocking3dCameraAzimuth(cameraState.azim, dx);
      cameraState.elev = clamp(cameraState.elev + dy * 0.25, -80, 80);
      syncCamera();
    } else if (dragState.button === 1 || dragState.button === 2) {
      panCamera(dx, dy);
    }
  };
  const onPointerUp = (event: PointerEvent) => {
    if (!dragState || event.pointerId !== dragState.pointerId) return;
    dragState = null;
    try {
      canvas.releasePointerCapture(event.pointerId);
    } catch {
      /* 指针已经释放 */
    }
  };
  const onWheel = (event: WheelEvent) => {
    if (destroyed) return;
    event.preventDefault();
    cameraState.distance = clamp(
      cameraState.distance * (event.deltaY > 0 ? 1.08 : 0.92),
      0.35,
      getCameraMaxDistance(),
    );
    syncCamera();
  };
  const onContextMenu = (event: MouseEvent) => event.preventDefault();

  canvas.tabIndex = 0;
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerUp);
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
  syncCamera();
  app.start();

  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    environmentRequestId += 1;
    currentEnvironment?.destroy();
    currentEnvironment = null;
    resizeObserver.disconnect();
    canvas.removeEventListener("pointerdown", onPointerDown);
    canvas.removeEventListener("pointermove", onPointerMove);
    canvas.removeEventListener("pointerup", onPointerUp);
    canvas.removeEventListener("pointercancel", onPointerUp);
    canvas.removeEventListener("wheel", onWheel);
    canvas.removeEventListener("contextmenu", onContextMenu);
    app.destroy();
  };

  const loaded = await loadEnvironmentPreset(initialPresetId, currentDiameterMeters);
  if (!loaded) {
    destroy();
    throw new Error("HDRI 环境加载失败。");
  }
  cameraState.distance = getDefaultCameraDistance();
  syncCamera();

  return {
    canvas,
    getEnvironmentPreset() {
      return currentPresetId;
    },
    getEnvironmentDiameter() {
      return currentDiameterMeters;
    },
    setEnvironmentPreset(presetId) {
      return loadEnvironmentPreset(presetId);
    },
    setEnvironmentDiameter(diameterMeters) {
      return loadEnvironmentPreset(currentPresetId, diameterMeters);
    },
    resetView() {
      cameraState.azim = DEFAULT_VIEW.azim;
      cameraState.elev = DEFAULT_VIEW.elev;
      cameraState.focalPoint = [...DEFAULT_VIEW.focalPoint];
      cameraState.distance = getDefaultCameraDistance();
      syncCamera();
    },
    destroy,
  };
}
