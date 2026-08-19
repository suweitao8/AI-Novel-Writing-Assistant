// 参考文本 → 本章初稿应用服务：把粘贴进「参考」页签的小说原文 AI 压缩成
// 逐行标注旁白/角色的初稿草稿（不落库）。用户确认后由前端写入 Chapter.expectation，
// 沿用初稿页签的自动保存链路；本服务只做纯预览，不触碰章节数据。
import { prisma } from "../../../../db/prisma";
import { AppError } from "../../../../middleware/errorHandler";
import { runStructuredPrompt } from "../../../../prompting/core/promptRunner";
import {
  chapterReferenceDraftPrompt,
} from "../../../../prompting/prompts/novel/chapterReferenceDraft.prompts";
import type { ChapterReferenceDraftPayload } from "@ai-novel/shared/types/novelChapterReferenceDraft";

const REFERENCE_TEXT_MIN_LENGTH = 50;
const REFERENCE_TEXT_MAX_LENGTH = 20000;

export class ChapterReferenceDraftService {
  // AI 压缩参考原文：返回结构化逐行结果与拼好的初稿文本，供前端预览确认。
  async previewReferenceDraft(
    novelId: string,
    chapterId: string,
    referenceText: string,
  ): Promise<ChapterReferenceDraftPayload> {
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
      asset: chapterReferenceDraftPrompt,
      promptInput: {
        novelTitle: novel.title,
        chapterTitle: chapter.title,
        chapterOrder: chapter.order,
        referenceText: text,
      },
      options: {
        novelId,
        stage: "chapter_reference_draft",
        entrypoint: "drama_studio",
        temperature: 0.5,
      },
    });
    const segments = generated.output.segments;
    const draftText = segments.map((segment) => `${segment.speaker}：${segment.text}`).join("\n");
    return { segments, draftText };
  }
}

export const chapterReferenceDraftService = new ChapterReferenceDraftService();
