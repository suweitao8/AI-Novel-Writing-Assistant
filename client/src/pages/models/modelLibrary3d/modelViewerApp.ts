import * as pc from "playcanvas";

import type { InspectorTransformValue } from "@/pages/drama/comicDrama/components/editor3d";
import { applyModelMaterials, type ModelMaterialMap } from "./modelMaterials";
import {
  DEFAULT_STUDIO_ENVIRONMENT_PRESET_ID,
  getStudioEnvironmentDiameterMeters,
  getStudioEnvironmentDiameterPreference,
  getStudioEnvironmentRadiusMeters,
  getStudioEnvironmentPreset,
  saveStudioEnvironmentDiameterPreference,
  type StudioEnvironmentPresetId,
} from "./studioEnvironmentPresets";
import {
  loadStudioEnvironment,
  type StudioEnvironmentHandle,
} from "./studioEnvironmentRuntime";
import {
  buildBlocking3dGroundGridLines,
  createBlocking3dTransformGizmo,
  clamp,
  DEFAULT_FOV,
  drawBlocking3dGroundGrid,
  loadAsset,
  MAX_DEVICE_PIXEL_RATIO,
  normalizeEnvironmentSettings,
  updateBlocking3dCameraAzimuth,
  wrapBlocking3dAzimuth,
  type Blocking3dTransformTool,
  type ContainerResource,
} from "@/pages/drama/comicDrama/components/blocking3d";

export type ModelViewerTool = Blocking3dTransformTool;

export interface ModelViewerOptions {
  canvas: HTMLCanvasElement;
  modelUrl: string;
  /** 源文件几何单位到米的换算；UE 静态网格（厘米）传 0.01。 */
  unitScale?: number;
  /** 材质回填映射（GLB 里只有 FBX 占位材质，无贴图）。 */
  materials?: ModelMaterialMap;
  /** 模型预览使用的固定 HDRI 环境预设。 */
  environmentPresetId?: StudioEnvironmentPresetId;
  /** 当前模型预览的半球直径，统一限制为 5–30 米。 */
  environmentDiameterMeters?: number;
  onStatus?: (status: string) => void;
  /** gizmo 拖拽过程中的实时回读（面板数值跟手）。 */
  onTransformLive?: () => void;
  /** gizmo 拖拽结束（数值定格）。 */
  onTransformCommit?: () => void;
}

export interface ModelViewer {
  readonly canvas: HTMLCanvasElement;
  fitView: () => void;
  resetView: () => void;
  setTransformTool: (tool: ModelViewerTool | null) => void;
  getTransformTool: () => ModelViewerTool | null;
  getTransform: () => InspectorTransformValue;
  setTransform: (patch: Partial<InspectorTransformValue>) => boolean;
  getEnvironmentPreset: () => StudioEnvironmentPresetId;
  getEnvironmentDiameter: () => number;
  setEnvironmentPreset: (presetId: StudioEnvironmentPresetId) => Promise<boolean>;
  setEnvironmentDiameter: (diameterMeters: number) => Promise<boolean>;
  capturePng: () => Blob;
  destroy: () => void;
}

const CAPTURE_SIZE = { width: 1280, height: 720 } as const;
const DEFAULT_VIEW = { azim: -35, elev: -18 } as const;

interface SourceBounds {
  /** 源几何包围盒中心（源单位）。 */
  center: [number, number, number];
  /** 源几何包围盒半尺寸（源单位）。 */
  halfExtents: [number, number, number];
}

/**
 * 从 mesh 局部包围盒按节点世界矩阵变换 8 个角点后求并集。
 * GLB 的子节点可能带偏移变换，直接并集 mesh 局部盒会漏掉节点偏移；
 * 调用前需要 app.root.syncHierarchy() 让世界矩阵生效。
 */
