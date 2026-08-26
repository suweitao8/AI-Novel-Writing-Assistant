import {
  normalizeStoryAssetStates,
  normalizeStoryCharacterStates,
  parseStoryAssetStatesJson,
  validateStoryAssetStateList,
  type StoryAssetState,
  type StoryAssetStateInput,
  type StoryAssetSceneType,
  type StoryAssetTimeOfDay,
  type StoryAssetWeather,
  type StoryCharacterLegacyFields,
} from "@ai-novel/shared/types/novelReferenceExtraction";
import type { StoryScene3DEnvironmentInput } from "@ai-novel/shared/types/comicDrama";
import { AppError } from "../../../../middleware/errorHandler";
import { normalizeStoryScene3dMarkerSet } from "./StoryScene3dMarkers";

/**
 * 设定中心状态持久化策略。
 *
 * 角色、场景、道具的旧基础字段仍保留用于兼容读取，但新建与后续生成都必须从
 * 这里得到至少一个初始状态。把这层规则集中起来，避免列表、创建、更新和资源
 * 生成各自实现一套不一致的空状态处理。
 */

export function parseStates(value: string | null | undefined): StoryAssetState[] {
  return parseStoryAssetStatesJson(value).states;
}

export function canSafelyRewriteStates(value: string | null | undefined): boolean {
  return parseStoryAssetStatesJson(value).canSafelyRewrite;
}

export function serializeStates(states: StoryAssetStateInput[] | undefined | null): string | null {
  if (!states) {
    return null;
  }
  const cleaned = states.filter((state) => state.id?.trim() && state.label?.trim());
  const validationError = validateStoryAssetStateList(cleaned);
  if (validationError) {
    throw new AppError(validationError, 400);
  }
  return cleaned.length > 0 ? JSON.stringify(normalizeStoryAssetStates(cleaned)) : JSON.stringify(normalizeStoryAssetStates([]));
}

export function normalizeCharacterStates(
  states: StoryAssetStateInput[] | null | undefined,
  legacy: StoryCharacterLegacyFields,
): StoryAssetState[] {
  return normalizeStoryCharacterStates(states, legacy);
}

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
    const scene3dMarkers = normalizeStoryScene3dMarkerSet(state.scene3dMarkers, {
      ...(input.scene3dEnvironment ? {
        maxRadius: input.scene3dEnvironment.domeRadius * 0.45,
        environment: input.scene3dEnvironment,
      } : {}),
    });
    return scene3dMarkers ? { ...state, scene3dMarkers } : state;
  });
}

export function normalizePropStates(
  states: StoryAssetStateInput[] | null | undefined,
  input: { name: string; description?: string | null; visualPrompt?: string | null },
): StoryAssetState[] {
  const description = input.description?.trim() || input.visualPrompt?.trim() || `${input.name.trim()}默认状态`;
  const imagePrompt = input.visualPrompt?.trim() || description;
  return normalizeStoryAssetStates(states, { description, imagePrompt });
}

/**
 * 用户保存状态表单时，图片/音色是服务端生成的运行时资产，不是表单编辑字段。
 * 用最新数据库状态覆盖同 ID 的旧运行时资产，避免慢一点的保存请求把刚生成的
 * 资产清掉；若数据库还没有资产，则保留本次载荷中的新生成结果。
 */
export function preserveStoryAssetRuntimeAssets(
  currentStates: StoryAssetState[],
  nextStates: StoryAssetState[],
): StoryAssetState[] {
  const currentById = new Map(currentStates.map((state) => [state.id, state]));
  return nextStates.map((state) => {
    const current = currentById.get(state.id);
    return {
      ...state,
      ...(current?.image ? { image: current.image } : {}),
      ...(current?.voice ? { voice: current.voice } : {}),
      ...(current?.scene3dMarkers ? { scene3dMarkers: current.scene3dMarkers } : {}),
    };
  });
}

export interface StoryAssetStateJsonRead {
  raw: string | null;
  /** raw 为空时使用的旧字段归一化状态；用于兼容还没有 statesJson 的资产。 */
  fallbackStates?: StoryAssetState[];
  /** 允许角色在每次重试时按最新旧字段补齐状态，但不重写其他状态。 */
  normalize?: (states: StoryAssetState[]) => StoryAssetState[];
}

export interface StoryAssetStateJsonCasOptions {
  stateId: string;
  fallbackStates: StoryAssetState[];
  read: () => Promise<StoryAssetStateJsonRead>;
  /** expectedRaw 必须仍是 read 返回的值；false 表示发生并发更新，需要重新读取。 */
  write: (expectedRaw: string | null, nextRaw: string) => Promise<boolean>;
  patch: (state: StoryAssetState) => StoryAssetState;
  maxAttempts?: number;
}

/**
 * 对 statesJson 做乐观并发控制的目标字段更新。
 *
 * 生图/生音色只应修改当前状态的一个资产字段，不能把第一次读取到的整份数组
 * 无条件写回。条件 updateMany 失败时重新读取并合并，因而可以保留另一条并发
 * 操作刚刚写入的图片、音色或新状态。
 */
export async function updateStoryAssetStateJsonWithCas({
  stateId,
  fallbackStates,
  read,
  write,
  patch,
  maxAttempts = 3,
}: StoryAssetStateJsonCasOptions): Promise<void> {
  for (let attempt = 0; attempt < Math.max(1, maxAttempts); attempt += 1) {
    const current = await read();
    const parsed = parseStoryAssetStatesJson(current.raw);
    if (current.raw?.trim() && !parsed.canSafelyRewrite) {
      throw new AppError("状态数据格式异常，已停止覆盖原始状态；请先在设定中心保存一次角色状态。", 409);
    }
    const source = parsed.states.length > 0
      ? parsed.states
      : (current.fallbackStates ?? fallbackStates);
    const normalized = current.normalize ? current.normalize(source) : source;
    if (!normalized.some((state) => state.id === stateId)) {
      throw new AppError("未找到外观状态。", 404);
    }
    const next = normalized.map((state) => state.id === stateId ? patch(state) : state);
    const nextRaw = JSON.stringify(next);
    if (await write(current.raw, nextRaw)) {
      return;
    }
  }
  throw new AppError("状态已被其他操作更新，请刷新后重试。", 409);
}
