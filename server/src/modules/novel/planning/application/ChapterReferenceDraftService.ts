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
// 单元之间空行；场景变化时在单元上方多一行「【场景：地点】」换场标记——
// 后续分镜/视频生成按这一行知道从哪里起切换到哪个场景。
export function serializeDraftSegments(
  segments: Array<{ shot: string; storyboard: string; scene: string; speaker: string; kind: string; mood: string; text: string }>,
): string {
  let currentScene = "";
  return segments.map((segment) => {
    const sceneName = segment.scene.trim();
    const sceneLine = sceneName && sceneName !== currentScene ? `【场景：${sceneName}】\n` : "";
    if (sceneName) {
      currentScene = sceneName;
    }
    const mood = segment.kind === "dialogue" && segment.mood ? `（${segment.mood}）` : "";
    return `${sceneLine}分镜：${segment.shot}，${segment.storyboard}\n${segment.speaker}${mood}：${segment.text}`;
  }).join("\n\n");
}

export class ChapterReferenceDraftService {
  // AI 压缩参考原文：返回结构化逐行结果与拼好的初稿文本，供前端预览确认。
  async previewReferenceDraft(
    novelId: string,
    chapterId: string,
    referenceText: string,
  ): Promise<ChapterReferenceDraftPayload> {
    const [novel, chapter, sceneRows] = await Promise.all([
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
    const generated = await runStructuredPrompt({
      asset: chapterReferenceDraftPrompt,
      promptInput: {
        novelTitle: novel.title,
        chapterTitle: chapter.title,
        chapterOrder: chapter.order,
        referenceText: text,
        existingScenes: existingScenes.length > 0 ? existingScenes : undefined,
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
