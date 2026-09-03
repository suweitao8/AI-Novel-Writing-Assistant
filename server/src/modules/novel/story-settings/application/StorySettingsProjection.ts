import type { StoryAssetState } from "@ai-novel/shared/types/novelReferenceExtraction";
import { parseStoryAssetImage, type StoryAssetImageState } from "./StoryAssetImageService";
import { normalizeCharacterStates, normalizePropStates, normalizeSceneStates, parseStates } from "./StorySettingsStatePolicy";
import { scopeStateImageUrls } from "./StoryAssetStateImageStorage";
import { resolveStoryScene3dEnvironment } from "./StoryScene3dEnvironment";
import { parseCharacterHeightProfile } from "../../../../services/drama/visual/CharacterHeightProfileService";

/** 设定中心实体 DTO 投影；投影阶段也要保证返回的状态数组可直接进入生成链。 */

/** 角色别名归一：去空白、去重、剔除与本名相同的项；空列表存 null。 */
export function normalizeCharacterAliases(raw: unknown, name?: string): string[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const seen = new Set<string>();
  for (const item of raw) {
    if (typeof item !== "string") {
      continue;
    }
    const trimmed = item.trim();
    if (!trimmed || trimmed === name) {
      continue;
    }
    seen.add(trimmed);
  }
  return [...seen];
}

export function parseCharacterAliases(aliasesJson: string | null | undefined, name?: string): string[] {
  if (!aliasesJson?.trim()) {
    return [];
  }
  try {
    return normalizeCharacterAliases(JSON.parse(aliasesJson), name);
  } catch {
    return [];
  }
}

export function serializeCharacterAliases(aliases: string[] | null | undefined, name?: string): string | null {
  const normalized = normalizeCharacterAliases(aliases, name);
  return normalized.length > 0 ? JSON.stringify(normalized) : null;
}

export function projectCharacter(row: {
  id: string;
  name: string;
  role: string;
  gender: string | null;
  actorKind?: string | null;
  bodyBuild?: string | null;
  ageGroup: string | null;
  physique: string | null;
  attireStyle: string | null;
  facePrompt: string | null;
  voiceTexture?: string | null;
  personality: string | null;
  appearance: string | null;
  background: string | null;
  heightProfileJson?: string | null;
  statesJson?: string | null;
  aliasesJson?: string | null;
  updatedAt: Date;
}, novelId: string) {
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    gender: row.gender,
    actorKind: row.actorKind ?? "human",
    bodyBuild: row.bodyBuild ?? "unknown",
    ageGroup: row.ageGroup,
    physique: row.physique,
    attireStyle: row.attireStyle,
    facePrompt: row.facePrompt,
    voiceTexture: row.voiceTexture ?? null,
    personality: row.personality,
    appearance: row.appearance,
    background: row.background,
    heightProfile: projectCharacterHeightProfile(row.heightProfileJson),
    aliases: parseCharacterAliases(row.aliasesJson, row.name),
    states: scopeStateImageUrls(normalizeCharacterStates(parseStates(row.statesJson), row), novelId, "character", row.id),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function projectCharacterHeightProfile(raw: string | null | undefined) {
  const profile = parseCharacterHeightProfile(raw);
  return profile
    ? {
      heightMeters: profile.heightMeters,
      confidence: profile.confidence,
      source: profile.source,
    }
    : null;
}

export function projectScene(row: {
  id: string;
  name: string;
  sceneType: string | null;
  summary: string | null;
  environmentPrompt: string | null;
  significance: string | null;
  timeOfDay: string | null;
  weather: string | null;
  imageData?: string | null;
  mapNodeId: string | null;
  mapUnmappable: boolean;
  sortOrder: number;
  source: string;
  statesJson?: string | null;
  scene3dEnvironmentJson?: string | null;
  updatedAt: Date;
}, novelId: string) {
  const baseStates = normalizeSceneStates(parseStates(row.statesJson), row);
  const scene3dEnvironment = resolveStoryScene3dEnvironment(
    row.sceneType,
    row.scene3dEnvironmentJson,
    baseStates[0]?.sceneType,
  );
  const states = normalizeSceneStates(baseStates, {
    ...row,
    scene3dEnvironment,
  });
  return {
    id: row.id,
    name: row.name,
    sceneType: row.sceneType,
    summary: row.summary,
    environmentPrompt: row.environmentPrompt,
    significance: row.significance,
    timeOfDay: row.timeOfDay ?? null,
    weather: row.weather ?? null,
    image: parseStoryAssetImage(row.imageData),
    mapNodeId: row.mapNodeId,
    mapUnmappable: row.mapUnmappable,
    sortOrder: row.sortOrder,
    source: row.source,
    states: scopeStateImageUrls(states, novelId, "scene", row.id),
    scene3dEnvironment,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function projectProp(
  row: {
    id: string;
    name: string;
    propType: string;
    description: string | null;
    plotFunction: string | null;
    visualPrompt: string | null;
    ownerCharacterId: string | null;
    importance: string;
    firstAppearHint: string | null;
    imageData?: string | null;
    sortOrder: number;
    source: string;
    statesJson?: string | null;
    updatedAt: Date;
  },
  ownerCharacterName: string | null,
  novelId: string,
) {
  return {
    id: row.id,
    name: row.name,
    propType: row.propType,
    description: row.description,
    plotFunction: row.plotFunction,
    visualPrompt: row.visualPrompt,
    ownerCharacterId: row.ownerCharacterId,
    ownerCharacterName,
    importance: row.importance,
    firstAppearHint: row.firstAppearHint,
    image: parseStoryAssetImage(row.imageData),
    sortOrder: row.sortOrder,
    source: row.source,
    states: scopeStateImageUrls(normalizePropStates(parseStates(row.statesJson), row), novelId, "prop", row.id),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export type StorySettingsProjectedState = StoryAssetState;
export type StorySettingsProjectedImage = StoryAssetImageState;
