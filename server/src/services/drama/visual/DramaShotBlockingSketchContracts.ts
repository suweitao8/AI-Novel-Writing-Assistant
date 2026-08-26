import {
  STORY_ASSET_CHARACTER_HEIGHT_MAX_METERS,
  STORY_ASSET_CHARACTER_HEIGHT_MIN_METERS,
} from "@ai-novel/shared/types/novelReferenceExtraction";

export const BLOCKING_SKETCH_CANVAS = {
  width: 1280,
  height: 720,
} as const;

export const BLOCKING_SKETCH_LIMITS = {
  yawDeg: { min: -180, max: 180 },
  pitchDeg: { min: -60, max: 60 },
  fovDeg: { min: 40, max: 100 },
  position: { min: 0, max: 1 },
  scale: { min: 0.08, max: 2 },
  zIndex: { min: 0, max: 99 },
  maxActors: 12,
} as const;

export const BLOCKING_SKETCH_3D_LIMITS = {
  cameraAzimDeg: { min: -180, max: 180 },
  cameraElevDeg: { min: -89, max: 89 },
  cameraDistance: { min: 0.25, max: 100 },
  cameraFocalPoint: { min: -100, max: 100 },
  cameraFovDeg: { min: 30, max: 100 },
  cameraNearClip: { min: 0.05, max: 5 },
  cameraFarClip: { min: 20, max: 300 },
  cameraFocusDistance: { min: 0.25, max: 100 },
  cameraFocusRange: { min: 0.1, max: 100 },
  cameraBlurRadius: { min: 0, max: 10 },
  positionX: { min: -100, max: 100 },
  positionY: { min: 0, max: 50 },
  positionZ: { min: -100, max: 100 },
  yawDeg: { min: -180, max: 180 },
  scale: { min: 0.1, max: 10 },
  heightMeters: {
    min: STORY_ASSET_CHARACTER_HEIGHT_MIN_METERS,
    max: STORY_ASSET_CHARACTER_HEIGHT_MAX_METERS,
  },
} as const;

export const BLOCKING_SKETCH_3D_CAMERA_DEFAULTS = {
  fovDeg: 52,
  nearClip: 0.05,
  farClip: 200,
  depthOfFieldEnabled: false,
  focusDistance: 8,
  focusRange: 5,
  blurRadius: 3,
} as const;

export const BLOCKING_SKETCH_3D_ENVIRONMENT_LIMITS = {
  projectionCenterHeight: { min: 1, max: 10 },
  domeRadius: { min: 10, max: 50 },
  panoramaHorizonV: { min: 0.4, max: 0.65 },
  yawDeg: { min: -180, max: 180 },
  intensity: { min: 0.6, max: 1.6 },
} as const;

export const BLOCKING_SKETCH_POSES = [
  "standing",
  "talking",
  "arms_crossed",
  "sitting",
  "crouching",
  "kneeling",
  "lying",
  "prone",
  "walking",
  "running",
  "pointing",
  "holding",
  "interacting",
  "fighting",
  "sword",
] as const;

export type DramaShotBlockingSketchPose = typeof BLOCKING_SKETCH_POSES[number];

export type DramaShotBlockingSketchStatus = "draft" | "confirmed";

export interface DramaShotBlockingSketchScene {
  assetId: string;
  stateId: string;
  imageUrl: string;
  yawDeg: number;
  pitchDeg: number;
  fovDeg: number;
}

export interface DramaShotBlockingSketchActor {
  characterName: string;
  assetId?: string;
  stateId?: string;
  imageUrl?: string;
  x: number;
  y: number;
  scale: number;
  flipX: boolean;
  zIndex: number;
}

export interface DramaShotBlockingSketch3DCamera {
  azim: number;
  elev: number;
  distance: number;
  focalPoint: [number, number, number];
  fovDeg: number;
  nearClip: number;
  farClip: number;
  depthOfFieldEnabled: boolean;
  focusDistance: number;
  focusRange: number;
  blurRadius: number;
}

