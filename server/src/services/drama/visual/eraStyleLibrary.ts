// 全局时代画风库（2026-08-22 用户要求）：一套全项目共用的时代画风——内置预设
// （dramaVisualStyles.ts，已调好）+ 用户自定义（AppSetting 全局存储）。小说/漫剧项目
// 不再各自定义时代画风，只引用这里的名字：脚本【画风：名】标记、状态 eraStyle、
// 分镜项目 visualStyle 都引用同一命名空间。
// 旧的 NovelSettingsWorld.artStylesJson（每本书各自的自定义时代画风）保留只读兼容：
// 解析时并入匹配（全局自定义同名优先），管理入口已移到全局画风管理页。
import { prisma } from "../../../db/prisma";
import { AppError } from "../../../middleware/errorHandler";
import { DRAMA_VISUAL_STYLE_PRESETS } from "./dramaVisualStyles";

export const DRAMA_ERA_STYLE_SETTING_KEY = "drama.eraStyles";
export const MAX_ERA_STYLE_LABEL_LENGTH = 20;
export const MAX_ERA_STYLE_PROMPT_LENGTH = 500;
export const MAX_ERA_STYLE_CUSTOM_COUNT = 24;

/** 自定义时代画风的存储形状（label 即身份，与内置预设 label 同一命名空间）。 */
export interface DramaEraStyleCustom {
  label: string;
  prompt: string;
}

export function normalizeEraStyleLabel(value: unknown): string {
  return typeof value === "string" ? value.trim().slice(0, MAX_ERA_STYLE_LABEL_LENGTH) : "";
}

export function normalizeEraStylePrompt(value: unknown): string {
  return typeof value === "string" ? value.trim().slice(0, MAX_ERA_STYLE_PROMPT_LENGTH) : "";
}

export function parseDramaEraStylePayload(value: unknown): DramaEraStyleCustom[] {
  if (typeof value !== "string" || !value.trim()) {
    return [];
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) {
    return [];
  }
  const seen = new Set<string>();
  const customs: DramaEraStyleCustom[] = [];
  for (const item of parsed.slice(0, MAX_ERA_STYLE_CUSTOM_COUNT)) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const label = normalizeEraStyleLabel((item as { label?: unknown }).label);
    const prompt = normalizeEraStylePrompt((item as { prompt?: unknown }).prompt);
    if (!label || !prompt || seen.has(label)) {
      continue;
    }
    seen.add(label);
    customs.push({ label, prompt });
  }
  return customs;
}

export async function getDramaEraStyleCustoms(): Promise<DramaEraStyleCustom[]> {
  const record = await prisma.appSetting.findUnique({
    where: { key: DRAMA_ERA_STYLE_SETTING_KEY },
  });
  return record ? parseDramaEraStylePayload(record.value) : [];
}

/** 校验并归一化整份自定义清单（全量替换语义）：去重、限量、禁止与内置预设重名。 */
export function normalizeDramaEraStyleLibrary(input: unknown): DramaEraStyleCustom[] {
  const list = Array.isArray(input) ? input : [];
  const builtinNames = new Set<string>([
    ...DRAMA_VISUAL_STYLE_PRESETS.map((preset) => preset.id),
    ...DRAMA_VISUAL_STYLE_PRESETS.map((preset) => preset.label),
  ]);
  const seen = new Set<string>();
  const customs: DramaEraStyleCustom[] = [];
  for (const item of list.slice(0, MAX_ERA_STYLE_CUSTOM_COUNT)) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const label = normalizeEraStyleLabel((item as { label?: unknown }).label);
    const prompt = normalizeEraStylePrompt((item as { prompt?: unknown }).prompt);
    if (!label || !prompt || seen.has(label)) {
      continue;
    }
    if (builtinNames.has(label)) {
      throw new AppError(`「${label}」是内置时代画风，请换一个名字。`, 400);
    }
    seen.add(label);
    customs.push({ label, prompt });
  }
  return customs;
}

/** 保存整份自定义时代画风清单（全量替换），返回归一化后的清单。 */
export async function saveDramaEraStyleLibrary(input: unknown): Promise<DramaEraStyleCustom[]> {
  const customs = normalizeDramaEraStyleLibrary(input);
  await prisma.appSetting.upsert({
    where: { key: DRAMA_ERA_STYLE_SETTING_KEY },
    update: { value: JSON.stringify(customs) },
    create: { key: DRAMA_ERA_STYLE_SETTING_KEY, value: JSON.stringify(customs) },
  });
  return customs;
}
