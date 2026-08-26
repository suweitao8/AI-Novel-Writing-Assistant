import type {
  StoryScene3DEnvironment,
  StoryScene3DEnvironmentInput,
} from "@ai-novel/shared/types/comicDrama";
import type { StoryAssetSceneType } from "@ai-novel/shared/types/novelReferenceExtraction";

export const STORY_SCENE_3D_ENVIRONMENT_LIMITS = {
  projectionCenterHeight: { min: 1, max: 10 },
  domeRadius: { min: 10, max: 50 },
  panoramaHorizonV: { min: 0.4, max: 0.65 },
} as const;

export const DEFAULT_STORY_SCENE_3D_ENVIRONMENT: StoryScene3DEnvironment = {
  projectionCenterHeight: 2,
  domeRadius: 15,
  panoramaHorizonV: 0.5,
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
  fallbackStateType?: unknown,
): StoryAssetSceneType {
  return normalizeStorySceneType(fallbackStateType)
    ?? normalizeStorySceneType(sceneType)
    ?? "exterior";
}

export function getDefaultStoryScene3dEnvironment(sceneType?: unknown): StoryScene3DEnvironment {
  const resolvedType = resolveStorySceneType(undefined, sceneType);
  return {
    ...DEFAULT_STORY_SCENE_3D_ENVIRONMENT,
    domeRadius: STORY_SCENE_3D_DEFAULT_DOME_RADIUS_BY_TYPE[resolvedType],
  };
}

export function normalizeStoryScene3dEnvironment(input: Partial<StoryScene3DEnvironment> | null | undefined): StoryScene3DEnvironment {
  return {
    projectionCenterHeight: clamp(
      finiteOr(input?.projectionCenterHeight, DEFAULT_STORY_SCENE_3D_ENVIRONMENT.projectionCenterHeight),
      STORY_SCENE_3D_ENVIRONMENT_LIMITS.projectionCenterHeight.min,
      STORY_SCENE_3D_ENVIRONMENT_LIMITS.projectionCenterHeight.max,
    ),
    domeRadius: clamp(
      finiteOr(input?.domeRadius, DEFAULT_STORY_SCENE_3D_ENVIRONMENT.domeRadius),
      STORY_SCENE_3D_ENVIRONMENT_LIMITS.domeRadius.min,
      STORY_SCENE_3D_ENVIRONMENT_LIMITS.domeRadius.max,
    ),
    panoramaHorizonV: clamp(
      finiteOr(input?.panoramaHorizonV, DEFAULT_STORY_SCENE_3D_ENVIRONMENT.panoramaHorizonV),
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
    const parsed = JSON.parse(raw) as Partial<StoryScene3DEnvironment>;
    return normalizeStoryScene3dEnvironment(parsed);
  } catch {
    return DEFAULT_STORY_SCENE_3D_ENVIRONMENT;
  }
}

export function serializeStoryScene3dEnvironment(
  input: StoryScene3DEnvironmentInput | Partial<StoryScene3DEnvironment> | null | undefined,
  options: { customized?: boolean } = {},
): string {
  return JSON.stringify({
    ...normalizeStoryScene3dEnvironment(input),
    customized: options.customized ?? input != null,
  });
}

function isLegacyDefaultEnvironment(input: StoryScene3DEnvironment): boolean {
  return input.projectionCenterHeight === DEFAULT_STORY_SCENE_3D_ENVIRONMENT.projectionCenterHeight
    && input.domeRadius === DEFAULT_STORY_SCENE_3D_ENVIRONMENT.domeRadius
    && input.panoramaHorizonV === DEFAULT_STORY_SCENE_3D_ENVIRONMENT.panoramaHorizonV
    && input.yawDeg === DEFAULT_STORY_SCENE_3D_ENVIRONMENT.yawDeg
    && input.intensity === DEFAULT_STORY_SCENE_3D_ENVIRONMENT.intensity;
}

export function resolveStoryScene3dEnvironment(
  sceneType: unknown,
  raw: string | null | undefined,
  fallbackStateType?: unknown,
): StoryScene3DEnvironment {
  const defaultEnvironment = getDefaultStoryScene3dEnvironment(
    resolveStorySceneType(sceneType, fallbackStateType),
  );
  if (!raw?.trim()) {
    return defaultEnvironment;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<StoryScene3DEnvironment> & { customized?: unknown };
    const normalized = normalizeStoryScene3dEnvironment(parsed);
    const customized = parsed.customized === true
      || (parsed.customized === undefined && !isLegacyDefaultEnvironment(normalized));
    return customized ? normalized : defaultEnvironment;
  } catch {
    return defaultEnvironment;
  }
}
