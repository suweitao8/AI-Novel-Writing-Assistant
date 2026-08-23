import { prisma } from "../../db/prisma";
import { compactText, safeJsonParse } from "./utils/json";
import {
  normalizeStoryCharacterStates,
  parseStoryAssetStatesJson,
  type StoryAssetState,
} from "@ai-novel/shared/types/novelReferenceExtraction";

interface BeatLite {
  order: number;
  summary: string;
}

/**
 * novel_import 项目：按名字读设定中心角色的外观状态（含 image/chapterOrder 等完整字段）。
 * charactersDigest 拼成「状态：」名单喂给分镜 LLM（drama.storyboard@v5 据此标
 * characterStates）；首帧图服务也用它把镜头状态标注解析成状态对象（切形象与参考图）。
 */
export async function loadNovelCharacterStatesByName(novelId: string): Promise<Map<string, StoryAssetState[]>> {
  const rows = await prisma.character.findMany({
    where: { novelId },
    select: {
      name: true,
      statesJson: true,
      gender: true,
      ageGroup: true,
      physique: true,
      attireStyle: true,
      facePrompt: true,
      appearance: true,
      voiceTexture: true,
    },
  });
  const map = new Map<string, StoryAssetState[]>();
  for (const row of rows) {
    const states = normalizeStoryCharacterStates(
      parseStoryAssetStatesJson(row.statesJson).states,
      row,
    );
    map.set(row.name.trim(), states);
  }
  return map;
}

function formatStateLabels(states: StoryAssetState[]): string {
  return states
    .map((state) => {
      const details = [
        state.chapterOrder ? `第${state.chapterOrder}章` : "",
        state.ageGroup ? `年龄段：${state.ageGroup}` : "",
        state.imagePrompt?.trim() || state.description?.trim()
          ? `画面：${compactText(state.imagePrompt || state.description, 180)}`
          : "",
        state.voicePrompt?.trim() || state.voice?.prompt?.trim()
          ? `音色：${compactText(state.voicePrompt || state.voice?.prompt, 120)}`
          : "",
      ].filter(Boolean);
      return details.length > 0
        ? `${state.label.trim()}（${details.join("；")}）`
        : state.label.trim();
    })
    .join("；");
}

/**
 * novel_import 项目：按名字读设定中心角色的别名（如 哥哥、晨哥）。
 * charactersDigest 拼成「别名：」名单喂给分镜 LLM——原文用称呼指代角色时按名单归一成本名输出。
 * 解析在本地做（与 statesJson 同风格），不 import novel 模块，保持 drama 边界自洽。
 */
export async function loadNovelCharacterAliasesByName(novelId: string): Promise<Map<string, string[]>> {
  const rows = await prisma.character.findMany({
    where: { novelId },
    select: { name: true, aliasesJson: true },
  });
  const map = new Map<string, string[]>();
  for (const row of rows) {
    const raw = safeJsonParse<unknown[]>(row.aliasesJson, []);
    const seen = new Set<string>();
    for (const item of Array.isArray(raw) ? raw : []) {
      if (typeof item === "string") {
        const trimmed = item.trim();
        if (trimmed && trimmed !== row.name) {
          seen.add(trimmed);
        }
      }
    }
    if (seen.size > 0) {
      map.set(row.name.trim(), [...seen]);
    }
  }
  return map;
}