export interface DramaShotBlockingSketch3DActor {
  characterName: string;
  position: [number, number, number];
  yawDeg: number;
  scale: [number, number, number];
  /** 角色资产推断出的近似身高；旧布局缺失此字段时保留原始绝对缩放。 */
  heightMeters?: number;
  pose: DramaShotBlockingSketchPose;
  /** Optional RGB values in the 0..1 range; omitted by older snapshots. */
  color?: [number, number, number];
  /** Compatibility marker for older snapshots; 3D 草图始终保存静态关键帧。 */
  actionPlaying: boolean;
}

export interface DramaShotBlockingSketch3DEnvironment {
  projectionCenterHeight: number;
  domeRadius: number;
  panoramaHorizonV: number;
  yawDeg: number;
  intensity: number;
}

export interface DramaShotBlockingSketch3DLayout {
  schemaVersion: 1;
  engine: "playcanvas";
  camera: DramaShotBlockingSketch3DCamera;
  actors: DramaShotBlockingSketch3DActor[];
  environment?: DramaShotBlockingSketch3DEnvironment;
}

export interface DramaShotBlockingSketchData {
  status: DramaShotBlockingSketchStatus;
  version: number;
  url?: string;
  generatedAt?: string;
  scene: DramaShotBlockingSketchScene;
  actors: DramaShotBlockingSketchActor[];
  layout3d?: DramaShotBlockingSketch3DLayout;
}

function invalid(message: string): never {
  throw new Error(`摆位草图数据无效：${message}`);
}

function stringValue(value: unknown, label: string, required = true): string | undefined {
  if (typeof value !== "string") {
    if (required) invalid(`${label}不能为空`);
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    if (required) invalid(`${label}不能为空`);
    return undefined;
  }
  return trimmed;
}

function finiteNumber(value: unknown, label: string, min: number, max: number, integer = false): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric) || numeric < min || numeric > max || (integer && !Number.isInteger(numeric))) {
    invalid(`${label}必须在 ${min} 到 ${max} 之间`);
  }
  return numeric;
}

function clampedEnvironmentNumber(
  value: unknown,
  label: string,
  min: number,
  max: number,
  acceptedMin: number,
  acceptedMax: number,
): number {
  return Math.max(min, Math.min(max, finiteNumber(value, label, acceptedMin, acceptedMax)));
}

function objectValue(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    invalid(`${label}不能为空`);
  }
  return value as Record<string, unknown>;
}

function optionalBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") {
    invalid(`${label}必须是布尔值`);
  }
  return value;
}

function tuple3(value: unknown, label: string, min: number, max: number): [number, number, number] {
  if (!Array.isArray(value) || value.length !== 3) {
    invalid(`${label}必须是三个数字`);
  }
  return [0, 1, 2].map((index) => finiteNumber(value[index], `${label}${index + 1}`, min, max)) as [number, number, number];
}

function array3(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value) || value.length !== 3) {
    invalid(`${label}必须是三个数字`);
  }
  return value;
}

function normalizePose(value: unknown): DramaShotBlockingSketchPose {
  if (typeof value !== "string" || !(BLOCKING_SKETCH_POSES as readonly string[]).includes(value)) {
    invalid("姿势必须是支持的 3D 姿势");
  }
  return value as DramaShotBlockingSketchPose;
}

