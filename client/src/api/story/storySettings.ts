import type { ApiResponse } from "@ai-novel/shared/types/api";
import type {
  StoryAssetState,
  StoryAssetStateVoiceMode,
} from "@ai-novel/shared/types/novelReferenceExtraction";
import { apiClient } from "../client";

export type StorySettingsCategory = "characters" | "scenes" | "props" | "world";

/** 资产参考图的精简状态（场景=360° 全景，道具=45° 透视）。 */
export interface StoryAssetImage {
  status: string;
  url?: string;
}

export interface StorySettingsOverview {
  novelId: string;
  counts: { characters: number; scenes: number; props: number };
  worldConfigured: boolean;
  settingsReady: boolean;
  awaitingConfirmation: boolean;
}

export interface StorySettingsScene {
  id: string;
  name: string;
  sceneType: string | null;
  summary: string | null;
  environmentPrompt: string | null;
  significance: string | null;
  /** 场景时间（morning/noon/night；null=未设定）——影响场景图光线 */
  timeOfDay: string | null;
  /** 场景天气（sunny/cloudy/rainy；null=未设定）——影响场景图氛围 */
  weather: string | null;
  /** 360° 全景参考图（未生成过为 null）。 */
  image: StoryAssetImage | null;
  mapNodeId: string | null;
  mapUnmappable: boolean;
  sortOrder: number;
  source: string;
  states: StoryAssetState[];
  updatedAt: string;
}

export interface StorySettingsProp {
  id: string;
  name: string;
  propType: string;
  description: string | null;
  plotFunction: string | null;
  visualPrompt: string | null;
  ownerCharacterId: string | null;
  ownerCharacterName: string | null;
  importance: string;
  firstAppearHint: string | null;
  /** 45° 透视参考图（未生成过为 null）。 */
  image: StoryAssetImage | null;
  sortOrder: number;
  source: string;
  states: StoryAssetState[];
  updatedAt: string;
}

export interface StorySettingsCharacter {
  id: string;
  name: string;
  /** 剧情定位已不在表单/提取里维护（2026-08-21）；仅旧数据与 AI 设定包仍会带值。 */
  role?: string;
  gender: string | null;
  ageGroup: string | null;
  physique: string | null;
  attireStyle: string | null;
  facePrompt: string | null;
  voiceTexture: string | null;
  personality: string | null;
  appearance: string | null;
  background: string | null;
  states: StoryAssetState[];
  updatedAt: string;
}

export interface WorldMapNode {
  id: string;
  name: string;
  kind: string;
  summary: string;
  x: number | null;
  y: number | null;
  tier: string | null;
}

export interface WorldMapEdge {
  fromId: string;
  toId: string;
  label: string;
}

// 地形分区：程序化定义的多边形（平地/山/水），不经过任何生图。
export type WorldMapTerrainType = "plain" | "mountain" | "water";

export interface WorldMapTerrain {
  id: string;
  type: WorldMapTerrainType;
  label: string;
  points: Array<{ x: number; y: number }>;
}

// 地图数据是同构递归的：世界级地图与城市/村镇内部地图共用一个形状，
// 内部地图按上级节点的 id 挂在 childMaps 里，形成多级导航。
export interface WorldMapData {
  overview: string;
  scaleKm: number | null;
  terrain: WorldMapTerrain[];
  nodes: WorldMapNode[];
  edges: WorldMapEdge[];
  childMaps: Record<string, WorldMapData>;
}

export interface StorySettingsArtStyle {
  label: string;
  prompt: string;
}

export interface StorySettingsWorld {
  premise: string;
  era: string | null;
  toneRules: string[];
  keySettings: Array<{ title: string; content: string }>;
  artStyles: StorySettingsArtStyle[];
  defaultArtStyle: string | null;
  map: WorldMapData;
  source: string;
  updatedAt: string;
}

export async function getStorySettingsOverview(novelId: string) {
  const { data } = await apiClient.get<ApiResponse<StorySettingsOverview>>(
    `/novels/${encodeURIComponent(novelId)}/settings/overview`,
  );
  return data;
}

export async function getStorySettingsScenes(novelId: string) {
  const { data } = await apiClient.get<ApiResponse<StorySettingsScene[]>>(
    `/novels/${encodeURIComponent(novelId)}/settings/scenes`,
  );
  return data;
}

export async function createStorySettingsScene(
  novelId: string,
  payload: {
    name: string;
    sceneType?: string;
    summary?: string;
    environmentPrompt?: string;
    significance?: string;
    timeOfDay?: string;
    weather?: string;
    mapNodeId?: string;
    states?: StoryAssetState[];
  },
) {
  const { data } = await apiClient.post<ApiResponse<StorySettingsScene>>(
    `/novels/${encodeURIComponent(novelId)}/settings/scenes`,
    payload,
  );
  return data;
}

