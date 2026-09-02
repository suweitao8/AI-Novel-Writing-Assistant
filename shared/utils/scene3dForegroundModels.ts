import type {
  StoryScene3DForegroundModel,
  StoryScene3DForegroundModelAnchor,
  StoryScene3DForegroundModelOrientation,
  StoryScene3DForegroundModelPlacementMode,
  StoryScene3DForegroundModelSupportSurface,
  StoryScene3DForegroundModelUsage,
  StoryScene3DVector3,
} from "../types/comicDrama.js";

/** 场景前景模型实例的共享安全边界；与分镜 3D layout 的边界保持一致。 */
export const STORY_SCENE_3D_FOREGROUND_MODEL_LIMITS = {
  maxModels: 32,
  positionX: { min: -100, max: 100 },
  positionY: { min: 0, max: 50 },
  positionZ: { min: -100, max: 100 },
  yawDeg: { min: -180, max: 180 },
  scale: { min: 0.1, max: 10 },
} as const;

const MODEL_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/;
const SUPPORT_SURFACES = new Set<StoryScene3DForegroundModelSupportSurface>([
  "ground",
  "wall",
  "ceiling",
  "horizontal-surface",
  "handheld",
  "free",
]);
const PLACEMENT_MODES = new Set<StoryScene3DForegroundModelPlacementMode>([
  "grounded",
  "wall-mounted",
  "ceiling-hung",
  "surface-placed",
  "handheld",
  "free",
]);
const ANCHORS = new Set<StoryScene3DForegroundModelAnchor>([
  "base",
  "back",
  "top",
  "support-center",
  "center",
]);
const ORIENTATIONS = new Set<StoryScene3DForegroundModelOrientation>([
  "upright",
  "horizontal",
  "wall-facing",
  "downward",
  "directional",
  "free",
]);

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function trimmedString(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed && trimmed.length <= maxLength ? trimmed : null;
}

function finiteInRange(value: unknown, min: number, max: number): number | null {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) && numeric >= min && numeric <= max ? numeric : null;
}

function tuple3InRange(
  value: unknown,
  ranges: readonly [{ min: number; max: number }, { min: number; max: number }, { min: number; max: number }],
): StoryScene3DVector3 | null {
  if (!Array.isArray(value) || value.length !== 3) return null;
  const result = value.map((item, index) => finiteInRange(item, ranges[index].min, ranges[index].max));
  return result.every((item): item is number => item !== null)
    ? result as StoryScene3DVector3
    : null;
}

function normalizeUsage(value: unknown): StoryScene3DForegroundModelUsage | undefined {
  const source = recordValue(value);
  if (!source) return undefined;
  const supportSurface = source.supportSurface;
  const placementMode = source.placementMode;
  const anchor = source.anchor;
  const orientation = source.orientation;
  if (typeof supportSurface !== "string" || !SUPPORT_SURFACES.has(supportSurface as StoryScene3DForegroundModelSupportSurface)) return undefined;
  if (typeof placementMode !== "string" || !PLACEMENT_MODES.has(placementMode as StoryScene3DForegroundModelPlacementMode)) return undefined;
  if (typeof anchor !== "string" || !ANCHORS.has(anchor as StoryScene3DForegroundModelAnchor)) return undefined;
  if (typeof orientation !== "string" || !ORIENTATIONS.has(orientation as StoryScene3DForegroundModelOrientation)) return undefined;
  if (typeof source.requiresFacingDirection !== "boolean") return undefined;
  const instruction = trimmedString(source.instruction, 300);
  return {
    supportSurface: supportSurface as StoryScene3DForegroundModelSupportSurface,
    placementMode: placementMode as StoryScene3DForegroundModelPlacementMode,
    anchor: anchor as StoryScene3DForegroundModelAnchor,
    orientation: orientation as StoryScene3DForegroundModelOrientation,
    requiresFacingDirection: source.requiresFacingDirection,
    ...(instruction ? { instruction } : {}),
  };
}

/** 单个模型实例的严格归一化；无法安全展示的旧数据返回 null。 */
export function normalizeStoryScene3dForegroundModel(value: unknown): StoryScene3DForegroundModel | null {
  const source = recordValue(value);
  if (!source) return null;
  const id = trimmedString(source.id, 120);
  const modelId = trimmedString(source.modelId, 120);
  const label = trimmedString(source.label, 80);
  const modelName = trimmedString(source.modelName, 120);
  const category = trimmedString(source.category, 40);
  const position = tuple3InRange(source.position, [
    STORY_SCENE_3D_FOREGROUND_MODEL_LIMITS.positionX,
    STORY_SCENE_3D_FOREGROUND_MODEL_LIMITS.positionY,
    STORY_SCENE_3D_FOREGROUND_MODEL_LIMITS.positionZ,
  ]);
  const yawDeg = finiteInRange(source.yawDeg, STORY_SCENE_3D_FOREGROUND_MODEL_LIMITS.yawDeg.min, STORY_SCENE_3D_FOREGROUND_MODEL_LIMITS.yawDeg.max);
  const scale = finiteInRange(source.scale, STORY_SCENE_3D_FOREGROUND_MODEL_LIMITS.scale.min, STORY_SCENE_3D_FOREGROUND_MODEL_LIMITS.scale.max);
  if (!id || !modelId || !MODEL_ID_PATTERN.test(modelId) || !label || !modelName || !category || !position || yawDeg === null || scale === null) {
    return null;
  }
  if (source.source !== "model-library") return null;
  const usage = normalizeUsage(source.usage);
  return {
    id,
    modelId,
    label,
    modelName,
    category,
    position,
    yawDeg,
    scale,
    source: "model-library",
    ...(usage ? { usage } : {}),
  };
}

/** 读取 statesJson/layout3d 时过滤不安全实例并限制单场景模型数量。 */
export function normalizeStoryScene3dForegroundModels(value: unknown): StoryScene3DForegroundModel[] {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, STORY_SCENE_3D_FOREGROUND_MODEL_LIMITS.maxModels)
    .map(normalizeStoryScene3dForegroundModel)
    .filter((model): model is StoryScene3DForegroundModel => Boolean(model));
}

export function isStoryScene3dForegroundModel(value: unknown): value is StoryScene3DForegroundModel {
  return normalizeStoryScene3dForegroundModel(value) !== null;
}