function normalize3dCamera(input: unknown): DramaShotBlockingSketch3DCamera {
  const camera = objectValue(input, "3D 相机");
  const optionalNumber = (value: unknown, fallback: number, label: string, min: number, max: number): number =>
    value === undefined ? fallback : finiteNumber(value, label, min, max);
  const depthOfFieldEnabled = camera.depthOfFieldEnabled === undefined
    ? BLOCKING_SKETCH_3D_CAMERA_DEFAULTS.depthOfFieldEnabled
    : optionalBoolean(camera.depthOfFieldEnabled, "3D 相机景深开关");
  const nearClip = optionalNumber(
    camera.nearClip,
    BLOCKING_SKETCH_3D_CAMERA_DEFAULTS.nearClip,
    "3D 相机近裁剪面",
    BLOCKING_SKETCH_3D_LIMITS.cameraNearClip.min,
    BLOCKING_SKETCH_3D_LIMITS.cameraNearClip.max,
  );
  const farClip = optionalNumber(
    camera.farClip,
    BLOCKING_SKETCH_3D_CAMERA_DEFAULTS.farClip,
    "3D 相机远裁剪面",
    BLOCKING_SKETCH_3D_LIMITS.cameraFarClip.min,
    BLOCKING_SKETCH_3D_LIMITS.cameraFarClip.max,
  );
  if (farClip <= nearClip) invalid("3D 相机远裁剪面必须大于近裁剪面");
  return {
    azim: finiteNumber(camera.azim, "3D 相机水平角", BLOCKING_SKETCH_3D_LIMITS.cameraAzimDeg.min, BLOCKING_SKETCH_3D_LIMITS.cameraAzimDeg.max),
    elev: finiteNumber(camera.elev, "3D 相机俯仰角", BLOCKING_SKETCH_3D_LIMITS.cameraElevDeg.min, BLOCKING_SKETCH_3D_LIMITS.cameraElevDeg.max),
    distance: finiteNumber(camera.distance, "3D 相机距离", BLOCKING_SKETCH_3D_LIMITS.cameraDistance.min, BLOCKING_SKETCH_3D_LIMITS.cameraDistance.max),
    focalPoint: tuple3(camera.focalPoint, "3D 相机焦点", BLOCKING_SKETCH_3D_LIMITS.cameraFocalPoint.min, BLOCKING_SKETCH_3D_LIMITS.cameraFocalPoint.max),
    fovDeg: optionalNumber(
      camera.fovDeg,
      BLOCKING_SKETCH_3D_CAMERA_DEFAULTS.fovDeg,
      "3D 相机视野角",
      BLOCKING_SKETCH_3D_LIMITS.cameraFovDeg.min,
      BLOCKING_SKETCH_3D_LIMITS.cameraFovDeg.max,
    ),
    nearClip,
    farClip,
    depthOfFieldEnabled,
    focusDistance: optionalNumber(
      camera.focusDistance,
      BLOCKING_SKETCH_3D_CAMERA_DEFAULTS.focusDistance,
      "3D 相机焦点距离",
      BLOCKING_SKETCH_3D_LIMITS.cameraFocusDistance.min,
      BLOCKING_SKETCH_3D_LIMITS.cameraFocusDistance.max,
    ),
    focusRange: optionalNumber(
      camera.focusRange,
      BLOCKING_SKETCH_3D_CAMERA_DEFAULTS.focusRange,
      "3D 相机景深范围",
      BLOCKING_SKETCH_3D_LIMITS.cameraFocusRange.min,
      BLOCKING_SKETCH_3D_LIMITS.cameraFocusRange.max,
    ),
    blurRadius: optionalNumber(
      camera.blurRadius,
      BLOCKING_SKETCH_3D_CAMERA_DEFAULTS.blurRadius,
      "3D 相机景深模糊半径",
      BLOCKING_SKETCH_3D_LIMITS.cameraBlurRadius.min,
      BLOCKING_SKETCH_3D_LIMITS.cameraBlurRadius.max,
    ),
  };
}

