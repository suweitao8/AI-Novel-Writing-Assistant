// 通用环境资产（HDRI 全景环境）的设置存储：AppSetting 单 key JSON，
// 模式与 GlobalNarratorVoiceSettingsService / DramaAssetArtStyleSettingsService 一致。
// 环境本体（id/label/默认描述）与静态 .hdr 预设留在客户端常量里；这里只存
// 可被用户修改的部分：环境描述、状态列表（名称/描述/图片提示词/生成结果）、活跃状态。
import { prisma } from "../../db/prisma";
import { AppError } from "../../middleware/errorHandler";
import {
  isStudioEnvironmentId,
  resolveActiveStudioEnvironmentState,
  STUDIO_ENVIRONMENT_ASSET_SETTING_KEY,
  STUDIO_ENVIRONMENT_DEFAULT_DESCRIPTIONS,
  STUDIO_ENVIRONMENT_IDS,
  STUDIO_ENVIRONMENT_LABELS,
  type StudioEnvironmentAsset,
  type StudioEnvironmentAssetDocument,
  type StudioEnvironmentAssetState,
  type StudioEnvironmentId,
} from "@ai-novel/shared/types/studioEnvironmentAssets";
import type { StoryAssetStateImage } from "@ai-novel/shared/types/novelReferenceExtraction";

export const MAX_ENVIRONMENT_STATE_LABEL_LENGTH = 50;
export const MAX_ENVIRONMENT_STATE_DESCRIPTION_LENGTH = 1000;
export const MAX_ENVIRONMENT_STATE_IMAGE_PROMPT_LENGTH = 2000;
export const MAX_ENVIRONMENT_DESCRIPTION_LENGTH = 1000;
export const MAX_ENVIRONMENT_STATES = 12;
export const DEFAULT_STUDIO_ENVIRONMENT_STATE_ID = "default";

function readString(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, maxLength);
}

function normalizeStateImage(value: unknown): StoryAssetStateImage | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  const status = record.status;
  if (status !== "idle" && status !== "generating" && status !== "done" && status !== "error") {
    return undefined;
  }
  const image: StoryAssetStateImage = { status };
  if (typeof record.url === "string" && record.url.trim()) image.url = record.url.trim();
  if (typeof record.generatedAt === "string" && record.generatedAt.trim()) image.generatedAt = record.generatedAt.trim();
  if (typeof record.attemptId === "string" && record.attemptId.trim()) image.attemptId = record.attemptId.trim();
  if (typeof record.error === "string" && record.error.trim()) image.error = record.error.trim();
  return image;
}

function normalizeStateId(value: unknown): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 64) return "";
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(trimmed)) return "";
  return trimmed;
}

function normalizeStates(value: unknown): StudioEnvironmentAssetState[] {
  if (!Array.isArray(value)) return [];
  const states: StudioEnvironmentAssetState[] = [];
  const seen = new Set<string>();
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const record = raw as Record<string, unknown>;
    const id = normalizeStateId(record.id);
    if (!id || seen.has(id)) continue;
    const label = readString(record.label, MAX_ENVIRONMENT_STATE_LABEL_LENGTH) ?? "未命名状态";
    const state: StudioEnvironmentAssetState = {
      id,
      label,
      // StoryAssetState 的说明与图片提示词是必填字段：空值按状态名兜底，与 normalizeStatesForSave 语义一致。
      description: label,
      imagePrompt: label,
    };
    const description = readString(record.description, MAX_ENVIRONMENT_STATE_DESCRIPTION_LENGTH);
    if (description) state.description = description;
    const imagePrompt = readString(record.imagePrompt, MAX_ENVIRONMENT_STATE_IMAGE_PROMPT_LENGTH);
    if (imagePrompt) state.imagePrompt = imagePrompt;
    const referenceStateId = normalizeStateId(record.referenceStateId);
    if (referenceStateId && referenceStateId !== id) state.referenceStateId = referenceStateId;
    const eraStyle = readString(record.eraStyle, 100);
    if (eraStyle) state.eraStyle = eraStyle;
    if (record.timeOfDay === "morning" || record.timeOfDay === "noon" || record.timeOfDay === "night") {
      state.timeOfDay = record.timeOfDay;
    }
    if (record.weather === "sunny" || record.weather === "cloudy" || record.weather === "rainy") {
      state.weather = record.weather;
    }
    const image = normalizeStateImage(record.image);
    if (image) state.image = image;
    states.push(state);
    seen.add(id);
  }
  return states.slice(0, MAX_ENVIRONMENT_STATES);
}