export function computeSourceBounds(entity: pc.Entity): SourceBounds | null {
  let minX = 0;
  let minY = 0;
  let minZ = 0;
  let maxX = 0;
  let maxY = 0;
  let maxZ = 0;
  let first = true;
  const corner = new pc.Vec3();
  const absorb = (x: number, y: number, z: number) => {
    if (first) {
      minX = x; minY = y; minZ = z;
      maxX = x; maxY = y; maxZ = z;
      first = false;
      return;
    }
    minX = Math.min(minX, x); minY = Math.min(minY, y); minZ = Math.min(minZ, z);
    maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); maxZ = Math.max(maxZ, z);
  };
  for (const render of entity.findComponents("render") as pc.RenderComponent[]) {
    for (const meshInstance of render.meshInstances ?? []) {
      const aabb = meshInstance.mesh?.aabb;
      const world = meshInstance.node?.getWorldTransform();
      if (!aabb || !world) continue;
      const cx = aabb.center.x;
      const cy = aabb.center.y;
      const cz = aabb.center.z;
      const hx = aabb.halfExtents.x;
      const hy = aabb.halfExtents.y;
      const hz = aabb.halfExtents.z;
      for (let ix = -1; ix <= 1; ix += 2) {
        for (let iy = -1; iy <= 1; iy += 2) {
          for (let iz = -1; iz <= 1; iz += 2) {
            corner.set(cx + ix * hx, cy + iy * hy, cz + iz * hz);
            world.transformPoint(corner, corner);
            absorb(corner.x, corner.y, corner.z);
          }
        }
      }
    }
  }
  if (first) return null;
  return {
    center: [(minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2],
    halfExtents: [(maxX - minX) / 2, (maxY - minY) / 2, (maxZ - minZ) / 2],
  };
}

interface OrbitState {
  azim: number;
  elev: number;
  distance: number;
  focalPoint: [number, number, number];
}

/**
 * 模型库 3D 编辑器：单个 GLB 模型的查看与变换编辑。
 * 结构与漫剧 3D 编辑器同一套 Orbit 相机 + 引擎 gizmo 方案，
 * 但不承载角色/场景状态，模型导入后自动按真实比例落地居中。
 */
