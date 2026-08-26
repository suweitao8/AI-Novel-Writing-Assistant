import type {
  StoryScene3DEnvironment,
  StoryScene3DEnvironmentInput,
} from "@ai-novel/shared/types/comicDrama";
import type { StoryAssetSceneType } from "@ai-novel/shared/types/novelReferenceExtraction";

export const STORY_SCENE_3D_ENVIRONMENT_LIMITS = {
  projectionCenterHeight: { min: 1, max: 10 },
  domeRadius: { min: 10, max: 50 },
} as const;

export const DEFAULT_STORY_SCENE_3D_ENVIRONMENT: StoryScene3DEnvironment = {
  projectionCenterHeight: 2,
  domeRadius: 15,
  yawDeg: 0,
  intensity: 1,
};

export const STORY_SCENE_3D_DEFAULT_DOME_RADIUS_BY_TYPE: Record<StoryAssetSceneType, number> = {
  interior: 10,
  exterior: 15,
  nature: 20,
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function finiteOr(value: unknown, fallback: number): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
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
  return {
    ...DEFAULT_STORY_SCENE_3D_ENVIRONMENT,
    domeRadius: STORY_SCENE_3D_DEFAULT_DOME_RADIUS_BY_TYPE[resolvedType],
  };
}

export function normalizeStoryScene3dEnvironment(input: Partial<StoryScene3DEnvironment> | Record<string, unknown> | null | undefined): StoryScene3DEnvironment {
  const source = input as Record<string, unknown> | null | undefined;
  return {
    projectionCenterHeight: clamp(
      finiteOr(source?.projectionCenterHeight, DEFAULT_STORY_SCENE_3D_ENVIRONMENT.projectionCenterHeight),
      STORY_SCENE_3D_ENVIRONMENT_LIMITS.projectionCenterHeight.min,
      STORY_SCENE_3D_ENVIRONMENT_LIMITS.projectionCenterHeight.max,
    ),
    domeRadius: clamp(
      finiteOr(source?.domeRadius, DEFAULT_STORY_SCENE_3D_ENVIRONMENT.domeRadius),
      STORY_SCENE_3D_ENVIRONMENT_LIMITS.domeRadius.min,
      STORY_SCENE_3D_ENVIRONMENT_LIMITS.domeRadius.max,
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
    domeRadius: normalized.domeRadius,
    yawDeg: normalized.yawDeg,
    intensity: normalized.intensity,
    customized: options.customized ?? input != null,
  });
}

function isLegacyDefaultEnvironment(input: StoryScene3DEnvironment): boolean {
  return input.projectionCenterHeight === DEFAULT_STORY_SCENE_3D_ENVIRONMENT.projectionCenterHeight
    && input.domeRadius === DEFAULT_STORY_SCENE_3D_ENVIRONMENT.domeRadius
    && input.yawDeg === DEFAULT_STORY_SCENE_3D_ENVIRONMENT.yawDeg
    && input.intensity === DEFAULT_STORY_SCENE_3D_ENVIRONMENT.intensity;
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
      || (parsed.customized === undefined && !isLegacyDefaultEnvironment(normalized));
    return customized ? normalized : defaultEnvironment;
  } catch {
    return defaultEnvironment;
  }
}
