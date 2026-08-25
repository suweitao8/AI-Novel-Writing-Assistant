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

// 旧版本把内置默认提示词写进了 drama.assetArtStyles，导致升级代码默认值后仍继续显示旧的三维游戏媒介。
// 只按每类旧默认提示词的稳定前缀归一化，用户真正保存的其他自定义内容不受影响。
const LEGACY_DEFAULT_PROMPT_PREFIX_BY_KIND: Record<DramaAssetStyleKind, string> = {
  character: "影视化三维游戏美术质感：",
  scene: "影视化三维场景美术质感：",
  prop: "影视化三维道具美术质感：",
};

function isLegacyDefaultPrompt(kind: DramaAssetStyleKind, prompt: string): boolean {
  return prompt.startsWith(LEGACY_DEFAULT_PROMPT_PREFIX_BY_KIND[kind]);
}

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
    const characterPrompt = normalizeDramaAssetStylePrompt(payload.characterPrompt);
    const scenePrompt = normalizeDramaAssetStylePrompt(payload.scenePrompt);
    const propPrompt = normalizeDramaAssetStylePrompt(payload.propPrompt);
    return {
      characterPrompt: isLegacyDefaultPrompt("character", characterPrompt) ? "" : characterPrompt,
      scenePrompt: isLegacyDefaultPrompt("scene", scenePrompt) ? "" : scenePrompt,
      propPrompt: isLegacyDefaultPrompt("prop", propPrompt) ? "" : propPrompt,
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