export async function createModelViewer(options: ModelViewerOptions): Promise<ModelViewer> {
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

  const cameraEntity = new pc.Entity("model-editor-camera");
  cameraEntity.addComponent("camera", {
    clearColor: new pc.Color(0.075, 0.09, 0.115),
    fov: DEFAULT_FOV,
    nearClip: 0.05,
    farClip: 200,
  });
  app.root.addChild(cameraEntity);
  const camera = cameraEntity.camera!;
  // PlayCanvas 会把 scene.envAtlas 当作内建无限天空球渲染；这里与漫剧 3D
  // 场景一致，把 SKYBOX 层从相机移除——envAtlas 只承担光照，可视背景只留
  // 半圆球穹顶。
  camera.layers = camera.layers.filter((layerId) => layerId !== pc.LAYERID_SKYBOX);
  camera.toneMapping = pc.TONEMAP_ACES;
  app.scene.exposure = 1;
  // HDRI 环境异步装配；环境资源的生命周期与模型查看器绑定，避免切换或
  // 销毁时留下漂浮穹顶。
  const initialEnvironmentPresetId =
    options.environmentPresetId ?? DEFAULT_STUDIO_ENVIRONMENT_PRESET_ID;
  let destroyed = false;
  let studioEnvironmentRequestId = 0;
  // 每个 loadStudioEnvironment 都拥有自己的 blocking3d runtime，但它们最终
  // 共享 app.scene.envAtlas；串行化切换，避免旧请求在新请求之后写回全局环境光。
  let studioEnvironmentLoadQueue: Promise<void> = Promise.resolve();
  let currentStudioEnvironment: StudioEnvironmentHandle | null = null;
  let currentEnvironmentPresetId = initialEnvironmentPresetId;
  let currentEnvironmentDiameterMeters = getStudioEnvironmentDiameterMeters(
    options.environmentDiameterMeters ?? getStudioEnvironmentDiameterPreference(initialEnvironmentPresetId),
  );
  let currentEnvironmentRadiusMeters = getStudioEnvironmentRadiusMeters(currentEnvironmentDiameterMeters);
  let currentEnvironmentSettings = normalizeEnvironmentSettings({
    radiusMeters: currentEnvironmentRadiusMeters,
  });
  let environmentGridLines = buildBlocking3dGroundGridLines(currentEnvironmentSettings);

  const disposeStudioEnvironment = () => {
    studioEnvironmentRequestId += 1;
    currentStudioEnvironment?.destroy();
    currentStudioEnvironment = null;
  };

  // modelRoot 承载用户编辑的 transform（gizmo 目标）；modelAdjust 把源模型
  // 换算到米并平移到底部中心落在原点，导入即「落地居中」。
  const modelRoot = new pc.Entity("model-root");
  app.root.addChild(modelRoot);
  const modelAdjust = new pc.Entity("model-adjust");
  modelRoot.addChild(modelAdjust);

  const cameraState: OrbitState = {
    azim: DEFAULT_VIEW.azim,
    elev: DEFAULT_VIEW.elev,
    distance: 4,
    focalPoint: [0, 0.5, 0],
  };

  const getCameraMaxDistance = () => Math.max(0.35, currentEnvironmentRadiusMeters * 0.85);

  const syncCamera = () => {
    const elevation = cameraState.elev * pc.math.DEG_TO_RAD;
    const azimuth = cameraState.azim * pc.math.DEG_TO_RAD;
    const cosElevation = Math.cos(elevation);
    const distance = clamp(cameraState.distance, 0.2, getCameraMaxDistance());
    cameraState.distance = distance;
    cameraEntity.setPosition(
      cameraState.focalPoint[0] + Math.sin(azimuth) * cosElevation * distance,
      cameraState.focalPoint[1] + Math.sin(-elevation) * distance,
      cameraState.focalPoint[2] + Math.cos(azimuth) * cosElevation * distance,
    );
    cameraEntity.setEulerAngles(cameraState.elev, cameraState.azim, 0);
  };
  syncCamera();

  const loadEnvironmentPreset = (
    presetId: StudioEnvironmentPresetId,
    diameterMeters?: number,
  ): Promise<boolean> => {
    const requestId = ++studioEnvironmentRequestId;
    const run = async (): Promise<boolean> => {
      if (destroyed) return false;
      const preset = getStudioEnvironmentPreset(presetId);
      const nextDiameterMeters = getStudioEnvironmentDiameterMeters(
        diameterMeters ?? getStudioEnvironmentDiameterPreference(presetId) ?? preset.diameterMeters,
      );
      let nextEnvironment: StudioEnvironmentHandle;
      try {
        nextEnvironment = await loadStudioEnvironment(app, presetId, {
          diameterMeters: nextDiameterMeters,
        });
      } catch {
        return false;
      }
      if (destroyed || requestId !== studioEnvironmentRequestId) {
        nextEnvironment.destroy();
        return false;
      }
      if (!nextEnvironment.hasVisibleBackdrop) {
        nextEnvironment.destroy();
        return false;
      }
      const previousEnvironment = currentStudioEnvironment;
      currentStudioEnvironment = nextEnvironment;
      currentEnvironmentPresetId = nextEnvironment.presetId;
      currentEnvironmentDiameterMeters = nextEnvironment.diameterMeters;
      currentEnvironmentRadiusMeters = nextEnvironment.radiusMeters;
      currentEnvironmentSettings = nextEnvironment.settings;
      environmentGridLines = buildBlocking3dGroundGridLines(currentEnvironmentSettings);
      saveStudioEnvironmentDiameterPreference(nextEnvironment.presetId, nextEnvironment.diameterMeters);
      previousEnvironment?.destroy();
      syncCamera();
      return true;
    };
    const result = studioEnvironmentLoadQueue.then(run, run);
    studioEnvironmentLoadQueue = result.then(() => undefined, () => undefined);
    return result;
  };

  let gizmoDragging = false;
  const transformGizmo = createBlocking3dTransformGizmo(app, camera, {
    onTransformStart: () => {
      gizmoDragging = true;
    },
    onTransformMove: () => {
      options.onTransformLive?.();
    },
    onTransformEnd: () => {
      gizmoDragging = false;
      options.onTransformCommit?.();
    },
  });
  transformGizmo.setTool("translate");
  transformGizmo.attach(modelRoot);

  // 模型在 modelRoot 本地空间里的显示尺寸（米），用于取景。
  let modelCenterY = 0.5;
  let modelRadius = 0.5;

  const fitCameraTo = (centerY: number, radius: number) => {
    const fovRad = DEFAULT_FOV * pc.math.DEG_TO_RAD;
    cameraState.focalPoint = [modelRoot.getPosition().x, centerY, modelRoot.getPosition().z];
    cameraState.distance = clamp(
      (Math.max(radius, 0.25) / Math.sin(fovRad / 2)) * 1.3,
      0.35,
      getCameraMaxDistance(),
    );
    syncCamera();
  };

  const fitView = () => {
    // 包围球半径与 Y 轴旋转无关，可以直接用 modelRoot 的位置 + 本地中心高度取景。
    const scale = modelRoot.getLocalScale().x;
    const position = modelRoot.getPosition();
    fitCameraTo(position.y + modelCenterY * scale, modelRadius * scale);
  };

  const resetView = () => {
    cameraState.azim = DEFAULT_VIEW.azim;
    cameraState.elev = DEFAULT_VIEW.elev;
    syncCamera();
    fitView();
  };

  options.onStatus?.("正在加载模型");

  let asset: pc.Asset;
  try {
    asset = await loadAsset(app, options.modelUrl, "container");
  } catch (error) {
    // 加载失败时不能把 WebGL 上下文留在页面上。
    destroyed = true;
    disposeStudioEnvironment();
    app.destroy();
    throw error;
  }
  const resource = asset.resource as ContainerResource | null;
  const inner = resource?.instantiateRenderEntity?.({ castShadows: true });
  if (!inner) {
    app.assets.remove(asset);
    destroyed = true;
    disposeStudioEnvironment();
    app.destroy();
    throw new Error("模型文件里没有可显示的网格。");
  }

  const unitScale = options.unitScale && options.unitScale > 0 ? options.unitScale : 1;
  // 先在恒等变换下求源几何的世界包围盒（节点偏移参与计算），再一次性
  // 应用「米换算 + 底部中心落原点」的偏移。
  modelAdjust.addChild(inner);
  app.root.syncHierarchy();
  const bounds = computeSourceBounds(inner);
  modelAdjust.setLocalScale(unitScale, unitScale, unitScale);
  if (bounds) {
    modelAdjust.setPosition(
      -bounds.center[0] * unitScale,
      -(bounds.center[1] - bounds.halfExtents[1]) * unitScale,
      -bounds.center[2] * unitScale,
    );
    modelCenterY = bounds.halfExtents[1] * unitScale;
    modelRadius = Math.hypot(bounds.halfExtents[0], bounds.halfExtents[1], bounds.halfExtents[2]) * unitScale;
  } else {
    modelAdjust.setPosition(0, 0, 0);
    modelCenterY = 0.5;
    modelRadius = 0.5;
  }
  fitView();
  options.onStatus?.("");
  // 回填真实外观：GLB 里只有 FBX 占位材质，贴图异步加载完成后模型换上纹理。
  void applyModelMaterials(app, modelRoot, options.materials);

  // ── 相机导航：右键环绕 / 中键平移 / 滚轮缩放 / WASD+QE 飞行 ──
  let keyboardInput = new Set<string>();
  let dragState: { button: number; pointerId: number; x: number; y: number } | null = null;

  const moveCamera = (dx: number, dy: number, dz: number) => {
    cameraState.focalPoint = [
      clamp(cameraState.focalPoint[0] + dx, -60, 60),
      clamp(cameraState.focalPoint[1] + dy, -60, 60),
      clamp(cameraState.focalPoint[2] + dz, -60, 60),
    ];
    syncCamera();
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
    moveCamera(
      (-screenRight.x * dx + screenUp.x * dy) * scale,
      (-screenRight.y * dx + screenUp.y * dy) * scale,
      (-screenRight.z * dx + screenUp.z * dy) * scale,
    );
  };

  const onPointerDown = (event: PointerEvent) => {
    if (destroyed) return;
    // 左键落在 gizmo 手柄上时交给手柄，不启动相机拖拽。
    if (event.button === 0 && transformGizmo.isPointerOnGizmo()) {
      canvas.focus();
      return;
    }
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
    if (dragState.button === 2) {
      cameraState.azim = updateBlocking3dCameraAzimuth(cameraState.azim, dx);
      cameraState.elev = clamp(cameraState.elev + dy * 0.25, -89, 89);
      syncCamera();
    } else if (dragState.button === 1) {
      panCamera(dx, dy);
    }
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
    cameraState.distance = clamp(
      cameraState.distance * (event.deltaY > 0 ? 1.08 : 0.92),
      0.2,
      getCameraMaxDistance(),
    );
    syncCamera();
  };

  const onContextMenu = (event: MouseEvent) => event.preventDefault();
  const onKeyDown = (event: KeyboardEvent) => {
    if (destroyed || document.activeElement !== canvas) return;
    const key = event.key.toLowerCase();
    keyboardInput.add(key);
    if (["w", "a", "s", "d", "q", "e", " "].includes(key)) event.preventDefault();
  };
  const onKeyUp = (event: KeyboardEvent) => keyboardInput.delete(event.key.toLowerCase());
  const onBlur = () => {
    keyboardInput = new Set();
  };

  const handleKeyboardCamera = (dt: number) => {
    const speed = keyboardInput.has("shift") ? 6 : 2;
    const amount = speed * dt;
    if (keyboardInput.has("w")) moveCamera(0, 0, -amount);
    if (keyboardInput.has("s")) moveCamera(0, 0, amount);
    if (keyboardInput.has("a")) moveCamera(-amount, 0, 0);
    if (keyboardInput.has("d")) moveCamera(amount, 0, 0);
    if (keyboardInput.has("q")) moveCamera(0, -amount, 0);
    if (keyboardInput.has("e")) moveCamera(0, amount, 0);
  };

  canvas.tabIndex = 0;
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("wheel", onWheel, { passive: false });
  canvas.addEventListener("contextmenu", onContextMenu);
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", onBlur);

  const resize = () => {
    const rect = canvas.parentElement?.getBoundingClientRect();
    if (!rect) return;
    app.graphicsDevice.maxPixelRatio = Math.min(window.devicePixelRatio || 1, MAX_DEVICE_PIXEL_RATIO);
    app.resizeCanvas(rect.width, rect.height);
  };
  resize();
  const resizeObserver = new ResizeObserver(resize);
  if (canvas.parentElement) resizeObserver.observe(canvas.parentElement);

  app.on("update", (dt: number) => {
    if (destroyed) return;
    if (keyboardInput.size > 0) handleKeyboardCamera(dt);
    drawBlocking3dGroundGrid(app, environmentGridLines);
  });
  app.start();
  // 等应用进入帧循环后再加载环境，避免环境异步任务与模型加载失败清理竞态。
  void loadEnvironmentPreset(initialEnvironmentPresetId, currentEnvironmentDiameterMeters);

  const readTransform = (): InspectorTransformValue => {
    const position = modelRoot.getPosition();
    const angles = modelRoot.getEulerAngles();
    const scale = modelRoot.getLocalScale();
    return {
      position: [
        Math.round(position.x * 100) / 100,
        Math.round(position.y * 100) / 100,
        Math.round(position.z * 100) / 100,
      ],
      yawDeg: Math.round(wrapBlocking3dAzimuth(angles.y) * 10) / 10,
      scale: Math.round(scale.x * 100) / 100,
    };
  };

  return {
    canvas,
    fitView,
    resetView,
    setTransformTool(tool) {
      transformGizmo.setTool(tool);
    },
    getTransformTool() {
      return transformGizmo.getTool();
    },
    getTransform: readTransform,
    setTransform(patch) {
      if (gizmoDragging) return false;
      if (patch.position) {
        modelRoot.setPosition(patch.position[0], patch.position[1], patch.position[2]);
      }
      if (typeof patch.yawDeg === "number") {
        const angles = modelRoot.getEulerAngles();
        modelRoot.setEulerAngles(angles.x, patch.yawDeg, angles.z);
      }
      if (typeof patch.scale === "number") {
        const clamped = clamp(patch.scale, 0.05, 20);
        modelRoot.setLocalScale(clamped, clamped, clamped);
      }
      return true;
    },
    getEnvironmentPreset() {
      return currentEnvironmentPresetId;
    },
    getEnvironmentDiameter() {
      return currentEnvironmentDiameterMeters;
    },
    setEnvironmentPreset(presetId) {
      return loadEnvironmentPreset(presetId);
    },
    setEnvironmentDiameter(diameterMeters) {
      const nextDiameterMeters = getStudioEnvironmentDiameterMeters(diameterMeters);
      if (!currentStudioEnvironment) return loadEnvironmentPreset(currentEnvironmentPresetId, nextDiameterMeters);
      const nextSettings = normalizeEnvironmentSettings({
        ...currentEnvironmentSettings,
        radiusMeters: getStudioEnvironmentRadiusMeters(nextDiameterMeters),
      });
      const geometryChanged = nextSettings.projectionCenterHeight !== currentEnvironmentSettings.projectionCenterHeight
        || nextSettings.radiusMeters !== currentEnvironmentSettings.radiusMeters;
      currentEnvironmentSettings = nextSettings;
      currentEnvironmentDiameterMeters = nextSettings.radiusMeters * 2;
      currentEnvironmentRadiusMeters = nextSettings.radiusMeters;
      environmentGridLines = buildBlocking3dGroundGridLines(nextSettings);
      currentStudioEnvironment.applySettings(nextSettings);
      if (geometryChanged) currentStudioEnvironment.rebuildEnvironmentBackdropMesh(nextSettings);
      saveStudioEnvironmentDiameterPreference(currentEnvironmentPresetId, currentEnvironmentDiameterMeters);
      syncCamera();
      return Promise.resolve(true);
    },
    capturePng() {
      transformGizmo.attach(null);
      try {
        app.resizeCanvas(CAPTURE_SIZE.width, CAPTURE_SIZE.height);
        // 两帧冲掉上一轮排队的网格线，第二帧才是干净画面。
        app.render();
        app.render();
        const dataUrl = canvas.toDataURL("image/png");
        const base64 = dataUrl.split(",", 2)[1] ?? "";
        const binary = window.atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
        return new Blob([bytes], { type: "image/png" });
      } finally {
        resize();
        transformGizmo.attach(modelRoot);
        app.render();
      }
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      resizeObserver.disconnect();
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("contextmenu", onContextMenu);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      transformGizmo.destroy();
      modelRoot.destroy();
      disposeStudioEnvironment();
      app.destroy();
    },
  };
}
