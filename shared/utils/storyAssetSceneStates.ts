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

export interface BlockingSketchSceneStalenessInput {
  /** 草图保存时记录的场景图版本；本功能上线后的新草图才有。 */
  storedImageUpdatedAt?: string | null;
  /** 草图截图时间（blockingSketchData.generatedAt），所有草图都有。 */
  sketchGeneratedAt?: string | null;
  /** 当前场景图版本。 */
  currentImageUpdatedAt?: string | null;
}

/**
 * 3D 草图的场景图是否已过期。两级判定：
 * 1. 新草图带版本标记：标记与当前版本不同即过期（换过图，含同路径覆盖）；
 * 2. 旧草图没有标记：用截图时间兜底——当前场景图的生成时间晚于截图时间，
 *    说明截图用的是被覆盖掉的上一版全景（上线前的历史残留正是这种）。
 * 当前场景图缺版本、或两级证据都缺失时不判定过期，避免整体误报。
 */
export function isBlockingSketchSceneImageStale(
  input: BlockingSketchSceneStalenessInput,
): boolean {
  const current = input.currentImageUpdatedAt?.trim();
  if (!current) return false;
  const stored = input.storedImageUpdatedAt?.trim();
  if (stored) return stored !== current;
  const sketchGeneratedAt = input.sketchGeneratedAt?.trim();
  if (!sketchGeneratedAt) return false;
  const capturedAt = Date.parse(sketchGeneratedAt);
  const currentAt = Date.parse(current);
  if (!Number.isFinite(capturedAt) || !Number.isFinite(currentAt)) return false;
  return capturedAt < currentAt;
}