export async function updateStorySettingsScene(
  novelId: string,
  sceneId: string,
  payload: {
    name?: string;
    sceneType?: string | null;
    summary?: string | null;
    environmentPrompt?: string | null;
    significance?: string | null;
    timeOfDay?: string | null;
    weather?: string | null;
    mapNodeId?: string | null;
    states?: StoryAssetState[];
  },
) {
  const { data } = await apiClient.put<ApiResponse<StorySettingsScene>>(
    `/novels/${encodeURIComponent(novelId)}/settings/scenes/${encodeURIComponent(sceneId)}`,
    payload,
  );
  return data;
}

export async function deleteStorySettingsScene(novelId: string, sceneId: string) {
  const { data } = await apiClient.delete<ApiResponse<null>>(
    `/novels/${encodeURIComponent(novelId)}/settings/scenes/${encodeURIComponent(sceneId)}`,
  );
  return data;
}

export async function getStorySettingsProps(novelId: string) {
  const { data } = await apiClient.get<ApiResponse<StorySettingsProp[]>>(
    `/novels/${encodeURIComponent(novelId)}/settings/props`,
  );
  return data;
}

/** 生成场景 360° 全景参考图（同步等待完成，返回最新图片状态）。 */
export async function generateStorySceneImage(novelId: string, sceneId: string) {
  const { data } = await apiClient.post<ApiResponse<StorySettingsScene["image"]>>(
    `/novels/${encodeURIComponent(novelId)}/settings/scenes/${encodeURIComponent(sceneId)}/generate-image`,
  );
  return data;
}

/** 生成道具 45° 透视参考图。 */
export async function generateStoryPropImage(novelId: string, propId: string) {
  const { data } = await apiClient.post<ApiResponse<StorySettingsProp["image"]>>(
    `/novels/${encodeURIComponent(novelId)}/settings/props/${encodeURIComponent(propId)}/generate-image`,
  );
  return data;
}

export async function createStorySettingsProp(
  novelId: string,
  payload: {
    name: string;
    propType?: string;
    description?: string;
    plotFunction?: string;
    visualPrompt?: string;
    ownerCharacterId?: string;
    importance?: string;
    firstAppearHint?: string;
    states?: StoryAssetState[];
  },
) {
  const { data } = await apiClient.post<ApiResponse<StorySettingsProp>>(
    `/novels/${encodeURIComponent(novelId)}/settings/props`,
    payload,
  );
  return data;
}

export async function updateStorySettingsProp(
  novelId: string,
  propId: string,
  payload: {
    name?: string;
    propType?: string | null;
    description?: string | null;
    plotFunction?: string | null;
    visualPrompt?: string | null;
    ownerCharacterId?: string | null;
    importance?: string;
    firstAppearHint?: string | null;
    states?: StoryAssetState[];
  },
) {
  const { data } = await apiClient.put<ApiResponse<StorySettingsProp>>(
    `/novels/${encodeURIComponent(novelId)}/settings/props/${encodeURIComponent(propId)}`,
    payload,
  );
  return data;
}

export async function deleteStorySettingsProp(novelId: string, propId: string) {
  const { data } = await apiClient.delete<ApiResponse<null>>(
    `/novels/${encodeURIComponent(novelId)}/settings/props/${encodeURIComponent(propId)}`,
  );
  return data;
}

export async function getStorySettingsCharacters(novelId: string) {
  const { data } = await apiClient.get<ApiResponse<StorySettingsCharacter[]>>(
    `/novels/${encodeURIComponent(novelId)}/settings/characters`,
  );
  return data;
}

export async function updateStorySettingsCharacter(
  novelId: string,
  characterId: string,
  payload: {
    name?: string;
    role?: string;
    gender?: string | null;
    ageGroup?: string | null;
    physique?: string | null;
    attireStyle?: string | null;
    facePrompt?: string | null;
    voiceTexture?: string | null;
    personality?: string | null;
    appearance?: string | null;
    background?: string | null;
    states?: StoryAssetState[];
  },
) {
  const { data } = await apiClient.put<ApiResponse<StorySettingsCharacter>>(
    `/novels/${encodeURIComponent(novelId)}/settings/characters/${encodeURIComponent(characterId)}`,
    payload,
  );
  return data;
}

export async function deleteStorySettingsCharacter(novelId: string, characterId: string) {
  const { data } = await apiClient.delete<ApiResponse<null>>(
    `/novels/${encodeURIComponent(novelId)}/settings/characters/${encodeURIComponent(characterId)}`,
  );
  return data;
}

export async function getStorySettingsWorld(novelId: string) {
  const { data } = await apiClient.get<ApiResponse<StorySettingsWorld>>(
    `/novels/${encodeURIComponent(novelId)}/settings/world`,
  );
  return data;
}

export async function updateStorySettingsWorld(
  novelId: string,
  payload: {
    premise?: string;
    era?: string | null;
    toneRules?: string[];
    keySettings?: Array<{ title: string; content: string }>;
    artStyles?: Array<{ label: string; prompt?: string }>;
    defaultArtStyle?: string | null;
    map?: WorldMapData;
  },
) {
  const { data } = await apiClient.put<ApiResponse<StorySettingsWorld>>(
    `/novels/${encodeURIComponent(novelId)}/settings/world`,
    payload,
  );
  return data;
}

