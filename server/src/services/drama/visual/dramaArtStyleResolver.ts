// 漫剧画面风格的统一解析入口：把「三类资产画风（系统级）+ 时代风格（题材层）」
// 组合成生成侧可直接使用的上下文。资产图、状态图与首帧图都从这里取风格，保证一致。
//
// 时代风格解析优先级：
//   0. 本次生成点显式指定的时代风格（pinnedStyle）——状态图的自选风格字段。
//      双穿/时代推进的书同一资产在不同时代各有一套状态，用户给状态选定的风格
//      是最高优先级，直接采用不再判定；状态未选时调用方兜底内置「现代都市」
//      预设（DEFAULT_DRAMA_VISUAL_STYLE_ID，2026-08-22 用户要求：不按剧情自动判定）；
//      悬空引用（风格已删）回落 1-4 链
//   1. 【本次生成带剧情上下文时】AI 按剧情文本判定——故事有时代推进，
//      开篇可能仍是崩溃前的现代、章末才进末世，全局风格不能一刀切；判定失败回落 2-4 链
//      （当前只有分镜首帧 DramaShotKeyframeService 传剧情上下文；状态图已固定走第 0 层）
//   2. 章节脚本【画风：名】标记——从最新章节往前找最近一次标记（新章节无标记=沿用上一次）
//   3. DramaProject.visualStyle（手动选择/创建时写入；内置预设 id 或自定义风格名）
//   4. 小说默认时代风格（NovelSettingsWorld.defaultArtStyle；预设 id 或自定义风格名）
//   5. 都没有 → 只用三类资产默认画风
// 自定义风格名的提示词存在 NovelSettingsWorld.artStylesJson（[{label,prompt}]，身份=label）；
// 解析逻辑与 StorySettingsService.parseArtStyles 同语义（本模块不 import 小说侧服务，避免
// 跨模块深依赖，两边契约由 tests/dramaArtStyle.test.js 与 story-settings 测试共同锁定）。
import { prisma } from "../../../db/prisma";
import { getDramaAssetArtStyleOverrides } from "../../settings/DramaAssetArtStyleSettingsService";
import {
  DEFAULT_DRAMA_ASSET_STYLES,
  DEFAULT_DRAMA_VISUAL_STYLE_ID,
  DRAMA_ASSET_STYLE_KINDS,
  DRAMA_VISUAL_STYLE_PRESETS,
  extractLastEraStyleMarker,
  matchDramaEraStyle,
  type DramaAssetStyleKind,
  type DramaAssetVisualStyle,
  type DramaSpecificStyle,
} from "./dramaVisualStyles";
import { judgeEraStyle, type JudgeEraStyleFn } from "./eraStyleJudge";

export interface ResolvedDramaArtStyle {
  assets: Record<DramaAssetStyleKind, DramaAssetVisualStyle>;
  specific: DramaSpecificStyle | null;
}

/** 按剧情判定时代风格的上下文（2026-08-22 用户要求）：带剧情文本的生成点用。 */
export interface DramaScriptStyleJudgeInput {
  /** 本次生成对象描述（如「叶竹 · 初始状态 状态图」「第12镜 首帧（叶城大学宿舍）」）。 */
  target: string;
  /** 该故事节点附近的剧情文本（章节脚本 / 集正文与镜头画面台词）。 */
  scriptExcerpt: string;
}

export interface ResolveDramaArtStyleInput {
  /** 分镜项目的时代风格（内置预设 id 或自定义风格名）。 */
  visualStyle?: string | null;
  /** 分镜项目的小说引用（DramaProject.sourceRef，source=novel_import 时为 novelId）。 */
  sourceRef?: string | null;
  /** 本次生成点显式指定的时代风格（内置预设 id/label 或自定义风格名）：命中可选风格时
   *  直接采用（跳过剧情判定与全局链）；悬空引用回落常规链。 */
  pinnedStyle?: string | null;
  /** 提供时由 AI 按剧情文本从可选风格里选本段所处的时代风格，覆盖全局链结果。 */
  scriptJudge?: DramaScriptStyleJudgeInput | null;
  /** 判定函数注入（测试用）；缺省走真实 LLM 判定。 */
  judgeFn?: JudgeEraStyleFn;
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
  const overrides = await getDramaAssetArtStyleOverrides();
  const assets = Object.fromEntries(
    DRAMA_ASSET_STYLE_KINDS.map((kind) => {
      const style = DEFAULT_DRAMA_ASSET_STYLES[kind];
      const prompt = overrides[`${kind}Prompt` as "characterPrompt" | "scenePrompt" | "propPrompt"];
      return [kind, { ...style, styleInstructions: prompt || style.styleInstructions }];
    }),
  ) as Record<DramaAssetStyleKind, DramaAssetVisualStyle>;

