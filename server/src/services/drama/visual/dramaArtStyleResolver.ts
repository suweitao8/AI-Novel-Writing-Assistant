// 漫剧画面风格的统一解析入口：把「通用美术风格（系统级）+ 具体风格（项目/小说级）」
// 组合成生成侧可直接使用的两层上下文。首帧图与角色立绘都从这里取风格，保证两边一致。
//
// 具体风格解析优先级（与创建分镜项目时的画风优先级对齐）：
//   1. DramaProject.visualStyle（手动选择/创建时写入；内置预设 id 或自定义风格名）
//   2. 小说默认具体风格（NovelSettingsWorld.defaultArtStyle；预设 id 或自定义风格名）
//   3. 都没有 → 只用通用风格
// 自定义风格名的提示词存在 NovelSettingsWorld.artStylesJson（[{label,prompt}]，身份=label）；
// 解析逻辑与 StorySettingsService.parseArtStyles 同语义（本模块不 import 小说侧服务，避免
// 跨模块深依赖，两边契约由 tests/dramaArtStyle.test.js 与 story-settings 测试共同锁定）。
import { prisma } from "../../../db/prisma";
import { getGlobalArtStyleSettings } from "../../settings/GlobalArtStyleSettingsService";
import {
  DEFAULT_UNIVERSAL_ART_STYLE,
  resolveDramaVisualStyle,
  type DramaSpecificStyle,
  type DramaUniversalArtStyle,
} from "./dramaVisualStyles";

export interface ResolvedDramaArtStyle {
  universal: DramaUniversalArtStyle;
  specific: DramaSpecificStyle | null;
}

export interface ResolveDramaArtStyleInput {
  /** 分镜项目的具体风格（内置预设 id 或自定义风格名）。 */
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
  const preset = resolveDramaVisualStyle(chosen);
  if (preset) {
    return preset;
  }
  const custom = artStyles.find((style) => style.label === chosen);
  return custom && custom.styleInstructions ? custom : null;
}

export async function resolveDramaArtStyleContext(input: ResolveDramaArtStyleInput): Promise<ResolvedDramaArtStyle> {
  const universal: DramaUniversalArtStyle = { ...DEFAULT_UNIVERSAL_ART_STYLE };
  const setting = await getGlobalArtStyleSettings();
  if (setting.prompt) {
    universal.styleInstructions = setting.prompt;
  }

  const chosen = input.visualStyle?.trim();
  if (chosen) {
    const novelId = input.sourceRef?.trim() || null;
    const novelArtStyles = novelId ? await loadNovelArtStyles(novelId) : { artStyles: [], defaultArtStyle: null };
    return { universal, specific: matchSpecificStyle(chosen, novelArtStyles.artStyles) };
  }

  const novelId = input.sourceRef?.trim() || null;
  if (!novelId) {
    return { universal, specific: null };
  }
  const novelArtStyles = await loadNovelArtStyles(novelId);
  if (!novelArtStyles.defaultArtStyle) {
    return { universal, specific: null };
  }
  return { universal, specific: matchSpecificStyle(novelArtStyles.defaultArtStyle, novelArtStyles.artStyles) };
}
