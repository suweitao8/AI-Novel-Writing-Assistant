// 通用美术风格（系统级）：所有漫剧画面共用的渲染质感基线，不含时代/题材属性。
// 存 AppSetting（key=drama.universalArtStyle，JSON {prompt}）；prompt 留空＝用内置默认
// （DEFAULT_UNIVERSAL_ART_STYLE）。题材/氛围由小说级具体风格叠加，见 dramaVisualStyles.ts。
import { prisma } from "../../db/prisma";

const GLOBAL_ART_STYLE_SETTING_KEY = "drama.universalArtStyle";
const MAX_PROMPT_LENGTH = 2000;

export interface GlobalArtStyleSettings {
  /** 自定义通用风格提示词；空串表示使用内置默认。 */
  prompt: string;
}

function normalizePrompt(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim().slice(0, MAX_PROMPT_LENGTH);
}

function parseArtStylePayload(value: string): GlobalArtStyleSettings {
  try {
    const payload = JSON.parse(value) as Record<string, unknown>;
    return { prompt: normalizePrompt(payload.prompt) };
  } catch {
    return { prompt: "" };
  }
}

export async function getGlobalArtStyleSettings(): Promise<GlobalArtStyleSettings> {
  const record = await prisma.appSetting.findUnique({
    where: { key: GLOBAL_ART_STYLE_SETTING_KEY },
  });
  return record ? parseArtStylePayload(record.value) : { prompt: "" };
}

export async function saveGlobalArtStyleSettings(input: { prompt?: unknown }): Promise<GlobalArtStyleSettings> {
  const settings: GlobalArtStyleSettings = { prompt: normalizePrompt(input.prompt) };
  const value = JSON.stringify(settings);
  await prisma.appSetting.upsert({
    where: { key: GLOBAL_ART_STYLE_SETTING_KEY },
    update: { value },
    create: { key: GLOBAL_ART_STYLE_SETTING_KEY, value },
  });
  return settings;
}