function defaultState(): StudioEnvironmentAssetState {
  return { id: DEFAULT_STUDIO_ENVIRONMENT_STATE_ID, label: "默认", description: "默认", imagePrompt: "默认" };
}

function defaultEnvironment(id: StudioEnvironmentId): StudioEnvironmentAsset {
  return {
    id,
    label: STUDIO_ENVIRONMENT_LABELS[id],
    description: STUDIO_ENVIRONMENT_DEFAULT_DESCRIPTIONS[id],
    activeStateId: DEFAULT_STUDIO_ENVIRONMENT_STATE_ID,
    states: [defaultState()],
  };
}

/** 白名单式解析存储文档；缺失/非法的环境回落默认值，保证三个环境永远齐全。 */
export function parseStudioEnvironmentAssetDocument(value: unknown): {
  environments: Record<StudioEnvironmentId, StudioEnvironmentAsset>;
} {
  const environments = {} as Record<StudioEnvironmentId, StudioEnvironmentAsset>;
  const record = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const stored = (record.environments && typeof record.environments === "object" ? record.environments : {}) as Record<string, unknown>;
  for (const id of STUDIO_ENVIRONMENT_IDS) {
    const fallback = defaultEnvironment(id);
    const raw = stored[id];
    if (!raw || typeof raw !== "object") {
      environments[id] = fallback;
      continue;
    }
    const entry = raw as Record<string, unknown>;
    const states = normalizeStates(entry.states);
    const label = readString(entry.label, MAX_ENVIRONMENT_STATE_LABEL_LENGTH) ?? STUDIO_ENVIRONMENT_LABELS[id];
    const asset: StudioEnvironmentAsset = {
      id,
      label,
      activeStateId: DEFAULT_STUDIO_ENVIRONMENT_STATE_ID,
      states: states.length > 0 ? states : fallback.states,
    };
    const description = readString(entry.description, MAX_ENVIRONMENT_DESCRIPTION_LENGTH);
    if (description) asset.description = description;
    if (states.some((state) => state.id === entry.activeStateId) && typeof entry.activeStateId === "string") {
      asset.activeStateId = entry.activeStateId;
    } else {
      asset.activeStateId = asset.states[0].id;
    }
    environments[id] = asset;
  }
  return { environments };
}

export async function getStudioEnvironmentAssetDocument(): Promise<{
  environments: Record<StudioEnvironmentId, StudioEnvironmentAsset>;
}> {
  const row = await prisma.appSetting.findUnique({ where: { key: STUDIO_ENVIRONMENT_ASSET_SETTING_KEY } });
  let parsed: unknown = null;
  if (row?.value) {
    try {
      parsed = JSON.parse(row.value);
    } catch {
      parsed = null;
    }
  }
  return parseStudioEnvironmentAssetDocument(parsed);
}

export function getStoredStudioEnvironmentAsset(
  document: { environments: Record<StudioEnvironmentId, StudioEnvironmentAsset> },
  environmentId: string,
): StudioEnvironmentAsset {
  if (!isStudioEnvironmentId(environmentId)) {
    throw new AppError("没有找到这个环境资产。", 404);
  }
  return document.environments[environmentId];
}

