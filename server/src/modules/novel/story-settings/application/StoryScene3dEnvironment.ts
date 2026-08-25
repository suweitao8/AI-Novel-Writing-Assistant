import type {
  StoryScene3DEnvironment,
  StoryScene3DEnvironmentInput,
} from "@ai-novel/shared/types/comicDrama";

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

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function finiteOr(value: unknown, fallback: number): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
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

export function serializeStoryScene3dEnvironment(input: StoryScene3DEnvironmentInput | Partial<StoryScene3DEnvironment> | null | undefined): string {
  return JSON.stringify(normalizeStoryScene3dEnvironment(input));
}
