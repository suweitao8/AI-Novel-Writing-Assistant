import type {
  StoryAssetState,
  StoryAssetStateInput,
  StoryAssetSceneType,
  StoryAssetTimeOfDay,
  StoryAssetWeather,
} from "@ai-novel/shared/types/novelReferenceExtraction";
import { normalizeStoryAssetStates } from "@ai-novel/shared/types/novelReferenceExtraction";
import type { StoryScene3DEnvironmentInput } from "@ai-novel/shared/types/comicDrama";
import { STORY_SCENE_3D_MARKER_FALLBACK_WALL_RADIUS_RATIO } from "@ai-novel/shared/utils/scene3dProjection";
import {
  STORY_SCENE_3D_MARKERS_ENABLED,
  adoptLegacyStoryScene3dMarkerEnvironment,
  normalizeStoryScene3dMarkerSet,
} from "@ai-novel/shared/utils/scene3dMarkers";

/**
 * 场景资产状态的跨上下文归一化：novel 设定中心与漫剧分镜共用同一份
 * 默认状态合成与空间标记迁移规则，避免两边各自实现后坐标语义漂移。
 */
export function normalizeSceneStates(
  states: StoryAssetStateInput[] | null | undefined,
  input: {
    name: string;
    summary?: string | null;
    environmentPrompt?: string | null;
    sceneType?: string | null;
    timeOfDay?: string | null;
    weather?: string | null;
    scene3dEnvironment?: StoryScene3DEnvironmentInput | null;
  },
): StoryAssetState[] {
  const description = input.summary?.trim() || input.environmentPrompt?.trim() || `${input.name.trim()}默认状态`;
  const imagePrompt = input.environmentPrompt?.trim() || description;
  const sceneType: StoryAssetSceneType | null = input.sceneType === "interior"
    || input.sceneType === "exterior"
    || input.sceneType === "nature"
    ? input.sceneType
    : null;
  const timeOfDay: StoryAssetTimeOfDay | null = input.timeOfDay === "morning"
    || input.timeOfDay === "noon"
    || input.timeOfDay === "night"
    ? input.timeOfDay
    : null;
  const weather: StoryAssetWeather | null = input.weather === "sunny"
    || input.weather === "cloudy"
    || input.weather === "rainy"
    ? input.weather
    : null;
  return normalizeStoryAssetStates(states, {
    description,
    imagePrompt,
    sceneType,
    timeOfDay,
    weather,
  }).map((state) => {
    if (!STORY_SCENE_3D_MARKERS_ENABLED) {
      const { scene3dMarkers: _disabled, ...withoutMarkers } = state;
      return withoutMarkers;
    }
    const scene3dMarkers = adoptLegacyStoryScene3dMarkerEnvironment(
      normalizeStoryScene3dMarkerSet(state.scene3dMarkers, {
        ...(input.scene3dEnvironment ? {
          maxRadius: input.scene3dEnvironment.domeRadius * STORY_SCENE_3D_MARKER_FALLBACK_WALL_RADIUS_RATIO,
          environment: input.scene3dEnvironment,
        } : {}),
      }),
      input.scene3dEnvironment,
    );
    return scene3dMarkers ? { ...state, scene3dMarkers } : state;
  });
}