export class DramaContextAssembler {
  async buildEpisodeContext(projectId: string, episodeOrder: number) {
    // 防御：即使调用方传入字符串型 order 也能正确匹配
    const targetOrder = Number(episodeOrder);
    // 分集列表不携带台本正文（content 可能是整集长文本）；只有目标集与前情摘要按需取正文。
    const [projectBase, episodes, previousContentRows, targetContentRow] = await Promise.all([
      prisma.dramaProject.findUnique({
        where: { id: projectId },
        include: {
          sourceBundle: true,
          characters: true,
          facts: { orderBy: [{ episodeOrder: "asc" }, { createdAt: "asc" }] },
        },
      }),
      prisma.dramaEpisode.findMany({
        where: { projectId },
        orderBy: { order: "asc" },
        omit: { content: true },
      }),
      // 只取最近 3 集有正文的前情（旧逻辑 content 非空判定等价于 not null 且非空串）。
      prisma.dramaEpisode.findMany({
        where: {
          projectId,
          order: { lt: targetOrder },
          AND: [{ content: { not: null } }, { content: { not: "" } }],
        },
        orderBy: { order: "desc" },
        take: 3,
        select: { order: true, title: true, content: true },
      }),
      prisma.dramaEpisode.findFirst({
        where: { projectId, order: targetOrder },
        select: { content: true },
      }),
    ]);
    if (!projectBase) {
      throw new Error(`未找到短剧项目：${projectId}`);
    }
    const episodeRow = episodes.find((item) => item.order === targetOrder);
    if (!episodeRow) {
      throw new Error(`未找到短剧第 ${episodeOrder} 集大纲。`);
    }
    // 仅目标集回填正文（episode 与 project.episodes 同源同形），其余分集保持无正文形态，避免一次拉全项目台本。
    const targetContent = targetContentRow?.content ?? null;
    const episode = { ...episodeRow, content: targetContent };
    const episodesWithContent = episodes.map((item) => ({
      ...item,
      content: item.order === targetOrder ? targetContent : null,
    }));
    const project = { ...projectBase, episodes: episodesWithContent };
    const beats = safeJsonParse<BeatLite[]>(project.sourceBundle?.beats, []);
    const sourceMap = safeJsonParse<{ beatRefs?: number[] }>(episode.sourceMap, {});
    const relatedBeats = sourceMap.beatRefs?.length
      ? beats.filter((beat) => sourceMap.beatRefs?.includes(beat.order))
      : beats.slice(Math.max(0, episodeOrder - 2), episodeOrder + 2);
    const novelStatesByName = project.source === "novel_import" && project.sourceRef?.trim()
      ? await loadNovelCharacterStatesByName(project.sourceRef.trim())
      : new Map<string, StoryAssetState[]>();
    const novelAliasesByName = project.source === "novel_import" && project.sourceRef?.trim()
      ? await loadNovelCharacterAliasesByName(project.sourceRef.trim())
      : new Map<string, string[]>();

    return {
      project,
      episode,
      strategyJson: project.strategy ?? "{}",
      episodeJson: JSON.stringify({
        order: episode.order,
        title: episode.title,
        hookOpening: episode.hookOpening,
        hookType: episode.hookType,
        cliffhanger: episode.cliffhanger,
        emotionNet: episode.emotionNet,
        isPaywall: episode.isPaywall,
        beatSheet: safeJsonParse(episode.beatSheet, {}),
      }, null, 2),
      charactersDigest: project.characters.map((character) => {
        // 提取角色参考图 URL（形象图 + 四视图）
        const refImageUrls: string[] = [];
        if (character.portraitData) {
          try {
            const pd = JSON.parse(character.portraitData) as { status?: string; url?: string };
            if (pd.status === "done" && pd.url) refImageUrls.push(`形象图:${pd.url}`);
          } catch { /* skip */ }
        }
        if (character.threeViewData) {
          try {
            const tvd = JSON.parse(character.threeViewData) as Array<{ view?: string; status?: string; url?: string }>;
            for (const item of tvd) {
              if (item.status === "done" && item.url) refImageUrls.push(`${item.view}视:${item.url}`);
            }
          } catch { /* skip */ }
        }

        return [
          character.name,
          character.archetype ? `原型：${character.archetype}` : "",
          character.persona ? `人设：${character.persona}` : "",
          character.speechStyle ? `口吻：${character.speechStyle}` : "",
          character.visualAnchor ? `视觉：${compactText(character.visualAnchor, 160)}` : "",
          novelStatesByName.get(character.name.trim())?.length
            ? `状态：${formatStateLabels(novelStatesByName.get(character.name.trim()) ?? [])}`
            : "",
          novelAliasesByName.get(character.name.trim())?.length
            ? `别名：${(novelAliasesByName.get(character.name.trim()) ?? []).join("、")}（原文用这些称呼指该角色，输出一律用本名）`
            : "",
          refImageUrls.length > 0 ? `参考图：[${refImageUrls.join("，")}]（请保持人物视觉一致性）` : "",
          character.relations ? `关系：${compactText(character.relations, 160)}` : "",
        ].filter(Boolean).join("；");
      }).join("\n") || "暂无角色资源",
      factsDigest: project.facts.map((fact) => `E${fact.episodeOrder} ${fact.category}：${fact.text}`).join("\n") || "暂无事实",
      previousDigest: previousContentRows
        .slice()
        .reverse()
        .map((item) => `第${item.order}集《${item.title}》：${compactText(item.content, 260)}`)
        .join("\n") || "暂无前序台本",
      sourceDigest: relatedBeats.map((beat) => `${beat.order}：${beat.summary}`).join("\n") || compactText(project.sourceBundle?.synopsis, 1000),
    };
  }
}

export const dramaContextAssembler = new DramaContextAssembler();
