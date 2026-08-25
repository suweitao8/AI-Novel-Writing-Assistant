import type {
  DramaShotBlockingSketch3DActor,
  DramaShotBlockingSketch3DCamera,
  DramaShotBlockingSketchActor,
  DramaShotBlockingSketchPose,
} from "@/api/media/drama";

export const BLOCKING_3D_POSES: readonly DramaShotBlockingSketchPose[] = [
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
];

export const BLOCKING_3D_POSE_LABELS: Record<DramaShotBlockingSketchPose, string> = {
  standing: "站立",
  talking: "交谈",
  arms_crossed: "抱臂",
  sitting: "坐着",
  crouching: "蹲伏",
  kneeling: "跪着",
  lying: "躺着",
  prone: "趴着",
  walking: "行走",
  running: "奔跑",
  pointing: "指向",
  holding: "持物",
  interacting: "互动",
  fighting: "格斗",
  sword: "持械",
};

export const DEFAULT_BLOCKING_3D_CAMERA: DramaShotBlockingSketch3DCamera = {
  azim: -45,
  elev: -12,
  distance: 8,
  focalPoint: [0, 0.8, 0],
  fovDeg: 52,
  nearClip: 0.05,
  farClip: 200,
  depthOfFieldEnabled: false,
  focusDistance: 8,
  focusRange: 5,
  blurRadius: 3,
};

const LIMITS = {
  cameraAzim: [-180, 180],
  cameraElev: [-89, 89],
  cameraDistance: [0.25, 100],
  cameraPoint: [-100, 100],
  cameraFov: [30, 100],
  cameraNearClip: [0.05, 5],
  cameraFarClip: [20, 300],
  cameraFocusDistance: [0.25, 100],
  cameraFocusRange: [0.1, 100],
  cameraBlurRadius: [0, 10],
  positionX: [-100, 100],
  positionY: [0, 50],
  positionZ: [-100, 100],
  yaw: [-180, 180],
  scale: [0.1, 10],
} as const;

function fail(message: string): never {
  throw new Error(`3D 摆位数据无效：${message}`);
}

function finite(value: unknown, label: string, min: number, max: number): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric) || numeric < min || numeric > max) fail(`${label}必须在 ${min} 到 ${max} 之间`);
  return numeric;
}

function stringValue(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) fail(`${label}不能为空`);
  return value.trim();
}

function array3(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value) || value.length !== 3) fail(`${label}必须是三个数字`);
  return value;
}

function tuple3(value: unknown, label: string, min: number, max: number): [number, number, number] {
  const items = array3(value, label);
  return [
    finite(items[0], `${label}1`, min, max),
    finite(items[1], `${label}2`, min, max),
    finite(items[2], `${label}3`, min, max),
  ];
}

function poseValue(value: unknown): DramaShotBlockingSketchPose {
  if (typeof value !== "string" || !(BLOCKING_3D_POSES as readonly string[]).includes(value)) {
    fail("姿势必须是支持的 3D 姿势");
  }
  return value as DramaShotBlockingSketchPose;
}

export function normalizeBlocking3dCamera(input: unknown): DramaShotBlockingSketch3DCamera {
  if (input === undefined || input === null) return { ...DEFAULT_BLOCKING_3D_CAMERA, focalPoint: [...DEFAULT_BLOCKING_3D_CAMERA.focalPoint] };
  if (!input || typeof input !== "object" || Array.isArray(input)) fail("相机不能为空");
  const camera = input as Record<string, unknown>;
  const optional = (value: unknown, fallback: number, label: string, limits: readonly [number, number]): number =>
    value === undefined ? fallback : finite(value, label, limits[0], limits[1]);
  const nearClip = optional(camera.nearClip, DEFAULT_BLOCKING_3D_CAMERA.nearClip, "近裁剪面", LIMITS.cameraNearClip);
  const farClip = optional(camera.farClip, DEFAULT_BLOCKING_3D_CAMERA.farClip, "远裁剪面", LIMITS.cameraFarClip);
  if (farClip <= nearClip) fail("远裁剪面必须大于近裁剪面");
  if (camera.depthOfFieldEnabled !== undefined && typeof camera.depthOfFieldEnabled !== "boolean") {
    fail("景深开关必须是布尔值");
  }
  return {
    azim: finite(camera.azim, "水平角", LIMITS.cameraAzim[0], LIMITS.cameraAzim[1]),
    elev: finite(camera.elev, "俯仰角", LIMITS.cameraElev[0], LIMITS.cameraElev[1]),
    distance: finite(camera.distance, "距离", LIMITS.cameraDistance[0], LIMITS.cameraDistance[1]),
    focalPoint: tuple3(camera.focalPoint, "焦点", LIMITS.cameraPoint[0], LIMITS.cameraPoint[1]),
    fovDeg: optional(camera.fovDeg, DEFAULT_BLOCKING_3D_CAMERA.fovDeg, "视野角", LIMITS.cameraFov),
    nearClip,
    farClip,
    depthOfFieldEnabled: camera.depthOfFieldEnabled === undefined ? DEFAULT_BLOCKING_3D_CAMERA.depthOfFieldEnabled : camera.depthOfFieldEnabled,
    focusDistance: optional(camera.focusDistance, DEFAULT_BLOCKING_3D_CAMERA.focusDistance, "焦点距离", LIMITS.cameraFocusDistance),
    focusRange: optional(camera.focusRange, DEFAULT_BLOCKING_3D_CAMERA.focusRange, "景深范围", LIMITS.cameraFocusRange),
    blurRadius: optional(camera.blurRadius, DEFAULT_BLOCKING_3D_CAMERA.blurRadius, "模糊半径", LIMITS.cameraBlurRadius),
  };
}

export function normalizeBlocking3dActor(input: unknown): DramaShotBlockingSketch3DActor {
  if (!input || typeof input !== "object" || Array.isArray(input)) fail("角色不能为空");
  const actor = input as Record<string, unknown>;
  const position = array3(actor.position, "位置");
  const scale = tuple3(actor.scale, "缩放", LIMITS.scale[0], LIMITS.scale[1]);
  if (typeof actor.actionPlaying !== "boolean") fail("动作播放状态必须是布尔值");
  return {
    characterName: stringValue(actor.characterName, "角色名称"),
    position: [
      finite(position[0], "横向位置", LIMITS.positionX[0], LIMITS.positionX[1]),
      finite(position[1], "高度", LIMITS.positionY[0], LIMITS.positionY[1]),
      finite(position[2], "纵向位置", LIMITS.positionZ[0], LIMITS.positionZ[1]),
    ],
    yawDeg: finite(actor.yawDeg, "旋转", LIMITS.yaw[0], LIMITS.yaw[1]),
    scale,
    pose: poseValue(actor.pose),
    actionPlaying: actor.actionPlaying,
  };
}

export function projectBlocking3dActorToLegacy(
  actor: DramaShotBlockingSketch3DActor,
  index: number,
): DramaShotBlockingSketchActor {
  const averageScale = (actor.scale[0] + actor.scale[1] + actor.scale[2]) / 3;
  return {
    characterName: actor.characterName,
    x: Math.max(0, Math.min(1, 0.5 + actor.position[0] / 10)),
    y: 0.82,
    scale: Number(Math.max(0.08, Math.min(2, averageScale * 0.4)).toFixed(4)),
    flipX: Math.cos((actor.yawDeg * Math.PI) / 180) > 0,
    zIndex: Math.max(0, Math.min(99, Math.trunc(index))),
  };
}
