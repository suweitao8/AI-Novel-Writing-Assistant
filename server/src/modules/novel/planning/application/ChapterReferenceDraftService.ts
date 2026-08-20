// 参考文本应用服务（漫剧工作室「参考/提取」页签）：
// - previewReferenceDraft：把粘贴的小说原文 AI 压缩成逐行标注旁白/角色的初稿草稿（不落库），
//   用户确认后由前端写入 Chapter.expectation，沿用初稿页签的自动保存链路。
// - previewReferenceExtraction：从参考原文提取角色/场景/世界观设定建议（不落库），
//   用户在「提取」页签勾选确认后创建进设定中心。两个方法都只做纯预览，不触碰章节数据。
import { prisma } from "../../../../db/prisma";
import { AppError } from "../../../../middleware/errorHandler";
import { runStructuredPrompt } from "../../../../prompting/core/promptRunner";
import {
  chapterReferenceDraftPrompt,
} from "../../../../prompting/prompts/novel/chapterReferenceDraft.prompts";
import {
  chapterReferenceExtractPrompt,
} from "../../../../prompting/prompts/novel/chapterReferenceExtract.prompts";
import type { ChapterReferenceDraftPayload } from "@ai-novel/shared/types/novelChapterReferenceDraft";
import type { ReferenceExtractionPayload } from "@ai-novel/shared/types/novelReferenceExtraction";

const REFERENCE_TEXT_MIN_LENGTH = 50;
const REFERENCE_TEXT_MAX_LENGTH = 20000;

// 分镜式初稿文本序列化：每个单元两行（「分镜：景别，画面」+「旁白/台词（带神态）」），
// 单元之间空行。两类切换标记都单独成行、放在单元上方，持续生效到下一个同类标记：
// - 场景变化 → 「【场景：地点】」（后续分镜/视频按它换场）
// - 角色外观状态切换 → 「【角色状态：名字：状态】」（后续画面按它切换角色形象）
// 连续同值切换会被折叠：AI 重复输出同一状态时只保留第一次。
// 美术风格不进初稿（v8 起，2026-08-20 用户决定）：画风由设定·美术风格的默认风格决定。
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
function parseCharacterStateLine(name: string, statesJson: string | null): string | null {
  if (!statesJson?.trim()) return null;
  try {
    const parsed = JSON.parse(statesJson) as unknown;
    if (!Array.isArray(parsed)) return null;
    const labels = parsed
      .map((item) => (item && typeof item === "object" ? String((item as { label?: unknown }).label ?? "").trim() : ""))
      .filter(Boolean)
      .slice(0, 8);
    return labels.length > 0 ? `${name}：${labels.join("、")}` : null;
  } catch {
    return null;
  }
}

export class ChapterReferenceDraftService {
  // AI 压缩参考原文：返回结构化逐行结果与拼好的初稿文本，供前端预览确认。
  async previewReferenceDraft(
    novelId: string,
    chapterId: string,
    referenceText: string,
  ): Promise<ChapterReferenceDraftPayload> {
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
        select: { name: true, statesJson: true },
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
      .map((row) => parseCharacterStateLine(row.name, row.statesJson))
      .filter((line): line is string => line !== null);
    const generated = await runStructuredPrompt({
      asset: chapterReferenceDraftPrompt,
      promptInput: {
        novelTitle: novel.title,
        chapterTitle: chapter.title,
        chapterOrder: chapter.order,
        referenceText: text,
        existingScenes: existingScenes.length > 0 ? existingScenes : undefined,
        characterStates: characterStates.length > 0 ? characterStates : undefined,
      },
      options: {
        novelId,
        stage: "chapter_reference_draft",
        entrypoint: "drama_studio",
        temperature: 0.5,
      },
    });
    const segments = generated.output.segments;
    const draftText = serializeDraftSegments(segments);
    return { segments, draftText };
  }

  // AI 提取参考原文的设定建议（角色/场景/世界观）：纯预览不落库，
  // 前端「提取」页签展示给用户勾选，确认后才创建进设定中心。
  async previewReferenceExtraction(
    novelId: string,
    chapterId: string,
    referenceText: string,
  ): Promise<ReferenceExtractionPayload> {
    const [novel, chapter] = await Promise.all([
      prisma.novel.findUnique({ where: { id: novelId }, select: { id: true, title: true } }),
      prisma.chapter.findFirst({
        where: { id: chapterId, novelId },
        select: { id: true, title: true, order: true },
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

    const generated = await runStructuredPrompt({
      asset: chapterReferenceExtractPrompt,
      promptInput: {
        novelTitle: novel.title,
        chapterTitle: chapter.title,
        chapterOrder: chapter.order,
        referenceText: text,
      },
      options: {
        novelId,
        stage: "chapter_reference_extract",
        entrypoint: "drama_studio",
        temperature: 0.3,
      },
    });
    return generated.output;
  }
}

export const chapterReferenceDraftService = new ChapterReferenceDraftService();