// AI 场景标注结果：已放到地图上的场景（含国家/城市归属）与无法定位的场景。
export interface WorldMapAnnotationResult {
  map: WorldMapData;
  assignments: Array<{
    sceneId: string;
    sceneName: string;
    nodeId: string;
    countryName: string;
    cityName: string;
  }>;
  unplaceable: Array<{
    sceneId: string;
    sceneName: string;
    reason: string;
  }>;
}

// AI 生成/标注地图（直接落库）：空地图时依据书名/世界观生成基础的国家+城市结构；
// 有未标注场景时把场景放置到地图上，无法定位的标记后下次跳过。
export async function annotateWorldMap(novelId: string) {
  const { data } = await apiClient.post<ApiResponse<WorldMapAnnotationResult>>(
    `/novels/${encodeURIComponent(novelId)}/settings/world/map-annotate`,
  );
  return data;
}

export async function ensureStorySettings(novelId: string, categories?: StorySettingsCategory[]) {
  const { data } = await apiClient.post<ApiResponse<{ generated: StorySettingsCategory[] }>>(
    `/novels/${encodeURIComponent(novelId)}/settings/ensure`,
    categories?.length ? { categories } : {},
  );
  return data;
}

export async function regenerateStorySettings(novelId: string, category: StorySettingsCategory) {
  const { data } = await apiClient.post<ApiResponse<null>>(
    `/novels/${encodeURIComponent(novelId)}/settings/regenerate`,
    { category },
  );
  return data;
}

export async function confirmStorySettings(novelId: string) {
  const { data } = await apiClient.post<ApiResponse<{ taskId: string | null }>>(
    `/novels/${encodeURIComponent(novelId)}/settings/confirm`,
  );
  return data;
}

export type StoryAssetKind = "character" | "scene" | "prop";

/** 生成资产某个外观状态的图片（服务端按状态的生图参考配置取参考图），返回更新后的资产。 */
export async function generateStoryAssetStateImage(
  novelId: string,
  kind: StoryAssetKind,
  assetId: string,
  stateId: string,
) {
  const resource = kind === "character" ? "characters" : kind === "scene" ? "scenes" : "props";
  const { data } = await apiClient.post<ApiResponse<StorySettingsCharacter | StorySettingsScene | StorySettingsProp>>(
    `/novels/${encodeURIComponent(novelId)}/settings/${resource}/${encodeURIComponent(assetId)}/states/${encodeURIComponent(stateId)}/generate-image`,
  );
  return data;
}

/** 生成或复用角色某个外观状态的音色试听，返回更新后的角色。 */
export async function generateStoryCharacterStateVoice(
  novelId: string,
  characterId: string,
  stateId: string,
  mode?: StoryAssetStateVoiceMode,
) {
  const { data } = await apiClient.post<ApiResponse<StorySettingsCharacter>>(
    `/novels/${encodeURIComponent(novelId)}/settings/characters/${encodeURIComponent(characterId)}/states/${encodeURIComponent(stateId)}/generate-voice`,
    mode ? { mode } : {},
  );
  return data;
}

export interface StoryEntityDraft {
  character: {
    name: string;
    role: string;
    gender: string;
    ageGroup: string;
    physique: string;
    personality: string;
    appearance: string;
    attireStyle: string;
    facePrompt: string;
    background: string;
  } | null;
  scene: {
    name: string;
    sceneType: string;
    summary: string;
    significance: string;
    environmentPrompt: string;
  } | null;
  prop: {
    name: string;
    propType: string;
    description: string;
    plotFunction: string;
    visualPrompt: string;
    importance: string;
    firstAppearHint?: string;
  } | null;
}

export async function generateStoryEntityDraft(
  novelId: string,
  entityType: "character" | "scene" | "prop",
  hint?: string,
) {
  const { data } = await apiClient.post<ApiResponse<StoryEntityDraft>>(
    `/novels/${encodeURIComponent(novelId)}/settings/${entityType === "character" ? "characters" : entityType === "scene" ? "scenes" : "props"}/generate`,
    hint?.trim() ? { hint: hint.trim() } : {},
  );
  return data;
}

export async function createStorySettingsCharacter(
  novelId: string,
  payload: {
    name: string;
    role?: string;
    gender?: string;
    ageGroup?: string;
    physique?: string;
    attireStyle?: string;
    facePrompt?: string;
    voiceTexture?: string;
    personality?: string;
    appearance?: string;
    background?: string;
    states?: StoryAssetState[];
  },
) {
  const { data } = await apiClient.post<ApiResponse<StorySettingsCharacter>>(
    `/novels/${encodeURIComponent(novelId)}/settings/characters`,
    payload,
  );
  return data;
}
