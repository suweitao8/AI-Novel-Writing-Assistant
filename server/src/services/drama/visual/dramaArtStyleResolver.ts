// 漫剧画面风格的统一解析入口：把「通用画风（系统级）+ 时代风格（题材层）」
// 组合成生成侧可直接使用的两层上下文。首帧图与角色立绘都从这里取风格，保证两边一致。
//
// 时代风格解析优先级（2026-08-21 用户决定：脚本切换是主入口，切换后后面都用新的）：
//   1. 章节脚本【画风：名】标记——从最新章节往前找最近一次标记（新章节无标记=沿用上一次）
//   2. DramaProject.visualStyle（手动选择/创建时写入；内置预设 id 或自定义风格名）
//   3. 小说默认时代风格（NovelSettingsWorld.defaultArtStyle；预设 id 或自定义风格名）
//   4. 都没有 → 只用通用画风
// 自定义风格名的提示词存在 NovelSettingsWorld.artStylesJson（[{label,prompt}]，身份=label）；
// 解析逻辑与 StorySettingsService.parseArtStyles 同语义（本模块不 import 小说侧服务，避免
// 跨模块深依赖，两边契约由 tests/dramaArtStyle.test.js 与 story-settings 测试共同锁定）。
import { prisma } from "../../../db/prisma";
import { getGlobalArtStyleSettings } from "../../settings/GlobalArtStyleSettingsService";
import {
  DEFAULT_DRAMA_VISUAL_STYLE_ID,
  DEFAULT_UNIVERSAL_ART_STYLE,
  DRAMA_VISUAL_STYLE_PRESETS,
  extractLastEraStyleMarker,
  matchDramaEraStyle,
  type DramaSpecificStyle,
  type DramaUniversalArtStyle,
} from "./dramaVisualStyles";

export interface ResolvedDramaArtStyle {
  universal: DramaUniversalArtStyle;
  specific: DramaSpecificStyle | null;
}

export interface ResolveDramaArtStyleInput {
  /** 分镜项目的时代风格（内置预设 id 或自定义风格名）。 */
  visualStyle?: string | null;
  /** 分镜项目的小说引用（DramaProject.sourceRef，source=novel_import 时为 novelId）。 */
  sourceRef?: string | null;
}

interface NovelArtStylesRecord {
  artStyles: DramaSpecificStyle[];
  defaultArtStyle: string | null;
}

async function loadNovelArtStyles(novelId: string): Promise<NovelArtStylesRecord> {
  const row = await prisma.novelSettingsWorld.findUnique({
    where: { novelId },
    select: { artStylesJson: true, defaultArtStyle: true },
  });
  if (!row?.artStylesJson?.trim()) {
    return { artStyles: [], defaultArtStyle: row?.defaultArtStyle?.trim() || null };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(row.artStylesJson);
  } catch {
    parsed = null;
  }
  const artStyles: DramaSpecificStyle[] = [];
  if (Array.isArray(parsed)) {
    const seen = new Set<string>();
    for (const item of parsed.slice(0, 12)) {
      if (!item || typeof item !== "object") {
        continue;
      }
      const label = String((item as { label?: unknown }).label ?? "").trim().slice(0, 20);
      if (!label || seen.has(label)) {
        continue;
      }
      seen.add(label);
      artStyles.push({
        label,
        styleInstructions: String((item as { prompt?: unknown }).prompt ?? "").trim().slice(0, 500),
      });
    }
  }
  return { artStyles, defaultArtStyle: row.defaultArtStyle?.trim() || null };
}

function matchSpecificStyle(
  chosen: string,
  artStyles: DramaSpecificStyle[],
): DramaSpecificStyle | null {
  return matchDramaEraStyle(chosen, artStyles);
}

// 小说当前的脚本画风：从最新章节往前找最近一次【画风：名】标记。
// 章节脚本标记是用户在「脚本」页签切换画风时写入的（标记对后续内容生效），
// 所以「最新章节的最后一个标记」就是小说当前推进到的时代风格。
async function loadNovelScriptEraStyleKey(novelId: string): Promise<string | null> {
  const chapters = await prisma.chapter.findMany({
    where: { novelId },
    orderBy: { order: "desc" },
    select: { expectation: true },
  });
  for (const chapter of chapters) {
    const marker = extractLastEraStyleMarker(chapter.expectation);
    if (marker) {
      return marker;
    }
  }
  return null;
}

export async function resolveDramaArtStyleContext(input: ResolveDramaArtStyleInput): Promise<ResolvedDramaArtStyle> {
  const universal: DramaUniversalArtStyle = { ...DEFAULT_UNIVERSAL_ART_STYLE };
  const setting = await getGlobalArtStyleSettings();
  if (setting.prompt) {
    universal.styleInstructions = setting.prompt;
  }

  const novelId = input.sourceRef?.trim() || null;
  const novelArtStyles = novelId
    ? await loadNovelArtStyles(novelId)
    : { artStyles: [] as DramaSpecificStyle[], defaultArtStyle: null };

  const scriptKey = novelId ? await loadNovelScriptEraStyleKey(novelId) : null;
  if (scriptKey) {
    const specific = matchDramaEraStyle(scriptKey, novelArtStyles.artStyles);
    if (specific) {
      return { universal, specific };
    }
  }

  const chosen = input.visualStyle?.trim();
  if (chosen) {
    return { universal, specific: matchSpecificStyle(chosen, novelArtStyles.artStyles) };
  }

  if (!novelArtStyles.defaultArtStyle) {
    return { universal, specific: null };
  }
  return { universal, specific: matchSpecificStyle(novelArtStyles.defaultArtStyle, novelArtStyles.artStyles) };
}

// 当前生效时代风格的总览（供「脚本」页签显示与切换）：source 说明它来自哪里——
// script=章节脚本标记（切换后生效）、novel-default=小说默认、builtin=内置默认。
export interface DramaEraStyleOverview {
  key: string;
  label: string;
  source: "script" | "novel-default" | "builtin";
}

export async function resolveNovelEraStyleOverview(novelId: string): Promise<DramaEraStyleOverview> {
  const novelArtStyles = await loadNovelArtStyles(novelId);
  const scriptKey = await loadNovelScriptEraStyleKey(novelId);
  if (scriptKey) {
    const matched = matchDramaEraStyle(scriptKey, novelArtStyles.artStyles);
    if (matched) {
      return { key: scriptKey, label: matched.label, source: "script" };
    }
  }
  if (novelArtStyles.defaultArtStyle) {
    const matched = matchDramaEraStyle(novelArtStyles.defaultArtStyle, novelArtStyles.artStyles);
    if (matched) {
      return { key: novelArtStyles.defaultArtStyle, label: matched.label, source: "novel-default" };
    }
  }
  const builtin = DRAMA_VISUAL_STYLE_PRESETS.find((preset) => preset.id === DEFAULT_DRAMA_VISUAL_STYLE_ID);
  return { key: DEFAULT_DRAMA_VISUAL_STYLE_ID, label: builtin?.label ?? DEFAULT_DRAMA_VISUAL_STYLE_ID, source: "builtin" };
}