function normalize3dActor(input: unknown): DramaShotBlockingSketch3DActor {
  const actor = objectValue(input, "3D 角色");
  const position = array3(actor.position, "3D 角色位置");
  const color = actor.color === undefined
    ? undefined
    : tuple3(actor.color, "3D 角色颜色", 0, 1);
  const heightMeters = actor.heightMeters === undefined
    ? undefined
    : finiteNumber(
      actor.heightMeters,
      "3D 角色身高基准",
      BLOCKING_SKETCH_3D_LIMITS.heightMeters.min,
      BLOCKING_SKETCH_3D_LIMITS.heightMeters.max,
    );
  // Keep validating the legacy field so malformed old snapshots are still rejected,
  // but normalize every accepted layout to the static-frame contract.
  optionalBoolean(actor.actionPlaying, "3D 角色动作播放状态");
  return {
    characterName: stringValue(actor.characterName, "3D 角色名称")!,
    position: [
      finiteNumber(position[0], "3D 角色横向位置", BLOCKING_SKETCH_3D_LIMITS.positionX.min, BLOCKING_SKETCH_3D_LIMITS.positionX.max),
      finiteNumber(position[1], "3D 角色高度", BLOCKING_SKETCH_3D_LIMITS.positionY.min, BLOCKING_SKETCH_3D_LIMITS.positionY.max),
      finiteNumber(position[2], "3D 角色纵向位置", BLOCKING_SKETCH_3D_LIMITS.positionZ.min, BLOCKING_SKETCH_3D_LIMITS.positionZ.max),
    ],
    yawDeg: finiteNumber(actor.yawDeg, "3D 角色旋转", BLOCKING_SKETCH_3D_LIMITS.yawDeg.min, BLOCKING_SKETCH_3D_LIMITS.yawDeg.max),
    scale: tuple3(actor.scale, "3D 角色缩放", BLOCKING_SKETCH_3D_LIMITS.scale.min, BLOCKING_SKETCH_3D_LIMITS.scale.max),
    ...(heightMeters === undefined ? {} : { heightMeters }),
    pose: normalizePose(actor.pose),
    ...(color ? { color } : {}),
    actionPlaying: false,
  };
}

function normalize3dEnvironment(input: unknown): DramaShotBlockingSketch3DEnvironment {
  const environment = objectValue(input, "HDRI 环境");
  finiteNumber(environment.yawDeg, "HDRI 环境水平旋转", BLOCKING_SKETCH_3D_ENVIRONMENT_LIMITS.yawDeg.min, BLOCKING_SKETCH_3D_ENVIRONMENT_LIMITS.yawDeg.max);
  finiteNumber(environment.intensity, "HDRI 环境亮度", BLOCKING_SKETCH_3D_ENVIRONMENT_LIMITS.intensity.min, BLOCKING_SKETCH_3D_ENVIRONMENT_LIMITS.intensity.max);
  return {
    projectionCenterHeight: clampedEnvironmentNumber(environment.projectionCenterHeight, "HDRI 环境投射中心高度", BLOCKING_SKETCH_3D_ENVIRONMENT_LIMITS.projectionCenterHeight.min, BLOCKING_SKETCH_3D_ENVIRONMENT_LIMITS.projectionCenterHeight.max, 0.6, 10),
    domeRadius: clampedEnvironmentNumber(environment.domeRadius, "HDRI 环境半球直径", BLOCKING_SKETCH_3D_ENVIRONMENT_LIMITS.domeRadius.min, BLOCKING_SKETCH_3D_ENVIRONMENT_LIMITS.domeRadius.max, 10, 100),
    panoramaHorizonV: clampedEnvironmentNumber(environment.panoramaHorizonV ?? 0.5, "HDRI 环境全景地面分界", BLOCKING_SKETCH_3D_ENVIRONMENT_LIMITS.panoramaHorizonV.min, BLOCKING_SKETCH_3D_ENVIRONMENT_LIMITS.panoramaHorizonV.max, 0.4, 0.65),
    yawDeg: 0,
    intensity: 1,
  };
}

export function normalizeBlockingSketch3dLayout(input: unknown): DramaShotBlockingSketch3DLayout {
  const layout = objectValue(input, "3D 摆位");
  if (layout.schemaVersion !== 1) invalid("3D 摆位版本不受支持");
  if (layout.engine !== "playcanvas") invalid("3D 摆位引擎不受支持");
  if (!Array.isArray(layout.actors) || layout.actors.length > BLOCKING_SKETCH_LIMITS.maxActors) {
    invalid(`3D 角色数量不能超过 ${BLOCKING_SKETCH_LIMITS.maxActors}`);
  }
  return {
    schemaVersion: 1,
    engine: "playcanvas",
    camera: normalize3dCamera(layout.camera),
    actors: layout.actors.map(normalize3dActor),
    ...(layout.environment === undefined ? {} : { environment: normalize3dEnvironment(layout.environment) }),
  };
}