function assertStateExists(environment: StudioEnvironmentAsset, stateId: string): StudioEnvironmentAssetState {
  const state = environment.states.find((item) => item.id === stateId);
  if (!state) {
    throw new AppError("没有找到这个环境状态。", 404);
  }
  return state;
}

/** 保存环境资料（描述 + 状态元数据）：图片字段按状态 id 保留现有值，不被前端提交覆盖。 */
export async function saveStudioEnvironmentAsset(
  environmentId: string,
  patch: { description?: string | null; states?: unknown },
): Promise<StudioEnvironmentAsset> {
  if (!isStudioEnvironmentId(environmentId)) {
    throw new AppError("没有找到这个环境资产。", 404);
  }
  const document = await getStudioEnvironmentAssetDocument();
  const existing = document.environments[environmentId];
  const nextStates = normalizeStates(patch.states);
  if (patch.states !== undefined && nextStates.length === 0) {
    throw new AppError("环境至少要保留一个状态。", 400);
  }
  const mergedStates: StudioEnvironmentAssetState[] = [];
  const sourceStates = patch.states === undefined ? existing.states : nextStates;
  for (const state of sourceStates) {
    const previous = existing.states.find((item) => item.id === state.id);
    mergedStates.push(previous?.image ? { ...state, image: previous.image } : state);
  }
  const next: StudioEnvironmentAsset = {
    ...existing,
    states: mergedStates,
    activeStateId: mergedStates.some((state) => state.id === existing.activeStateId)
      ? existing.activeStateId
      : mergedStates[0].id,
  };
  if (patch.description !== undefined) {
    const description = readString(patch.description, MAX_ENVIRONMENT_DESCRIPTION_LENGTH);
    if (description) next.description = description;
    else delete next.description;
  }
  await persistEnvironment(next);
  return next;
}

export async function setActiveStudioEnvironmentState(environmentId: string, stateId: string): Promise<StudioEnvironmentAsset> {
  const document = await getStudioEnvironmentAssetDocument();
  const environment = getStoredStudioEnvironmentAsset(document, environmentId);
  assertStateExists(environment, stateId);
  const next = { ...environment, activeStateId: stateId };
  await persistEnvironment(next);
  return next;
}

/** 读-改-写单个状态的 image 字段；生成状态机（generating/done/error）专用入口。 */
export async function updateStudioEnvironmentStateImage(
  environmentId: StudioEnvironmentId,
  stateId: string,
  mutate: (current: StoryAssetStateImage | undefined) => StoryAssetStateImage,
): Promise<StudioEnvironmentAsset> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const document = await getStudioEnvironmentAssetDocument();
    const environment = getStoredStudioEnvironmentAsset(document, environmentId);
    const state = assertStateExists(environment, stateId);
    const nextImage = mutate(state.image);
    const nextStates = environment.states.map((item) => (
      item.id === stateId ? { ...item, image: nextImage } : item
    ));
    const next: StudioEnvironmentAsset = { ...environment, states: nextStates };
    try {
      await persistEnvironment(next);
      return next;
    } catch (error) {
      if (attempt === 2) throw error;
    }
  }
  throw new AppError("环境状态保存失败，请重试。", 500);
}

async function persistEnvironment(environment: StudioEnvironmentAsset): Promise<void> {
  const document = await getStudioEnvironmentAssetDocument();
  const value = JSON.stringify({
    environments: {
      ...document.environments,
      [environment.id]: environment,
    },
  });
  await prisma.appSetting.upsert({
    where: { key: STUDIO_ENVIRONMENT_ASSET_SETTING_KEY },
    update: { value },
    create: { key: STUDIO_ENVIRONMENT_ASSET_SETTING_KEY, value },
  });
}

export function resolveStudioEnvironmentActiveState(environment: StudioEnvironmentAsset): StudioEnvironmentAssetState {
  return resolveActiveStudioEnvironmentState(environment) ?? environment.states[0];
}
