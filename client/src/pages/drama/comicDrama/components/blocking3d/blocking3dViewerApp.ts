import * as pc from "playcanvas";
import type { StoryScene3DMarker } from "@ai-novel/shared/types/comicDrama";
import {
  clampBlockingActorPositionToStage,
  resolveStoryScene3DActorStageRadius,
  resolveStoryScene3DDomeWorldRadius,
} from "@ai-novel/shared/utils/blockingStage";
import { STORY_SCENE_3D_MARKERS_ENABLED } from "@ai-novel/shared/utils/scene3dMarkers";

import type {
  DramaShotBlockingSketch3DActor,
  DramaShotBlockingSketch3DCamera,
  DramaShotBlockingSketch3DShotCamera,
  DramaShotBlockingSketchPose,
} from "@/api/media/drama";
import { GROUND_DOME_FLAT_RADIUS } from "./blocking3dEnvironmentGeometry";
import { createBlocking3dEnvironmentRuntime } from "./blocking3dEnvironmentRuntime";
import { createBlocking3dSelectionOutline } from "./blocking3dSelectionOutline";
import { updateBlocking3dCameraAzimuth, wrapBlocking3dAzimuth } from "./blocking3dMath";
import {
  DEFAULT_BLOCKING_3D_HEIGHT_METERS,
  heightToBlocking3dScale,
  normalizeBlocking3dHeight,
  scaleSavedActorForCurrentHeight,
} from "./blocking3dScale";
import {
  createSceneMarkerRuntime,
  destroySceneMarkerRuntime,
  drawSceneMarkerOutlines,
  pickSceneMarker,
  setSceneMarkerSelected,
  updateSceneMarkerRuntime,
  applySceneMarkerEntityTransform,
  type Blocking3dSceneMarkerRuntime,
} from "./blocking3dSceneMarkers";
import {
  createProjectionCenterGizmo,
  destroyProjectionCenterGizmo,
  drawProjectionCenterGizmo,
  updateProjectionCenterGizmo,
  type Blocking3dProjectionCenterGizmoRuntime,
} from "./blocking3dProjectionCenterGizmo";
import {
  createBlocking3dShotCamera,
  deriveShotCameraPoseFromOrbit,
  normalizeShotCameraPose,
  type Blocking3dShotCameraPose,
} from "./blocking3dShotCamera";
import {
  createBlocking3dTransformGizmo,
  type Blocking3dTransformTool,
} from "./blocking3dTransformGizmo";
import {
  ACTOR_ANIMATION_URL,
  ACTOR_PROXY_URL,
  BLOCKING_SKETCH_CAPTURE_SIZE,
  clamp,
  colorForIndex,
  createMaterial,
  createPlane,
  DEFAULT_BLOCKING_3D_ENVIRONMENT,
  DEFAULT_CAMERA,
  DEFAULT_FOV,
  FALLBACK_AMBIENT_LIGHT,
  loadAsset,
  MAX_DEVICE_PIXEL_RATIO,
  normalizeActorColor,
  normalizeCamera,
  normalizeEnvironmentSettings,
  SELECTION_OUTLINE_COLOR,
  setAnimationPose,
  setEntityMaterial,
  type Blocking3dEnvironmentSettings,
  type Blocking3dViewerActor,
  type ContainerResource,
} from "./blocking3dViewerCore";

export { BLOCKING_SKETCH_CAPTURE_SIZE, DEFAULT_BLOCKING_3D_ENVIRONMENT };
export type { Blocking3dEnvironmentSettings };
export type { Blocking3dTransformTool };

type Blocking3dActorPosition = [number, number, number];

export interface Blocking3dViewerOptions {
  canvas: HTMLCanvasElement;
  environmentUrl?: string | null;
  sceneMarkers?: StoryScene3DMarker[];
  /** 视口内是否允许直接拖拽空间标记（场景 3D 编辑器开启；分镜草图页只读）。 */
  markerTransformEditable?: boolean;
  /** 空间标记被 gizmo 拖拽结束后的回写入口；未传时标记手柄不启用。 */
  onMarkerTransformCommit?: (marker: StoryScene3DMarker) => void;
  onStatus?: (status: string) => void;
}

export interface Blocking3dViewer {
  readonly canvas: HTMLCanvasElement;
  onSelectionChange: (listener: (label: string | null) => void) => () => void;
  onMarkerSelection: (listener: (id: string | null) => void) => () => void;
  /** 场景摄像机（镜头机位实体）的选中状态变化；selected 为 true 表示选中。 */
  onCameraSelection: (listener: (selected: boolean) => void) => () => void;
  onChange: (listener: () => void) => () => void;
  onStatus: (listener: (status: string) => void) => () => void;
  addActor: (
    label: string,
    index: number,
    heightMeters?: number,
    initialPosition?: Blocking3dActorPosition,
  ) => boolean;
  removeActor: (label: string) => boolean;
  selectActor: (label: string | null) => boolean;
  selectMarker: (id: string | null) => boolean;
  /** 选中/取消选中场景摄像机实体；与角色、标记互斥。 */
  selectCamera: (selected: boolean) => boolean;
  isCameraSelected: () => boolean;
  /** 场景摄像机的独立机位（世界坐标位置 + 朝向），与编辑视角解耦。 */
  getShotCameraPose: () => { position: [number, number, number]; yawDeg: number; pitchDeg: number };
  /** 提交场景摄像机机位的部分字段；收敛边界后同步机身与取景画中画。 */
  setShotCameraPose: (patch: { position?: [number, number, number]; yawDeg?: number; pitchDeg?: number }) => void;
  focusMarker: (id: string) => boolean;
  getSelectedMarker: () => string | null;
  setSceneMarkers: (markers: StoryScene3DMarker[]) => void;
  getSceneMarkers: () => StoryScene3DMarker[];
  getSelectedActor: () => string | null;
  getSelectedTransform: () => {
    position: [number, number, number];
    yawDeg: number;
    scale: [number, number, number];
  } | null;
  getActorLabels: () => string[];
  setSelectedPose: (pose: DramaShotBlockingSketchPose) => boolean;
  getSelectedPose: () => DramaShotBlockingSketchPose | null;
  setSelectedColor: (color: [number, number, number]) => boolean;
  getSelectedColor: () => [number, number, number] | null;
  nudgeSelected: (dx: number, dy: number, dz: number) => boolean;
  rotateSelected: (degrees: number) => boolean;
  groundSelected: () => boolean;
  /** Unity Transform 属性面板的绝对定位入口：只提交传入的分量。 */
  setSelectedTransform: (patch: {
    position?: [number, number, number];
    yawDeg?: number;
    scale?: [number, number, number];
  }) => boolean;
  /** 场景视图工具条：移动 / 旋转 / 缩放手柄切换；null 收起手柄。 */
  setTransformTool: (tool: Blocking3dTransformTool | null) => void;
  getTransformTool: () => Blocking3dTransformTool | null;
  fitView: () => void;
  resetCamera: () => void;
  setCameraState: (camera: DramaShotBlockingSketch3DCamera) => void;
  getCameraState: () => DramaShotBlockingSketch3DCamera;
  /** 镜头取景辅助开关：机位 gizmo + 相机取景画中画（layout3d.camera 的所见即所得）。 */
  setShotCameraHelpersVisible: (visible: boolean) => void;
  getShotCameraHelpersVisible: () => boolean;
  setInteractionEnabled: (enabled: boolean) => void;
  setActorMovementEnabled: (enabled: boolean) => void;
  setEnvironment: (url: string | null) => Promise<void>;
  getEnvironmentSettings: () => Blocking3dEnvironmentSettings;
  setEnvironmentSettings: (settings: Blocking3dEnvironmentSettings) => boolean;
  exportLayout: () => {
    schemaVersion: 1;
    engine: "playcanvas";
    camera: DramaShotBlockingSketch3DCamera;
    shotCamera?: DramaShotBlockingSketch3DShotCamera;
    actors: DramaShotBlockingSketch3DActor[];
    environment: Blocking3dEnvironmentSettings;
  };
  loadLayout: (layout: {
    schemaVersion: 1;
    engine: "playcanvas";
    camera: DramaShotBlockingSketch3DCamera;
    shotCamera?: DramaShotBlockingSketch3DShotCamera;
    actors: DramaShotBlockingSketch3DActor[];
    environment?: Blocking3dEnvironmentSettings;
  }) => void;
  capturePng: () => Blob;
  destroy: () => void;
}