function normalizeScene(input: unknown): DramaShotBlockingSketchScene {
  const scene = objectValue(input, "场景");
  return {
    assetId: stringValue(scene.assetId, "场景资产")!,
    stateId: stringValue(scene.stateId, "场景状态")!,
    imageUrl: stringValue(scene.imageUrl, "场景图片")!,
    yawDeg: finiteNumber(scene.yawDeg, "水平视角", BLOCKING_SKETCH_LIMITS.yawDeg.min, BLOCKING_SKETCH_LIMITS.yawDeg.max),
    pitchDeg: finiteNumber(scene.pitchDeg, "俯仰角", BLOCKING_SKETCH_LIMITS.pitchDeg.min, BLOCKING_SKETCH_LIMITS.pitchDeg.max),
    fovDeg: finiteNumber(scene.fovDeg, "视野角", BLOCKING_SKETCH_LIMITS.fovDeg.min, BLOCKING_SKETCH_LIMITS.fovDeg.max),
  };
}

function normalizeActor(input: unknown): DramaShotBlockingSketchActor {
  const actor = objectValue(input, "角色");
  return {
    characterName: stringValue(actor.characterName, "角色名称")!,
    ...(stringValue(actor.assetId, "角色资产", false) ? { assetId: stringValue(actor.assetId, "角色资产", false) } : {}),
    ...(stringValue(actor.stateId, "角色状态", false) ? { stateId: stringValue(actor.stateId, "角色状态", false) } : {}),
    ...(stringValue(actor.imageUrl, "角色图片", false) ? { imageUrl: stringValue(actor.imageUrl, "角色图片", false) } : {}),
    x: finiteNumber(actor.x, "横向位置", BLOCKING_SKETCH_LIMITS.position.min, BLOCKING_SKETCH_LIMITS.position.max),
    y: finiteNumber(actor.y, "纵向位置", BLOCKING_SKETCH_LIMITS.position.min, BLOCKING_SKETCH_LIMITS.position.max),
    scale: finiteNumber(actor.scale, "角色缩放", BLOCKING_SKETCH_LIMITS.scale.min, BLOCKING_SKETCH_LIMITS.scale.max),
    flipX: optionalBoolean(actor.flipX, "角色翻转"),
    zIndex: finiteNumber(actor.zIndex, "角色层级", BLOCKING_SKETCH_LIMITS.zIndex.min, BLOCKING_SKETCH_LIMITS.zIndex.max, true),
  };
}

export function normalizeBlockingSketchData(input: unknown): DramaShotBlockingSketchData {
  const data = objectValue(input, "草图");
  if (data.status !== "draft" && data.status !== "confirmed") {
    invalid("状态必须是 draft 或 confirmed");
  }
  if (!Array.isArray(data.actors) || data.actors.length > BLOCKING_SKETCH_LIMITS.maxActors) {
    invalid(`角色数量不能超过 ${BLOCKING_SKETCH_LIMITS.maxActors}`);
  }
  const url = stringValue(data.url, "草图图片", false);
  const generatedAt = stringValue(data.generatedAt, "生成时间", false);
  const layout3d = data.layout3d === undefined ? undefined : normalizeBlockingSketch3dLayout(data.layout3d);
  return {
    status: data.status,
    version: finiteNumber(data.version, "版本号", 1, Number.MAX_SAFE_INTEGER, true),
    ...(url ? { url } : {}),
    ...(generatedAt ? { generatedAt } : {}),
    scene: normalizeScene(data.scene),
    actors: data.actors.map(normalizeActor),
    ...(layout3d ? { layout3d } : {}),
  };
}

export function parseBlockingSketchData(raw: string | null | undefined): DramaShotBlockingSketchData | null {
  if (!raw?.trim()) {
    return null;
  }
  try {
    return normalizeBlockingSketchData(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function isConfirmedBlockingSketch(data: DramaShotBlockingSketchData | null | undefined): data is DramaShotBlockingSketchData & { status: "confirmed"; url: string } {
  return Boolean(data && data.status === "confirmed" && data.url?.trim());
}
