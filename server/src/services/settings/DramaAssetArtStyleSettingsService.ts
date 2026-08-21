// 三类资产画风的系统级自定义提示词：只保存角色、场景、道具各自的正向补充。
// 固定规格与负面约束由 dramaVisualStyles.ts 管理，旧 drama.universalArtStyle 保留但不读取。
import { prisma } from "../../db/prisma";
import {
  DRAMA_ASSET_STYLE_KINDS,
  type DramaAssetStyleKind,
} from "../drama/visual/dramaVisualStyles";

export const DRAMA_ASSET_ART_STYLE_SETTING_KEY = "drama.assetArtStyles";
export const MAX_DRAMA_ASSET_STYLE_PROMPT_LENGTH = 2000;

export interface DramaAssetArtStyleOverrides {
  characterPrompt: string;
  scenePrompt: string;
  propPrompt: string;
}

const EMPTY_OVERRIDES: DramaAssetArtStyleOverrides = {
  characterPrompt: "",
  scenePrompt: "",
  propPrompt: "",
};

const PROMPT_FIELD_BY_KIND: Record<DramaAssetStyleKind, keyof DramaAssetArtStyleOverrides> = {
  character: "characterPrompt",
  scene: "scenePrompt",
  prop: "propPrompt",
};

export function normalizeDramaAssetStyleKind(value: unknown): DramaAssetStyleKind | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  return (DRAMA_ASSET_STYLE_KINDS as readonly string[]).includes(normalized)
    ? (normalized as DramaAssetStyleKind)
    : null;
}

export function normalizeDramaAssetStylePrompt(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim().slice(0, MAX_DRAMA_ASSET_STYLE_PROMPT_LENGTH);
}

function emptyOverrides(): DramaAssetArtStyleOverrides {
  return { ...EMPTY_OVERRIDES };
}

export function parseDramaAssetArtStylePayload(value: unknown): DramaAssetArtStyleOverrides {
  if (typeof value !== "string" || !value.trim()) {
    return emptyOverrides();
  }
  try {
    const payload = JSON.parse(value) as Record<string, unknown>;
    return {
      characterPrompt: normalizeDramaAssetStylePrompt(payload.characterPrompt),
      scenePrompt: normalizeDramaAssetStylePrompt(payload.scenePrompt),
      propPrompt: normalizeDramaAssetStylePrompt(payload.propPrompt),
    };
  } catch {
    return emptyOverrides();
  }
}

export async function getDramaAssetArtStyleOverrides(): Promise<DramaAssetArtStyleOverrides> {
  const record = await prisma.appSetting.findUnique({
    where: { key: DRAMA_ASSET_ART_STYLE_SETTING_KEY },
  });
  return record ? parseDramaAssetArtStylePayload(record.value) : emptyOverrides();
}

export async function saveDramaAssetArtStyle(
  kind: DramaAssetStyleKind,
  input: { prompt?: unknown },
): Promise<DramaAssetArtStyleOverrides> {
  const overrides = await getDramaAssetArtStyleOverrides();
  overrides[PROMPT_FIELD_BY_KIND[kind]] = normalizeDramaAssetStylePrompt(input.prompt);
  await prisma.appSetting.upsert({
    where: { key: DRAMA_ASSET_ART_STYLE_SETTING_KEY },
    update: { value: JSON.stringify(overrides) },
    create: { key: DRAMA_ASSET_ART_STYLE_SETTING_KEY, value: JSON.stringify(overrides) },
  });
  return overrides;
}
