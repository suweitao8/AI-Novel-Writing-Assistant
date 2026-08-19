import type { ApiResponse } from "@ai-novel/shared/types/api";
import { apiClient } from "../client";

export type StorySettingsCategory = "characters" | "scenes" | "props" | "world";

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
  mapNodeId: string | null;
  sortOrder: number;
  source: string;
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
  sortOrder: number;
  source: string;
  updatedAt: string;
}

export interface StorySettingsCharacter {
  id: string;
  name: string;
  role: string;
  gender: string | null;
  ageGroup: string | null;
  physique: string | null;
  attireStyle: string | null;
  facePrompt: string | null;
  personality: string | null;
  appearance: string | null;
  background: string | null;
  updatedAt: string;
}

export interface StorySettingsWorld {
  premise: string;
  era: string | null;
  toneRules: string[];
  keySettings: Array<{ title: string; content: string }>;
  map: {
    nodes: Array<{ id: string; name: string; kind: string; summary: string }>;
    edges: Array<{ fromId: string; toId: string; label: string }>;
  };
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
    mapNodeId?: string;
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
    mapNodeId?: string | null;
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
    personality?: string | null;
    appearance?: string | null;
    background?: string | null;
  },
) {
  const { data } = await apiClient.put<ApiResponse<StorySettingsCharacter>>(
    `/novels/${encodeURIComponent(novelId)}/settings/characters/${encodeURIComponent(characterId)}`,
    payload,
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
  },
) {
  const { data } = await apiClient.put<ApiResponse<StorySettingsWorld>>(
    `/novels/${encodeURIComponent(novelId)}/settings/world`,
    payload,
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
    role: string;
    gender?: string;
    ageGroup?: string;
    physique?: string;
    attireStyle?: string;
    facePrompt?: string;
    personality?: string;
    appearance?: string;
    background?: string;
  },
) {
  const { data } = await apiClient.post<ApiResponse<StorySettingsCharacter>>(
    `/novels/${encodeURIComponent(novelId)}/settings/characters`,
    payload,
  );
  return data;
}
