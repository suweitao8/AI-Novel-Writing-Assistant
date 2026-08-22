// 参考文本解析服务（漫剧工作室「参考/提取」页签）：
// previewReferenceParse 一次大模型调用同时产出分镜式初稿（segments + 拼好的
// draftText）与本章设定提取建议（角色/场景/道具/世界观）——2026-08-20 起由
// 原来的初稿/提取两个并行调用合并而来：参考文本量不大，一次解析共享同一份
// 原文理解，人物与场景天然对齐，也省一半输入开销。纯预览不落库；落库由
// 前端「解析」流程完成（初稿经用户确认写 Chapter.expectation，提取建议随
// 章节存 Chapter.referenceExtractionJson）。
import { prisma } from "../../../../db/prisma";
import { AppError } from "../../../../middleware/errorHandler";
import { runStructuredPrompt } from "../../../../prompting/core/promptRunner";
import { chapterReferenceParsePrompt } from "../../../../prompting/prompts/novel/chapterReferenceParse.prompts";
import type { ChapterReferenceParsePayload } from "@ai-novel/shared/types/novelChapterReferenceParse";
import { parseCharacterAliases } from "../../story-settings/application/StorySettingsProjection";
import {
  normalizeStoryCharacterStates,
  parseStoryAssetStatesJson,
  type StoryCharacterLegacyFields,
} from "@ai-novel/shared/types/novelReferenceExtraction";

const REFERENCE_TEXT_MIN_LENGTH = 50;
const REFERENCE_TEXT_MAX_LENGTH = 20000;

// 分镜式初稿文本序列化：每个单元两行（「分镜：景别，画面」+「旁白/台词（带神态）」），
// 单元之间空行。两类切换标记都单独成行、放在单元上方，持续生效到下一个同类标记：
// - 场景变化 → 「【场景：地点】」（后续分镜/视频按它换场）
// - 角色外观状态切换 → 「【角色状态：名字：状态】」（后续画面按它切换角色形象）
// 连续同值切换会被折叠：AI 重复输出同一状态时只保留第一次。
// 美术风格不进初稿（2026-08-20 用户决定）：画风由设定·美术风格的默认风格决定。
export function serializeDraftSegments(
  segments: Array<{
    shot: string;
    storyboard: string;
    scene: string;
    speaker: string;
    kind: string;
    mood: string;
    text: string;
    stateSwitches?: Array<{ name: string; state: string }>;
  }>,
): string {
  let currentScene = "";
  const characterStates = new Map<string, string>();
  return segments.map((segment) => {
    const markerLines: string[] = [];
    const sceneName = segment.scene.trim();
    if (sceneName && sceneName !== currentScene) {
      markerLines.push(`【场景：${sceneName}】`);
      currentScene = sceneName;
    }
    for (const stateSwitch of segment.stateSwitches ?? []) {
      const name = stateSwitch.name.trim();
      const state = stateSwitch.state.trim();
      if (!name || !state || characterStates.get(name) === state) {
        continue;
      }
      characterStates.set(name, state);
      markerLines.push(`【角色状态：${name}：${state}】`);
    }
    const markerBlock = markerLines.length > 0 ? `${markerLines.join("\n")}\n` : "";
    const mood = segment.kind === "dialogue" && segment.mood ? `（${segment.mood}）` : "";
    return `${markerBlock}分镜：${segment.shot}，${segment.storyboard}\n${segment.speaker}${mood}：${segment.text}`;
  }).join("\n\n");
}

// 角色已登记的外观状态行（「李火旺：正常、重伤、癫狂」），供初稿按既有状态名切换。
function parseCharacterStateLine(
  name: string,
  statesJson: string | null,
  legacy: StoryCharacterLegacyFields,
): string | null {
  const states = normalizeStoryCharacterStates(parseStoryAssetStatesJson(statesJson).states, legacy);
  const labels = states.map((state) => state.label.trim()).filter(Boolean).slice(0, 8);
  return labels.length > 0 ? `${name}：${labels.join("、")}` : null;
}

export class ChapterReferenceParseService {
  // 一次解析：同一份原文同时产出分镜初稿与设定建议，供前端「解析」流程直接使用。
  async previewReferenceParse(
    novelId: string,
    chapterId: string,
    referenceText: string,
  ): Promise<ChapterReferenceParsePayload> {
    const [novel, chapter, sceneRows, characterRows] = await Promise.all([
      prisma.novel.findUnique({ where: { id: novelId }, select: { id: true, title: true } }),
      prisma.chapter.findFirst({
        where: { id: chapterId, novelId },
        select: { id: true, title: true, order: true },
      }),
      prisma.novelScene.findMany({
        where: { novelId },
        select: { name: true },
        orderBy: { sortOrder: "asc" },
        take: 20,
      }),
      prisma.character.findMany({
        where: { novelId },
        select: {
          name: true,
          statesJson: true,
          aliasesJson: true,
          gender: true,
          ageGroup: true,
          physique: true,
          attireStyle: true,
          facePrompt: true,
          appearance: true,
          voiceTexture: true,
        },
        orderBy: { createdAt: "asc" },
        take: 20,
      }),
    ]);
    if (!novel) {
      throw new AppError("没有找到这本小说。", 404);
    }
    if (!chapter) {
      throw new AppError("没有找到这一章。", 404);
    }
    const text = referenceText.trim();
    if (text.length < REFERENCE_TEXT_MIN_LENGTH) {
      throw new AppError("参考内容太短。", 400);
    }
    if (text.length > REFERENCE_TEXT_MAX_LENGTH) {
      throw new AppError("参考内容过长。", 400);
    }
    const existingScenes = sceneRows.map((row) => row.name).filter(Boolean);
    const characterStates = characterRows
      .map((row) => parseCharacterStateLine(row.name, row.statesJson, row))
      .filter((line): line is string => line !== null);
    // 角色别名名单（「叶晨：哥哥、晨哥」）：原文用称呼指代角色时按名单归一成本名。
    const characterAliases = characterRows
      .map((row) => {
        const aliases = parseCharacterAliases(row.aliasesJson, row.name);
        return aliases.length > 0 ? `${row.name}：${aliases.join("、")}` : null;
      })
      .filter((line): line is string => line !== null);
    const generated = await runStructuredPrompt({
      asset: chapterReferenceParsePrompt,
      promptInput: {
        novelTitle: novel.title,
        chapterTitle: chapter.title,
        chapterOrder: chapter.order,
        referenceText: text,
        existingScenes: existingScenes.length > 0 ? existingScenes : undefined,
        characterStates: characterStates.length > 0 ? characterStates : undefined,
        characterAliases: characterAliases.length > 0 ? characterAliases : undefined,
      },
      options: {
        novelId,
        stage: "chapter_reference_parse",
        entrypoint: "drama_studio",
        temperature: 0.4,
      },
    });
    const segments = generated.output.segments;
    const draftText = serializeDraftSegments(segments);
    const { characters, scenes, props, worldview } = generated.output;
    return { segments, draftText, extraction: { characters, scenes, props, worldview } };
  }
}

export const chapterReferenceParseService = new ChapterReferenceParseService();