export async function createBlocking3dViewer(options: Blocking3dViewerOptions): Promise<Blocking3dViewer> {
  const { canvas } = options;
  const app = new pc.Application(canvas, {
    mouse: new pc.Mouse(canvas),
    keyboard: new pc.Keyboard(window),
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
  app.scene.ambientLight = FALLBACK_AMBIENT_LIGHT.clone();

  const cameraEntity = new pc.Entity("blocking3d-camera");
  cameraEntity.addComponent("camera", {
    clearColor: new pc.Color(0.05, 0.07, 0.1),
    fov: DEFAULT_FOV,
    nearClip: 0.05,
    farClip: 200,
  });
  // PlayCanvas uses scene.envAtlas as the fallback texture for its built-in
  // infinite Skybox. Keep the atlas for HDRI lighting, but remove that layer
  // from this camera so the finite backdrop below remains the only environment
  // visible in the blocking viewport.
  const cameraComponent = cameraEntity.camera!;
  cameraComponent.layers = cameraComponent.layers.filter((layerId) => layerId !== pc.LAYERID_SKYBOX);
  // 编辑器辅助图层：摄像机机身等只服务编辑视口的对象挂在这里；取景画中画
  // 只渲染世界内容，不会看到机身和辅助元素。
  const editorOverlayLayer = new pc.Layer({ name: "blocking3d-editor-overlay" });
  app.scene.layers.insert(editorOverlayLayer, app.scene.layers.layerList.length);
  cameraComponent.layers = [...cameraComponent.layers, editorOverlayLayer.id];
  app.root.addChild(cameraEntity);
  const cameraFrame = new pc.CameraFrame(app, cameraEntity.camera!);
  cameraFrame.dof.nearBlur = false;
  cameraFrame.dof.highQuality = true;

  // Unity 风格的场景摄像机运行时：独立机位（世界坐标位置 + 朝向）驱动机身
  // 实体与右下角取景画中画；编辑视角导航不会带动机身。
  const shotCamera = createBlocking3dShotCamera(app, canvas, cameraComponent, editorOverlayLayer.id);

  const ground = createPlane(
    app,
    "blocking3d-ground",
    [0, -0.02, 0],
    [22, 22, 22],
    createMaterial(new pc.Color(0.12, 0.15, 0.19)),
  );
  ground.render!.receiveShadows = true;

  const gridLines: Array<{ start: pc.Vec3; end: pc.Vec3; color: pc.Color }> = [];
  for (let value = -10; value <= 10; value += 1) {
    const major = value % 5 === 0;
    const color = new pc.Color(major ? 0.46 : 0.28, major ? 0.5 : 0.32, major ? 0.58 : 0.4, major ? 0.62 : 0.38);
    gridLines.push({
      start: new pc.Vec3(value, 0.005, -10),
      end: new pc.Vec3(value, 0.005, 10),
      color,
    });
    gridLines.push({
      start: new pc.Vec3(-10, 0.005, value),
      end: new pc.Vec3(10, 0.005, value),
      color,
    });
  }

  let environmentSettings = normalizeEnvironmentSettings(undefined);

  // 世界根节点：HDRI 背景（对象列表里的「世界」）和空间标记 cube 都作为
  // 它的子对象统一承载；背景按状态图重建时不会连带销毁或移动标记。
  const worldEntity = new pc.Entity("blocking3d-world");
  app.root.addChild(worldEntity);

  // HDRI 环境运行时：背景穹顶、环境光照与瞬态主光的唯一归属；背景按状态图
  // 重建时不会连带销毁或移动空间标记。
  const environment = createBlocking3dEnvironmentRuntime(app, worldEntity);

  // 参考圈组：琥珀色是角色舞台边界（半球边缘内缩 1 米），青色是半球
  // 地面平坦部分的外沿。调“半球直径”滑块时两条圈同时重算，可以直观
  // 看到球边和舞台余量的关系。
  // 青色圈不能画在直径的一半处：地面网格最外 5% 是向上卷起接回半球的
  // 圆弧（GROUND_DOME_FLAT_RADIUS = 0.95），只有该比例以内才是真正的
  // 平面地板，参考圈必须落在平坦区域里才不会浮在弧面上。
  const STAGE_BOUNDARY_SEGMENTS = 96;
  const stageBoundaryColor = new pc.Color(0.9, 0.62, 0.2, 0.4);
  const domeBoundaryColor = new pc.Color(0.35, 0.75, 0.9, 0.45);
  type BoundaryLine = { start: pc.Vec3; end: pc.Vec3; color: pc.Color };
  let stageBoundaryLines: BoundaryLine[] = [];
  let domeBoundaryLines: BoundaryLine[] = [];
  const buildBoundaryRing = (radius: number, color: pc.Color): BoundaryLine[] => {
    const lines: BoundaryLine[] = [];
    const y = 0.012;
    let previousXZ: { x: number; z: number } | null = null;
    for (let index = 0; index <= STAGE_BOUNDARY_SEGMENTS; index += 1) {
      const angle = (index / STAGE_BOUNDARY_SEGMENTS) * Math.PI * 2;
      const xz = { x: Math.cos(angle) * radius, z: Math.sin(angle) * radius };
      if (previousXZ) {
        lines.push({
          start: new pc.Vec3(previousXZ.x, y, previousXZ.z),
          end: new pc.Vec3(xz.x, y, xz.z),
          color,
        });
      }
      previousXZ = xz;
    }
    return lines;
  };
  const rebuildBoundaryRings = () => {
    stageBoundaryLines = buildBoundaryRing(
      resolveStoryScene3DActorStageRadius(environmentSettings),
      stageBoundaryColor,
    );
    domeBoundaryLines = buildBoundaryRing(
      resolveStoryScene3DDomeWorldRadius(environmentSettings) * GROUND_DOME_FLAT_RADIUS,
      domeBoundaryColor,
    );
  };
  rebuildBoundaryRings();

  const projectionCenterGizmo: Blocking3dProjectionCenterGizmoRuntime = createProjectionCenterGizmo(
    app,
    environmentSettings,
  );
  const applyEnvironmentSettings = () => {
    updateProjectionCenterGizmo(projectionCenterGizmo, environmentSettings);
    rebuildBoundaryRings();
    environment.applySettings(environmentSettings);
  };
  let actorAsset: pc.Asset;
  let animationAsset: pc.Asset;
  const animationTracks = new Map<string, unknown>();
  const actors = new Map<string, Blocking3dViewerActor>();
  const sceneMarkerRuntimes = new Map<string, Blocking3dSceneMarkerRuntime>();
  const selectionListeners = new Set<(label: string | null) => void>();
  const markerSelectionListeners = new Set<(id: string | null) => void>();
  const cameraSelectionListeners = new Set<(selected: boolean) => void>();
  const statusListeners = new Set<(status: string) => void>();
  let selectedLabel: string | null = null;
  let selectedMarkerId: string | null = null;
  let cameraSelected = false;
  let cameraState: DramaShotBlockingSketch3DCamera = {
    ...DEFAULT_CAMERA,
    focalPoint: [...DEFAULT_CAMERA.focalPoint],
  };
  // 场景摄像机独立机位：初始落在默认轨道机位上，之后只被拖拽、变换手柄或
  // 属性面板改写；编辑视角导航不影响它。
  let shotCameraPose = deriveShotCameraPoseFromOrbit(cameraState);
  // 镜头取景辅助（机位 gizmo + 取景画中画）默认关闭，由页面按钮、选中摄像
  // 机或 AI 构图完成时打开。
  let shotCameraHelpersVisible = false;
  // 导出草图瞬间挂起辅助线与画中画：导出的摆位图必须只有布景和角色。
  let shotCameraHelpersSuppressed = false;
  /** 机位实体与取景画中画统一按独立机位 pose 同步；选中摄像机或打开取景辅助时显示小窗。 */
  const syncShotCameraVisuals = () => {
    shotCamera.sync(shotCameraPose, cameraState.fovDeg, (shotCameraHelpersVisible || cameraSelected) && !shotCameraHelpersSuppressed);
  };
  let destroyed = false;
  const selectionOutline = createBlocking3dSelectionOutline(app, cameraEntity, SELECTION_OUTLINE_COLOR);
  let interactionEnabled = true;
  let actorMovementEnabled = true;
  let dragState: { button: number; pointerId: number; x: number; y: number; mode: "actor" | "camera-body" | "camera" | "none"; actorLabel?: string; lastGround?: pc.Vec3 } | null = null;
  let keyboardInput = new Set<string>();
  const changeListeners = new Set<() => void>();

  const setStatus = (status: string) => {
    options.onStatus?.(status);
    for (const listener of statusListeners) listener(status);
  };

  const orbitDistance = () => clamp(cameraState.distance, 0.25, 100);

  const syncCamera = () => {
    if (!cameraEntity.camera) return;
    const elevation = cameraState.elev * pc.math.DEG_TO_RAD;
    const azimuth = cameraState.azim * pc.math.DEG_TO_RAD;
    const distance = orbitDistance();
    const cosElevation = Math.cos(elevation);
    const position = new pc.Vec3(
      cameraState.focalPoint[0] + Math.sin(azimuth) * cosElevation * distance,
      cameraState.focalPoint[1] + Math.sin(-elevation) * distance,
      cameraState.focalPoint[2] + Math.cos(azimuth) * cosElevation * distance,
    );
    cameraEntity.camera.fov = cameraState.fovDeg;
    cameraEntity.camera.nearClip = cameraState.nearClip;
    cameraEntity.camera.farClip = cameraState.farClip;
    cameraFrame.dof.enabled = cameraState.depthOfFieldEnabled;
    cameraFrame.dof.focusDistance = cameraState.focusDistance;
    cameraFrame.dof.focusRange = cameraState.focusRange;
    cameraFrame.dof.blurRadius = cameraState.blurRadius;
    cameraEntity.setPosition(position);
    cameraEntity.setEulerAngles(cameraState.elev, cameraState.azim, 0);
    cameraFrame.update();
  };

  const emitSelection = () => {
    for (const listener of selectionListeners) listener(selectedLabel);
    const actor = selectedLabel ? actors.get(selectedLabel) : null;
    // 角色、空间标记与场景摄像机三者互斥选中；选中的对象共用同一条外轮廓反馈通道。
    const markerRuntime = !selectedLabel && selectedMarkerId
      ? sceneMarkerRuntimes.get(selectedMarkerId) ?? null
      : null;
    syncTransformGizmo();
    selectionOutline.setEntity(actor?.entity ?? markerRuntime?.entity ?? (cameraSelected ? shotCamera.body : null));
  };

  const emitCameraSelection = () => {
    for (const listener of cameraSelectionListeners) listener(cameraSelected);
    // 选中摄像机即时显示右下角取景画中画（Unity camera preview 语义）。
    syncShotCameraVisuals();
  };

  const emitMarkerSelection = () => {
    for (const [id, runtime] of sceneMarkerRuntimes) {
      setSceneMarkerSelected(runtime, id === selectedMarkerId);
    }
    for (const listener of markerSelectionListeners) listener(selectedMarkerId);
  };

  const emitChange = () => {
    for (const listener of changeListeners) listener();
  };

  // Unity 场景视图同款变换手柄（移动/旋转/缩放）：跟随当前选中对象，拖拽直接
  // 改写实体 transform，结束时在这里统一做边界约束并回写数据。
  let transformTool: Blocking3dTransformTool | null = "translate";
  const handleTransformGizmoEnd = () => {
    const actor = selectedActor();
    if (actor) {
      const position = actor.entity.getPosition();
      const rotation = actor.entity.getEulerAngles();
      const [nextX, nextY, nextZ] = clampBlockingActorPositionToStage(
        [position.x, clamp(position.y, 0, 50), position.z],
        environmentSettings,
      );
      actor.entity.setPosition(nextX, nextY, nextZ);
      actor.entity.setEulerAngles(rotation.x, clamp(rotation.y, -180, 180), rotation.z);
      emitSelection();
      emitChange();
      return;
    }
    if (!selectedLabel && cameraSelected) {
      // 摄像机手柄结束：把实体位姿收敛回独立机位 pose。
      const position = shotCamera.body.getPosition();
      const rotation = shotCamera.body.getEulerAngles();
      setShotCameraPose({ position: [position.x, position.y, position.z], yawDeg: rotation.y, pitchDeg: rotation.x });
      emitChange();
      return;
    }
    const markerRuntime = !selectedLabel && selectedMarkerId
      ? sceneMarkerRuntimes.get(selectedMarkerId) ?? null
      : null;
    if (markerRuntime && options.markerTransformEditable) {
      options.onMarkerTransformCommit?.(applySceneMarkerEntityTransform(markerRuntime));
    }
    emitChange();
  };
  const transformGizmo = createBlocking3dTransformGizmo(app, cameraEntity.camera!, {
    onTransformMove: () => emitChange(),
    onTransformEnd: () => handleTransformGizmoEnd(),
  });
  transformGizmo.setTool(transformTool);
  const syncTransformGizmo = () => {
    const actor = selectedActor();
    const markerRuntime = !selectedLabel && selectedMarkerId
      ? sceneMarkerRuntimes.get(selectedMarkerId) ?? null
      : null;
    const node = interactionEnabled
      ? (actor && actorMovementEnabled ? actor.entity : null)
        ?? (options.markerTransformEditable ? markerRuntime?.entity ?? null : null)
        ?? (cameraSelected ? shotCamera.body : null)
      : null;
    transformGizmo.attach(node);
  };

  const select = (label: string | null): boolean => {
    if (label !== null && !actors.has(label)) return false;
    selectedLabel = label;
    if (cameraSelected) {
      cameraSelected = false;
      emitCameraSelection();
    }
    if (label !== null) {
      selectedMarkerId = null;
      emitMarkerSelection();
    } else if (selectedMarkerId !== null) {
      selectedMarkerId = null;
      emitMarkerSelection();
    }
    emitSelection();
    return true;
  };

  const selectMarker = (id: string | null): boolean => {
    if (id !== null && !sceneMarkerRuntimes.has(id)) return false;
    selectedMarkerId = id;
    if (id !== null) selectedLabel = null;
    if (cameraSelected) {
      cameraSelected = false;
      emitCameraSelection();
    }
    // 先发角色事件再发标记事件：页面两个监听共用一个选中状态，
    // 后到的标记事件必须覆盖 label=null 引发的“回到世界”回退。
    emitSelection();
    emitMarkerSelection();
    return true;
  };

  const selectCamera = (selected: boolean): boolean => {
    const next = selected === true;
    if (cameraSelected === next) return true;
    cameraSelected = next;
    if (next) {
      selectedLabel = null;
      selectedMarkerId = null;
      emitMarkerSelection();
    }
    emitSelection();
    emitCameraSelection();
    return true;
  };

  /** 场景摄像机独立机位的统一写入口：收敛边界后同步机身与取景画中画。 */
  const setShotCameraPose = (patch: Partial<Blocking3dShotCameraPose>) => {
    const merged = { ...shotCameraPose, ...patch };
    shotCameraPose = {
      position: [
        clamp(merged.position[0], -100, 100),
        clamp(merged.position[1], 0, 50),
        clamp(merged.position[2], -100, 100),
      ],
      yawDeg: wrapBlocking3dAzimuth(merged.yawDeg),
      pitchDeg: clamp(merged.pitchDeg, -89, 89),
    };
    syncShotCameraVisuals();
  };

  const setSceneMarkers = (markers: StoryScene3DMarker[]) => {
    // 空间标记功能暂关：全景只做背景，道具改为摆放 3D 模型，视图不再渲染标记。
    const accepted = STORY_SCENE_3D_MARKERS_ENABLED ? markers : [];
    const nextIds = new Set<string>();
    for (const marker of accepted) {
      if (!marker.id.trim()) continue;
      nextIds.add(marker.id);
      const existing = sceneMarkerRuntimes.get(marker.id);
      if (existing) {
        updateSceneMarkerRuntime(existing, marker, marker.id === selectedMarkerId);
      } else {
        sceneMarkerRuntimes.set(marker.id, createSceneMarkerRuntime(app, marker, marker.id === selectedMarkerId, worldEntity));
      }
    }
    for (const [id, runtime] of sceneMarkerRuntimes) {
      if (nextIds.has(id)) continue;
      destroySceneMarkerRuntime(runtime);
      sceneMarkerRuntimes.delete(id);
    }
    if (selectedMarkerId && !nextIds.has(selectedMarkerId)) {
      selectedMarkerId = null;
      emitMarkerSelection();
      // 被移除的标记实体即将销毁，外轮廓必须同步摘除，避免引用已销毁网格。
      emitSelection();
    }
  };

  const focusMarker = (id: string): boolean => {
    const runtime = sceneMarkerRuntimes.get(id);
    if (!runtime) return false;
    selectMarker(id);
    const marker = runtime.marker;
    cameraState.focalPoint = [marker.position[0], Math.max(0.5, marker.position[1]), marker.position[2]];
    cameraState.distance = clamp(Math.max(4, Math.max(...marker.size) * 3 + 3), 0.25, 100);
    cameraState.azim = -35;
    cameraState.elev = -12;
    syncCamera();
    return true;
  };

  const selectedActor = () => (selectedLabel ? actors.get(selectedLabel) ?? null : null);

  const moveCamera = (dx: number, dy: number, dz: number) => {
    cameraState.focalPoint = [
      clamp(cameraState.focalPoint[0] + dx, -100, 100),
      clamp(cameraState.focalPoint[1] + dy, -100, 100),
      clamp(cameraState.focalPoint[2] + dz, -100, 100),
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
    const scale = clamp(orbitDistance() * 0.00125, 0.003, 0.04);
    moveCamera(
      (-screenRight.x * dx + screenUp.x * dy) * scale,
      (-screenRight.y * dx + screenUp.y * dy) * scale,
      (-screenRight.z * dx + screenUp.z * dy) * scale,
    );
  };

  const onPointerDown = (event: PointerEvent) => {
    if (destroyed || !interactionEnabled) return;
    // 左键点在 gizmo 手柄上时交给手柄处理；右键 / 中键保持相机操作。
    if (event.button === 0 && transformGizmo.isPointerOnGizmo()) {
      canvas.focus();
      return;
    }
    canvas.focus();
    const pointerRay = event.button === 0 ? screenRay(event.clientX, event.clientY) : null;
    const cameraBodyHit = pointerRay ? shotCamera.rayHitsBody(pointerRay) : false;
    const hit = event.button === 0 && !cameraBodyHit ? pickActor(event.clientX, event.clientY) : null;
    const markerHit = event.button === 0 && !hit && !cameraBodyHit
      ? pickSceneMarker(sceneMarkerRuntimes.values(), screenRay(event.clientX, event.clientY))
      : null;
    if (cameraBodyHit) selectCamera(true);
    else if (hit) select(hit);
    else if (markerHit) selectMarker(markerHit);
    dragState = {
      button: event.button,
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      mode: cameraBodyHit
        ? "camera-body"
        : hit && selectedLabel === hit && actorMovementEnabled
          ? "actor"
          : event.button === 2 ? "camera" : "none",
      actorLabel: cameraBodyHit ? undefined : hit ?? undefined,
      lastGround: cameraBodyHit || hit ? raycastGround(event.clientX, event.clientY) ?? undefined : undefined,
    };
    canvas.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: PointerEvent) => {
    if (!interactionEnabled || !dragState || event.pointerId !== dragState.pointerId) return;
    const dx = event.clientX - dragState.x;
    const dy = event.clientY - dragState.y;
    dragState.x = event.clientX;
    dragState.y = event.clientY;
    if (dragState.mode === "actor" && dragState.actorLabel) {
      const actor = actors.get(dragState.actorLabel);
      const previousGround = dragState.lastGround;
      const nextGround = raycastGround(event.clientX, event.clientY);
      if (actor && previousGround && nextGround) {
        const position = actor.entity.getPosition();
        const [nextX, nextY, nextZ] = clampBlockingActorPositionToStage([
          position.x + nextGround.x - previousGround.x,
          position.y,
          position.z + nextGround.z - previousGround.z,
        ], environmentSettings);
        actor.entity.setPosition(nextX, nextY, nextZ);
        dragState.lastGround = nextGround;
        emitSelection();
        emitChange();
      }
    } else if (dragState.mode === "camera-body") {
      // 拖拽摄像机机身：沿地面平移独立机位，编辑视角保持不动。
      const previousGround = dragState.lastGround;
      const nextGround = raycastGround(event.clientX, event.clientY);
      if (previousGround && nextGround) {
        const next = new pc.Vec3(shotCameraPose.position[0], shotCameraPose.position[1], shotCameraPose.position[2])
          .add(nextGround.clone().sub(previousGround));
        setShotCameraPose({ position: [next.x, next.y, next.z] });
        dragState.lastGround = nextGround;
        emitChange();
      }
    } else if (dragState.button === 2) {
      cameraState.azim = updateBlocking3dCameraAzimuth(cameraState.azim, dx);
      cameraState.elev = clamp(cameraState.elev + dy * 0.25, -89, 89);
      syncCamera();
      emitChange();
    } else if (dragState.button === 1) {
      panCamera(dx, dy);
      emitChange();
    }
  };

  const onPointerUp = (event: PointerEvent) => {
    if (!dragState || event.pointerId !== dragState.pointerId) return;
    const dx = event.clientX - dragState.x;
    const dy = event.clientY - dragState.y;
    const button = dragState.button;
    dragState = null;
    try { canvas.releasePointerCapture(event.pointerId); } catch { /* no-op */ }
    if (button === 0 && Math.hypot(dx, dy) < 6) {
      const clickRay = screenRay(event.clientX, event.clientY);
      if (clickRay && shotCamera.rayHitsBody(clickRay)) {
        selectCamera(true);
      } else {
        const hit = pickActor(event.clientX, event.clientY);
        if (hit) {
          select(hit);
        } else {
          const markerHit = pickSceneMarker(sceneMarkerRuntimes.values(), screenRay(event.clientX, event.clientY));
          if (markerHit) selectMarker(markerHit);
          else select(null);
        }
      }
    }
  };

  const onWheel = (event: WheelEvent) => {
    if (!interactionEnabled) return;
    event.preventDefault();
    cameraState.distance = clamp(cameraState.distance * (event.deltaY > 0 ? 1.08 : 0.92), 0.25, 100);
    syncCamera();
    emitChange();
  };

  const onContextMenu = (event: MouseEvent) => event.preventDefault();
  const onKeyDown = (event: KeyboardEvent) => {
    if (!interactionEnabled || document.activeElement !== canvas) return;
    keyboardInput.add(event.key.toLowerCase());
    if (["w", "a", "s", "d", "q", "e", " "].includes(event.key.toLowerCase())) event.preventDefault();
  };
  const onKeyUp = (event: KeyboardEvent) => keyboardInput.delete(event.key.toLowerCase());
  const onBlur = () => { keyboardInput = new Set(); };

  const screenRay = (clientX: number, clientY: number): pc.Ray | null => {
    if (!cameraEntity.camera) return null;
    const rect = canvas.getBoundingClientRect();
    const start = cameraEntity.getPosition().clone();
    const end = cameraEntity.camera.screenToWorld(clientX - rect.left, clientY - rect.top, 1);
    const direction = end.sub(start);
    if (direction.lengthSq() < 1e-8) return null;
    return new pc.Ray(start, direction.normalize());
  };

  const raycastGround = (clientX: number, clientY: number): pc.Vec3 | null => {
    const ray = screenRay(clientX, clientY);
    if (!ray || Math.abs(ray.direction.y) < 1e-5) return null;
    const distance = -ray.origin.y / ray.direction.y;
    if (!Number.isFinite(distance) || distance <= 0) return null;
    return new pc.Vec3(
      ray.origin.x + ray.direction.x * distance,
      0,
      ray.origin.z + ray.direction.z * distance,
    );
  };

  function pickActor(clientX: number, clientY: number): string | null {
    const ray = screenRay(clientX, clientY);
    if (!ray) return null;
    let closest: { label: string; distance: number } | null = null;
    const hit = new pc.Vec3();
    for (const actor of actors.values()) {
      for (const render of actor.entity.findComponents("render") as pc.RenderComponent[]) {
        for (const mesh of render.meshInstances ?? []) {
          if (!mesh.aabb.intersectsRay(ray, hit)) continue;
          const distance = hit.distance(ray.origin);
          if (!closest || distance < closest.distance) closest = { label: actor.label, distance };
        }
      }
    }
    return closest?.label ?? null;
  }

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
    // 画中画高度按窗口纵横比换算成 16:9，resize 后必须重算视口。
    syncShotCameraVisuals();
  };
  resize();
  const resizeObserver = new ResizeObserver(resize);
  if (canvas.parentElement) resizeObserver.observe(canvas.parentElement);

  app.on("update", (dt: number) => {
    cameraFrame.update();
    const hadKeyboardInput = keyboardInput.size > 0;
    handleKeyboardCamera(Math.min(0.1, dt));
    if (hadKeyboardInput) emitChange();
    for (const line of gridLines) app.drawLine(line.start, line.end, line.color, false);
    for (const line of domeBoundaryLines) app.drawLine(line.start, line.end, line.color, false);
    for (const line of stageBoundaryLines) app.drawLine(line.start, line.end, line.color, false);
    drawProjectionCenterGizmo(app, projectionCenterGizmo);
    // Unity 场景视图同款：摄像机 gizmo（白色线框）常驻显示，选中变橙色。
    shotCamera.drawGizmo(app, cameraSelected);
    // 三分构图线只出现在取景画中画里（内部判断可见性，不可见时为空操作）。
    shotCamera.drawCompositionGuides(app);
    drawSceneMarkerOutlines(app, sceneMarkerRuntimes.values(), selectedMarkerId);
    selectionOutline.frameUpdate();
  });
  setSceneMarkers(options.sceneMarkers ?? []);
  app.start();
  syncCamera();
  syncShotCameraVisuals();

  try {
    setStatus("正在加载 3D 代理角色...");
    [actorAsset, animationAsset] = await Promise.all([
      loadAsset(app, ACTOR_PROXY_URL, "container"),
      loadAsset(app, ACTOR_ANIMATION_URL, "container"),
    ]);
    const proxyResource = actorAsset.resource as ContainerResource;
    const animationResources = [
      ...(proxyResource.animations ?? []),
      ...(((animationAsset.resource as ContainerResource).animations ?? [])),
    ];
    for (const clipAsset of animationResources) {
      const track = clipAsset.resource;
      const name = (track as { name?: unknown } | null | undefined)?.name;
      if (track && typeof name === "string") animationTracks.set(name, track);
    }
    if (!animationTracks.has("Idle_Loop")) throw new Error("3D 代理角色缺少基础待机动作。");
    setStatus("3D 草图已就绪");
  } catch (error) {
    resizeObserver.disconnect();
    canvas.removeEventListener("pointerdown", onPointerDown);
    canvas.removeEventListener("pointermove", onPointerMove);
    canvas.removeEventListener("pointerup", onPointerUp);
    canvas.removeEventListener("wheel", onWheel);
    canvas.removeEventListener("contextmenu", onContextMenu);
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
    window.removeEventListener("blur", onBlur);
    destroyProjectionCenterGizmo(projectionCenterGizmo);
    selectionOutline.destroy();
    app.destroy();
    throw error instanceof Error ? error : new Error(String(error));
  }

  const createActor = (
    label: string,
    index: number,
    heightMeters = DEFAULT_BLOCKING_3D_HEIGHT_METERS,
    initialPosition?: Blocking3dActorPosition,
  ): Blocking3dViewerActor => {
    const resource = actorAsset.resource as ContainerResource;
    const model = resource.instantiateRenderEntity?.({ castShadows: false });
    if (!model) throw new Error("3D 代理角色模型无法实例化。");
    const color = colorForIndex(index);
    const root = new pc.Entity(`blocking3d-actor-${label}`);
    model.name = "quaternius_mannequin";
    model.setLocalPosition(0, 0, 0);
    model.setLocalEulerAngles(0, 180, 0);
    const material = setEntityMaterial(model, color);
    root.addChild(model);
    model.addComponent("anim", { activate: true });
    if (model.anim) model.anim.rootBone = model;
    const placement = initialPosition ?? [(index - 1) * 1.6, 0, 0];
    root.setPosition(placement[0], placement[1], placement[2]);
    root.setEulerAngles(0, 180, 0);
    const normalizedHeightMeters = normalizeBlocking3dHeight(heightMeters);
    const proxyScale = heightToBlocking3dScale(normalizedHeightMeters);
    root.setLocalScale(proxyScale, proxyScale, proxyScale);
    app.root.addChild(root);
    const actor: Blocking3dViewerActor = {
      label,
      heightMeters: normalizedHeightMeters,
      entity: root,
      animEntity: model,
      pose: "standing",
      actionPlaying: false,
      color,
      material,
    };
    setAnimationPose(actor, animationTracks, "standing");
    return actor;
  };

  const fitView = () => {
    const values = [...actors.values()];
    if (!values.length) {
      cameraState = { ...DEFAULT_CAMERA, focalPoint: [...DEFAULT_CAMERA.focalPoint] };
      syncCamera();
      emitChange();
      return;
    }
    const minX = Math.min(...values.map((actor) => actor.entity.getPosition().x));
    const maxX = Math.max(...values.map((actor) => actor.entity.getPosition().x));
    const minZ = Math.min(...values.map((actor) => actor.entity.getPosition().z));
    const maxZ = Math.max(...values.map((actor) => actor.entity.getPosition().z));
    cameraState.focalPoint = [(minX + maxX) / 2, 0.8, (minZ + maxZ) / 2];
    cameraState.distance = clamp(Math.max(5, Math.max(maxX - minX, maxZ - minZ) * 2.3 + 4), 0.25, 100);
    cameraState.azim = -35;
    cameraState.elev = -12;
    syncCamera();
    emitChange();
  };

  const viewer: Blocking3dViewer = {
    canvas,
    onSelectionChange(listener) {
      selectionListeners.add(listener);
      listener(selectedLabel);
      return () => selectionListeners.delete(listener);
    },
    onMarkerSelection(listener) {
      markerSelectionListeners.add(listener);
      listener(selectedMarkerId);
      return () => markerSelectionListeners.delete(listener);
    },
    onCameraSelection(listener) {
      cameraSelectionListeners.add(listener);
      listener(cameraSelected);
      return () => cameraSelectionListeners.delete(listener);
    },
    selectCamera,
    isCameraSelected: () => cameraSelected,
    getShotCameraPose() {
      return {
        position: [...shotCameraPose.position] as [number, number, number],
        yawDeg: shotCameraPose.yawDeg,
        pitchDeg: shotCameraPose.pitchDeg,
      };
    },
    setShotCameraPose(patch) {
      setShotCameraPose(patch);
      emitChange();
    },
    onChange(listener) {
      changeListeners.add(listener);
      return () => changeListeners.delete(listener);
    },
    onStatus(listener) {
      statusListeners.add(listener);
      return () => statusListeners.delete(listener);
    },
    addActor(label, index, heightMeters = DEFAULT_BLOCKING_3D_HEIGHT_METERS, initialPosition) {
      if (!label.trim() || actors.has(label)) return false;
      const actor = createActor(label.trim(), index, heightMeters, initialPosition);
      actors.set(label.trim(), actor);
      if (!selectedLabel) select(label.trim());
      emitChange();
      return true;
    },
    removeActor(label) {
      const actor = actors.get(label);
      if (!actor) return false;
      if (selectedLabel === label) select(null);
      actor.entity.destroy();
      actors.delete(label);
      emitChange();
      return true;
    },
    selectActor(label) {
      return select(label);
    },
    selectMarker,
    focusMarker,
    getSelectedMarker: () => selectedMarkerId,
    setSceneMarkers,
    getSceneMarkers: () => [...sceneMarkerRuntimes.values()].map((runtime) => runtime.marker),
    getSelectedActor: () => selectedLabel,
    getSelectedTransform() {
      const actor = selectedActor();
      if (!actor) return null;
      const position = actor.entity.getPosition();
      const rotation = actor.entity.getEulerAngles();
      const scale = actor.entity.getLocalScale();
      return {
        position: [position.x, position.y, position.z] as [number, number, number],
        yawDeg: clamp(rotation.y, -180, 180),
        scale: [scale.x, scale.y, scale.z] as [number, number, number],
      };
    },
    getActorLabels: () => [...actors.keys()],
    setSelectedPose(pose) {
      const actor = selectedActor();
      if (!actor) return false;
      setAnimationPose(actor, animationTracks, pose);
      emitSelection();
      emitChange();
      return true;
    },
    getSelectedPose: () => selectedActor()?.pose ?? null,
    setSelectedColor(color) {
      const actor = selectedActor();
      if (!actor || color.some((channel) => !Number.isFinite(channel))) return false;
      const nextColor = normalizeActorColor(color);
      actor.color = nextColor;
      actor.material = setEntityMaterial(actor.animEntity, nextColor, actor.material);
      emitChange();
      return true;
    },
    getSelectedColor() {
      const color = selectedActor()?.color;
      return color ? [...color] as [number, number, number] : null;
    },
    nudgeSelected(dx, dy, dz) {
      if (!actorMovementEnabled) return false;
      const actor = selectedActor();
      if (!actor) return false;
      const position = actor.entity.getPosition();
      const [nextX, nextY, nextZ] = clampBlockingActorPositionToStage([
        position.x + dx,
        clamp(position.y + dy, 0, 50),
        position.z + dz,
      ], environmentSettings);
      actor.entity.setPosition(nextX, nextY, nextZ);
      emitSelection();
      emitChange();
      return true;
    },
    rotateSelected(degrees) {
      if (cameraSelected) {
        // 旋转摄像机 = 调整独立机位朝向；机身与画中画随 setShotCameraPose 同步。
        setShotCameraPose({ yawDeg: shotCameraPose.yawDeg + degrees });
        emitChange();
        return true;
      }
      const actor = selectedActor();
      if (!actor) return false;
      const current = actor.entity.getEulerAngles();
      actor.entity.setEulerAngles(current.x, clamp(current.y + degrees, -180, 180), current.z);
      emitChange();
      return true;
    },
    groundSelected() {
      if (!actorMovementEnabled) return false;
      const actor = selectedActor();
      if (!actor) return false;
      const position = actor.entity.getPosition();
      actor.entity.setPosition(position.x, 0, position.z);
      emitSelection();
      emitChange();
      return true;
    },
    setSelectedTransform(patch) {
      if (!actorMovementEnabled) return false;
      const actor = selectedActor();
      if (!actor) return false;
      const position = actor.entity.getPosition();
      const rotation = actor.entity.getEulerAngles();
      const nextPosition = patch.position ?? [position.x, position.y, position.z];
      const [nextX, nextY, nextZ] = clampBlockingActorPositionToStage(nextPosition, environmentSettings);
      actor.entity.setPosition(nextX, clamp(nextY, 0, 50), nextZ);
      if (patch.yawDeg != null) {
        actor.entity.setEulerAngles(rotation.x, clamp(patch.yawDeg, -180, 180), rotation.z);
      }
      if (patch.scale) {
        const nextScale = patch.scale.map((axis) => clamp(Number.isFinite(axis) ? axis : 1, 0.05, 20));
        actor.entity.setLocalScale(nextScale[0], nextScale[1], nextScale[2]);
      }
      emitSelection();
      emitChange();
      return true;
    },
    setTransformTool(tool) {
      transformTool = tool;
      transformGizmo.setTool(tool);
      syncTransformGizmo();
    },
    getTransformTool: () => transformTool,
    fitView,
    resetCamera() {
      cameraState = { ...DEFAULT_CAMERA, focalPoint: [...DEFAULT_CAMERA.focalPoint] };
      syncCamera();
      emitChange();
    },
    setCameraState(next) {
      cameraState = normalizeCamera(next);
      syncCamera();
      // FOV 同时用于取景画中画，机位 pose 保持不变。
      syncShotCameraVisuals();
    },
    getCameraState() {
      return { ...cameraState, focalPoint: [...cameraState.focalPoint] };
    },
    setShotCameraHelpersVisible(visible) {
      shotCameraHelpersVisible = Boolean(visible);
      syncShotCameraVisuals();
    },
    getShotCameraHelpersVisible() {
      return shotCameraHelpersVisible;
    },
    setInteractionEnabled(enabled) {
      interactionEnabled = enabled;
      if (!enabled) {
        dragState = null;
        keyboardInput = new Set();
      }
      // 保存 / 自动构图期间收起手柄，避免和受控流程抢交互。
      syncTransformGizmo();
    },
    setActorMovementEnabled(enabled) {
      actorMovementEnabled = enabled;
      if (!enabled && dragState?.mode === "actor") dragState = null;
    },
    async setEnvironment(url) {
      ground.enabled = true;
      if (!url?.trim()) {
        environment.clearEnvironmentLighting();
        environment.clearEnvironmentVisuals();
        return;
      }
      setStatus("正在加载场景 HDRI 环境...");
      const loaded = await environment.load(url, environmentSettings);
      // false = 期间已有更新的加载接管，本次结果交给新请求处理。
      if (!loaded) return;
      applyEnvironmentSettings();
      ground.enabled = false;
      setStatus("3D 草图已就绪");
    },
    getEnvironmentSettings() {
      return { ...environmentSettings };
    },
    setEnvironmentSettings(settings) {
      const next = normalizeEnvironmentSettings(settings);
      // 背景网格只由投射中心高度和半球半径决定；分界线等参数是纯着色器
      // uniform，拖动时重建网格会造成无意义的 GPU 抖动。
      const geometryChanged = next.projectionCenterHeight !== environmentSettings.projectionCenterHeight
        || next.domeRadius !== environmentSettings.domeRadius;
      environmentSettings = next;
      applyEnvironmentSettings();
      if (geometryChanged) environment.rebuildEnvironmentBackdropMesh(environmentSettings);
      emitChange();
      return true;
    },
    exportLayout() {
      return {
        schemaVersion: 1,
        engine: "playcanvas",
        camera: viewer.getCameraState(),
        shotCamera: {
          position: [...shotCameraPose.position] as [number, number, number],
          yawDeg: shotCameraPose.yawDeg,
          pitchDeg: shotCameraPose.pitchDeg,
        },
        environment: viewer.getEnvironmentSettings(),
        actors: [...actors.values()].map((actor) => {
          const position = actor.entity.getPosition();
          const scale = actor.entity.getLocalScale();
          return {
            characterName: actor.label,
            heightMeters: actor.heightMeters,
            position: [position.x, position.y, position.z] as [number, number, number],
            yawDeg: clamp(actor.entity.getEulerAngles().y, -180, 180),
            scale: [scale.x, scale.y, scale.z] as [number, number, number],
            pose: actor.pose,
            color: [...actor.color] as [number, number, number],
            actionPlaying: false,
          };
        }),
      };
    },
    loadLayout(layout) {
      const nextEnvironment = normalizeEnvironmentSettings(layout.environment);
      // AI 构图通常沿用当前环境参数；穹顶网格重建会同步上传顶点缓冲，几何输入
      // 没变时跳过，避免构图结果落地那一帧整页卡顿。
      const geometryChanged = nextEnvironment.projectionCenterHeight !== environmentSettings.projectionCenterHeight
        || nextEnvironment.domeRadius !== environmentSettings.domeRadius;
      environmentSettings = nextEnvironment;
      applyEnvironmentSettings();
      if (geometryChanged) environment.rebuildEnvironmentBackdropMesh(environmentSettings);
      viewer.setCameraState(layout.camera);
      // 旧布局没有独立机位字段时从轨道相机推导，打开就能看到摄像机实体。
      shotCameraPose = normalizeShotCameraPose(layout.shotCamera, deriveShotCameraPoseFromOrbit(layout.camera));
      syncShotCameraVisuals();
      for (const saved of layout.actors) {
        const actor = actors.get(saved.characterName);
        if (!actor) continue;
        actor.entity.setPosition(saved.position[0], saved.position[1], saved.position[2]);
        actor.entity.setEulerAngles(0, saved.yawDeg, 0);
        const scale = scaleSavedActorForCurrentHeight(
          saved.scale,
          saved.heightMeters,
          actor.heightMeters,
        );
        actor.entity.setLocalScale(scale[0], scale[1], scale[2]);
        if (saved.color) {
          actor.color = normalizeActorColor(saved.color);
          actor.material = setEntityMaterial(actor.animEntity, actor.color, actor.material);
        }
        setAnimationPose(actor, animationTracks, saved.pose);
      }
      if (layout.actors[0]) select(layout.actors[0].characterName);
      emitSelection();
    },
    capturePng() {
      const selectedOutlineEntity = selectionOutline.getEntity();
      selectionOutline.setEntity(null);
      transformGizmo.attach(null);
      // 摄像机机身与取景画中画是编辑器辅助对象，导出的摆位草图不包含它们。
      const bodyWasEnabled = shotCamera.body.enabled;
      shotCamera.body.enabled = false;
      const helpersWereSuppressed = shotCameraHelpersSuppressed;
      shotCameraHelpersSuppressed = true;
      syncShotCameraVisuals();
      try {
        app.resizeCanvas(BLOCKING_SKETCH_CAPTURE_SIZE.width, BLOCKING_SKETCH_CAPTURE_SIZE.height);
        // 第一帧只用于冲掉上一轮 update 排队的参考线（网格/边界/gizmo），
        // 第二帧才是干净的摆位画面：导出草图不能带编辑器辅助元素。
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
        shotCameraHelpersSuppressed = helpersWereSuppressed;
        syncShotCameraVisuals();
        shotCamera.body.enabled = bodyWasEnabled;
        selectionOutline.setEntity(selectedOutlineEntity);
        selectionOutline.frameUpdate();
        syncTransformGizmo();
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
      for (const actor of actors.values()) actor.entity.destroy();
      actors.clear();
      for (const runtime of sceneMarkerRuntimes.values()) destroySceneMarkerRuntime(runtime);
      sceneMarkerRuntimes.clear();
      environment.destroy();
      destroyProjectionCenterGizmo(projectionCenterGizmo);
      transformGizmo.destroy();
      shotCamera.destroy();
      selectionOutline.destroy();
      cameraFrame.destroy();
      app.destroy();
    },
  };

  try {
    if (options.environmentUrl) await viewer.setEnvironment(options.environmentUrl);
    return viewer;
  } catch (error) {
    viewer.destroy();
    throw error instanceof Error ? error : new Error(String(error));
  }
}
