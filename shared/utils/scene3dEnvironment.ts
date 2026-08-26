import type {
  StoryScene3DEnvironment,
  StoryScene3DEnvironmentInput,
} from "@ai-novel/shared/types/comicDrama";
import {
  STORY_SCENE_3D_DEFAULT_PANORAMA_HORIZON_V,
  STORY_SCENE_3D_ENVIRONMENT_LIMITS,
} from "@ai-novel/shared/types/comicDrama";
import type { StoryAssetSceneType } from "@ai-novel/shared/types/novelReferenceExtraction";

export { STORY_SCENE_3D_ENVIRONMENT_LIMITS };

/**
 * 投射中心高度的用户参数是“相对半球直径的百分比”（5%–20%，默认 10%），
 * 世界高度恒为 domeRadius × ratio 并在此处派生；这样拖动直径时投射中心
 * 保持同一比例，整体等比缩放。
 */
export const DEFAULT_STORY_SCENE_3D_ENVIRONMENT: StoryScene3DEnvironment = {
  // 无场景类型时的兜底组合与室外一致（直径 10、占比 17% → 高度 1.7 米）。
  projectionCenterHeight: deriveHeight(10, 0.17),
  projectionCenterHeightRatio: 0.17,
  domeRadius: 10,
  panoramaHorizonV: STORY_SCENE_3D_DEFAULT_PANORAMA_HORIZON_V,
  yawDeg: 0,
  intensity: 1,
};

export const STORY_SCENE_3D_DEFAULT_DOME_RADIUS_BY_TYPE: Record<StoryAssetSceneType, number> = {
  // 室内空间较小：默认直径 6、占比 10%，投射中心落在 0.6 米。
  interior: 6,
  exterior: 10,
  nature: 20,
};

export const STORY_SCENE_3D_DEFAULT_PROJECTION_CENTER_HEIGHT_RATIO_BY_TYPE: Record<StoryAssetSceneType, number> = {
  interior: 0.1,
  exterior: 0.17,
  nature: 0.05,
};

const LEGACY_DEFAULT_STORY_SCENE_3D_ENVIRONMENTS: readonly StoryScene3DEnvironment[] = [
  legacyDefault(2, 10, 0.2),
  legacyDefault(2, 15, 2 / 15),
  legacyDefault(2, 20, 0.1),
  legacyDefault(1, 8, 0.125),
  legacyDefault(1.7, 10, 0.17),
  legacyDefault(1, 20, 0.05),
  // 历任室内默认值：无 customized 标记的存量记录按未定制处理，回落到当前默认。
  legacyDefault(0.8, 5, 0.16),
  legacyDefault(0.5, 5, 0.1),
];

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function finiteOr(value: unknown, fallback: number): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

/** 高度按直径 × 占比派生并保留两位小数，避免浮点误差在往返中累积。 */
function deriveHeight(domeRadius: number, ratio: number): number {
  return Math.round(domeRadius * ratio * 100) / 100;
}

/** 构造与旧绝对高度快照等价的“历史默认”条目，供未定制回落判断使用。 */
function legacyDefault(height: number, domeRadius: number, ratio: number): StoryScene3DEnvironment {
  return {
    projectionCenterHeight: height,
    // 与 normalize 的推导精度一致（万分比圆整），保证未定制比较逐字段相等。
    projectionCenterHeightRatio: Math.round(clamp(ratio,
      STORY_SCENE_3D_ENVIRONMENT_LIMITS.projectionCenterHeightRatio.min,
      STORY_SCENE_3D_ENVIRONMENT_LIMITS.projectionCenterHeightRatio.max) * 10000) / 10000,
    domeRadius,
    panoramaHorizonV: STORY_SCENE_3D_DEFAULT_PANORAMA_HORIZON_V,
    yawDeg: 0,
    intensity: 1,
  };
}

export function normalizeStorySceneType(value: unknown): StoryAssetSceneType | null {
  return value === "interior" || value === "exterior" || value === "nature"
    ? value
    : null;
}

/** 状态类型是当前资产的权威值，场景级类型只为旧数据提供兼容回退。 */
export function resolveStorySceneType(
  sceneType: unknown,
  defaultStateType?: unknown,
): StoryAssetSceneType {
  return normalizeStorySceneType(defaultStateType)
    ?? normalizeStorySceneType(sceneType)
    ?? "exterior";
}

export function getDefaultStoryScene3dEnvironment(sceneType?: unknown): StoryScene3DEnvironment {
  const resolvedType = resolveStorySceneType(sceneType);
  const ratio = STORY_SCENE_3D_DEFAULT_PROJECTION_CENTER_HEIGHT_RATIO_BY_TYPE[resolvedType];
  const domeRadius = STORY_SCENE_3D_DEFAULT_DOME_RADIUS_BY_TYPE[resolvedType];
  return {
    ...DEFAULT_STORY_SCENE_3D_ENVIRONMENT,
    projectionCenterHeightRatio: ratio,
    projectionCenterHeight: deriveHeight(domeRadius, ratio),
    domeRadius,
  };
}

