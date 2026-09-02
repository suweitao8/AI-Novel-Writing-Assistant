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
import { resolveStoryScene3dEnvironmentRadius } from "@ai-novel/shared/utils/scene3dEnvironment";
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
    const environmentRadius = input.scene3dEnvironment
      ? resolveStoryScene3dEnvironmentRadius(input.scene3dEnvironment)
      : null;
    const scene3dMarkers = adoptLegacyStoryScene3dMarkerEnvironment(
      normalizeStoryScene3dMarkerSet(state.scene3dMarkers, {
        ...(input.scene3dEnvironment ? {
          maxRadius: environmentRadius! * STORY_SCENE_3D_MARKER_FALLBACK_WALL_RADIUS_RATIO,
          environment: input.scene3dEnvironment,
        } : {}),
      }),
      input.scene3dEnvironment,
    );
    return scene3dMarkers ? { ...state, scene3dMarkers } : state;
  });
}

/**
 * 场景状态图的内容版本标记（生成时间）。状态图按稳定路径存储，重新生成
 * 是同路径覆盖：URL 不变而内容已换，只有这个时间戳能区分"同一张图"与
 * "换掉的新图"。3D 摆位草图在保存时记录它，用于检测草图背景是否过期。
 */
export function storyAssetStateImageUpdatedAt(
  state: StoryAssetState | null | undefined,
): string | null {
  const generatedAt = state?.image?.generatedAt;
  return typeof generatedAt === "string" && generatedAt.trim() ? generatedAt.trim() : null;
}

/**
 * 3D 草图记录的场景图版本是否已过期：记录版本与当前版本不同即过期。
 * 旧草图没有版本标记、或当前场景图没有版本时不判定过期，避免把历史
 * 数据整体误报为过期。
 */
export function isBlockingSketchSceneImageStale(
  storedUpdatedAt: string | null | undefined,
  currentUpdatedAt: string | null | undefined,
): boolean {
  if (typeof storedUpdatedAt !== "string" || !storedUpdatedAt.trim()) return false;
  if (typeof currentUpdatedAt !== "string" || !currentUpdatedAt.trim()) return false;
  return storedUpdatedAt.trim() !== currentUpdatedAt.trim();
}