  const novelId = input.sourceRef?.trim() || null;
  const novelArtStyles = novelId
    ? await loadNovelArtStyles(novelId)
    : { artStyles: [] as DramaSpecificStyle[], defaultArtStyle: null };

  // 用户给生成点显式选定的时代风格（状态图的自选字段）：直接采用，不再判定。
  // 匹配不到可选风格（如自定义风格已删）时按悬空引用处理，回落常规链。
  const pinned = input.pinnedStyle?.trim();
  if (pinned) {
    const pinnedSpecific = matchDramaEraStyle(pinned, novelArtStyles.artStyles);
    if (pinnedSpecific) {
      return { assets, specific: pinnedSpecific };
    }
  }

  const scriptKey = novelId ? await loadNovelScriptEraStyleKey(novelId) : null;
  if (scriptKey) {
    const specific = matchDramaEraStyle(scriptKey, novelArtStyles.artStyles);
    if (specific) {
      return { assets, specific: await resolveSpecificWithScriptJudge(input, novelId, scriptKey, novelArtStyles.artStyles) };
    }
  }

  const chosen = input.visualStyle?.trim();
  if (chosen) {
    return { assets, specific: await resolveSpecificWithScriptJudge(input, novelId, chosen, novelArtStyles.artStyles) };
  }

  if (!novelArtStyles.defaultArtStyle) {
    return { assets, specific: await resolveSpecificWithScriptJudge(input, novelId, null, novelArtStyles.artStyles) };
  }
  return {
    assets,
    specific: await resolveSpecificWithScriptJudge(input, novelId, novelArtStyles.defaultArtStyle, novelArtStyles.artStyles),
  };
}

// 全局链解析出 specific 后，若本次生成带剧情上下文，交给 AI 按剧情文本重判：
// 判定命中可选风格则覆盖；失败/未提供上下文时原样返回（判定是增强不是门槛）。
async function resolveSpecificWithScriptJudge(
  input: ResolveDramaArtStyleInput,
  novelId: string | null,
  chainKey: string | null,
  customStyles: DramaSpecificStyle[],
): Promise<DramaSpecificStyle | null> {
  const chainSpecific = chainKey ? matchDramaEraStyle(chainKey, customStyles) : null;
  const excerpt = input.scriptJudge?.scriptExcerpt?.trim();
  if (!excerpt) {
    return chainSpecific;
  }
  const availableStyles = [
    ...DRAMA_VISUAL_STYLE_PRESETS.map((preset) => ({ key: preset.id, label: preset.label, summary: preset.summary })),
    ...customStyles.map((style) => ({
      key: style.label,
      label: style.label,
      summary: style.styleInstructions.slice(0, 80),
    })),
  ];
  const judge = input.judgeFn ?? judgeEraStyle;
  const judged = await judge({
    ...(novelId ? { novelId } : {}),
    target: input.scriptJudge?.target ?? "",
    scriptExcerpt: excerpt,
    availableStyles,
    defaultKey: chainKey,
  });
  if (!judged) {
    return chainSpecific;
  }
  const judgedSpecific = matchDramaEraStyle(judged.styleKey, customStyles);
  if (judgedSpecific) {
    console.log(`[era-style-judge] ${input.scriptJudge?.target ?? ""} → ${judged.styleKey}（${judged.reason}）`);
    return judgedSpecific;
  }
  return chainSpecific;
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