export function normalizeStoryScene3dEnvironment(input: Partial<StoryScene3DEnvironment> | Record<string, unknown> | null | undefined): StoryScene3DEnvironment {
  const source = input as Record<string, unknown> | null | undefined;
  const rawDomeRadius = finiteOr(source?.domeRadius, DEFAULT_STORY_SCENE_3D_ENVIRONMENT.domeRadius);
  const domeRadius = clamp(
    rawDomeRadius,
    STORY_SCENE_3D_ENVIRONMENT_LIMITS.domeRadius.min,
    STORY_SCENE_3D_ENVIRONMENT_LIMITS.domeRadius.max,
  );
  // 占比是权威调节参数；缺失时按存量高度与原始直径推导（clamp 进合同范围），
  // 高度随后一律由 裁剪后直径 × 占比 派生，保证拖动直径时投射中心等比跟随。
  const derivedFromStoredHeight = rawDomeRadius > 0
    && typeof source?.projectionCenterHeight === "number"
    && Number.isFinite(source.projectionCenterHeight)
    ? source.projectionCenterHeight / rawDomeRadius
    : Number.NaN;
  const ratioSource = finiteOr(
    source?.projectionCenterHeightRatio,
    Number.isFinite(derivedFromStoredHeight)
      ? derivedFromStoredHeight
      : DEFAULT_STORY_SCENE_3D_ENVIRONMENT.projectionCenterHeightRatio,
  );
  const ratio = Math.round(clamp(
    ratioSource,
    STORY_SCENE_3D_ENVIRONMENT_LIMITS.projectionCenterHeightRatio.min,
    STORY_SCENE_3D_ENVIRONMENT_LIMITS.projectionCenterHeightRatio.max,
  ) * 10000) / 10000;
  return {
    projectionCenterHeight: clamp(
      deriveHeight(domeRadius, ratio),
      STORY_SCENE_3D_ENVIRONMENT_LIMITS.projectionCenterHeight.min,
      STORY_SCENE_3D_ENVIRONMENT_LIMITS.projectionCenterHeight.max,
    ),
    projectionCenterHeightRatio: ratio,
    domeRadius,
    panoramaHorizonV: clamp(
      finiteOr(source?.panoramaHorizonV, DEFAULT_STORY_SCENE_3D_ENVIRONMENT.panoramaHorizonV),
      STORY_SCENE_3D_ENVIRONMENT_LIMITS.panoramaHorizonV.min,
      STORY_SCENE_3D_ENVIRONMENT_LIMITS.panoramaHorizonV.max,
    ),
    yawDeg: 0,
    intensity: 1,
  };
}

export function parseStoryScene3dEnvironment(raw: string | null | undefined): StoryScene3DEnvironment {
  if (!raw?.trim()) {
    return DEFAULT_STORY_SCENE_3D_ENVIRONMENT;
  }
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return normalizeStoryScene3dEnvironment(parsed);
  } catch {
    return DEFAULT_STORY_SCENE_3D_ENVIRONMENT;
  }
}

export function serializeStoryScene3dEnvironment(
  input: StoryScene3DEnvironmentInput | Partial<StoryScene3DEnvironment> | Record<string, unknown> | null | undefined,
  options: { customized?: boolean } = {},
): string {
  const normalized = normalizeStoryScene3dEnvironment(input);
  return JSON.stringify({
    projectionCenterHeight: normalized.projectionCenterHeight,
    projectionCenterHeightRatio: normalized.projectionCenterHeightRatio,
    domeRadius: normalized.domeRadius,
    panoramaHorizonV: normalized.panoramaHorizonV,
    yawDeg: normalized.yawDeg,
    intensity: normalized.intensity,
    customized: options.customized ?? input != null,
  });
}

function isUncustomizedDefaultEnvironment(input: StoryScene3DEnvironment): boolean {
  return LEGACY_DEFAULT_STORY_SCENE_3D_ENVIRONMENTS.some((candidate) => (
    input.projectionCenterHeight === candidate.projectionCenterHeight
    && input.projectionCenterHeightRatio === candidate.projectionCenterHeightRatio
    && input.domeRadius === candidate.domeRadius
    && input.panoramaHorizonV === candidate.panoramaHorizonV
    && input.yawDeg === candidate.yawDeg
    && input.intensity === candidate.intensity
  ));
}

export function resolveStoryScene3dEnvironment(
  sceneType: unknown,
  raw: string | null | undefined,
  defaultStateType?: unknown,
): StoryScene3DEnvironment {
  const defaultEnvironment = getDefaultStoryScene3dEnvironment(
    resolveStorySceneType(sceneType, defaultStateType),
  );
  if (!raw?.trim()) {
    return defaultEnvironment;
  }
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown> & { customized?: unknown };
    const normalized = normalizeStoryScene3dEnvironment(parsed);
    const customized = parsed.customized === true
      || (parsed.customized === undefined && !isUncustomizedDefaultEnvironment(normalized));
    return customized ? normalized : defaultEnvironment;
  } catch {
    return defaultEnvironment;
  }
}
