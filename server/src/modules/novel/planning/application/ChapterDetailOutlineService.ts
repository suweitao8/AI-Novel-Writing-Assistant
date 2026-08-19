// 单章细纲应用服务：把某章的大纲（Chapter.expectation）AI 推理成节拍草稿（不落库），
// 用户编辑确认后保存到 Chapter.detailOutlineJson。
// 边界说明：
// - 细纲是人工创作辅助，V1 不注入自动导演写作上下文（避免改导演链契约）。
// - 上下文取本章大纲 + 前后章梗概 + 设定中心快照；大纲为空直接 400，不浪费 AI 调用。
import { prisma } from "../../../../db/prisma";
import { AppError } from "../../../../middleware/errorHandler";
import { runStructuredPrompt } from "../../../../prompting/core/promptRunner";
import {
  chapterDetailOutlinePrompt,
  type ChapterDetailOutlineOutput,
} from "../../../../prompting/prompts/novel/chapterDetailOutline.prompts";
import { storySettingsService } from "../../story-settings/application/StorySettingsService";
import type { ChapterDetailOutlineBeat, ChapterDetailOutlinePayload } from "@ai-novel/shared/types/novelChapterDetailOutline";

const BEAT_COUNT_MIN = 3;
const BEAT_COUNT_MAX = 10;

interface StoredDetailOutline {
  schemaVersion: number;
  beats: ChapterDetailOutlineBeat[];
  notes: string | null;
  generatedAt: string;
  savedAt: string;
}

function parseStoredDetailOutline(value: string | null): StoredDetailOutline | null {
  if (!value?.trim()) {
    return null;
  }
  try {
    const parsed = JSON.parse(value) as StoredDetailOutline;
    if (parsed.schemaVersion !== 1 || !Array.isArray(parsed.beats)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function toStoredDetailOutline(payload: ChapterDetailOutlinePayload, generatedAt: string): StoredDetailOutline {
  return {
    schemaVersion: 1,
    beats: payload.beats,
    notes: payload.notes,
    generatedAt,
    savedAt: new Date().toISOString(),
  };
}

async function requireChapter(novelId: string, chapterId: string) {
  const chapter = await prisma.chapter.findFirst({
    where: { id: chapterId, novelId },
    select: { id: true, title: true, order: true, expectation: true, detailOutlineJson: true },
  });
  if (!chapter) {
    throw new AppError("没有找到这一章。", 404);
  }
  return chapter;
}

function normalizeBeats(raw: unknown): ChapterDetailOutlineBeat[] {
  if (!Array.isArray(raw)) {
    throw new AppError("细纲节拍必须是数组。", 400);
  }
  const length = raw.length;
  if (length < BEAT_COUNT_MIN || length > BEAT_COUNT_MAX) {
    throw new AppError(`细纲节拍需要 ${BEAT_COUNT_MIN}～${BEAT_COUNT_MAX} 拍。`, 400);
  }
  const seen = new Set<string>();
  return raw.map((item) => {
    const beat = item as Partial<ChapterDetailOutlineBeat>;
    const summary = String(beat.summary ?? "").trim().slice(0, 200);
    const keyEvent = String(beat.keyEvent ?? "").trim().slice(0, 120);
    if (summary.length < 4) {
      throw new AppError("每个节拍都要写清楚这一拍发生了什么。", 400);
    }
    if (seen.has(summary)) {
      throw new AppError("细纲节拍不能重复。", 400);
    }
    seen.add(summary);
    return { summary, keyEvent: keyEvent || null };
  });
}

export class ChapterDetailOutlineService {
  // 读取某章已保存的细纲（没有返回 null），供详情弹窗初始化。
  async getDetailOutline(novelId: string, chapterId: string): Promise<StoredDetailOutline | null> {
    const chapter = await requireChapter(novelId, chapterId);
    return parseStoredDetailOutline(chapter.detailOutlineJson);
  }

  // AI 推理单章细纲草稿：不落库，返回给前端预览编辑。
  async previewDetailOutline(
    novelId: string,
    chapterId: string,
    options: { novelId?: string; taskId?: string } = {},
  ): Promise<ChapterDetailOutlineOutput> {
    const [novel, chapter] = await Promise.all([
      prisma.novel.findUnique({ where: { id: novelId }, select: { id: true, title: true } }),
      requireChapter(novelId, chapterId),
    ]);
    if (!novel) {
      throw new AppError("没有找到这本小说。", 404);
    }
    const chapterSynopsis = (chapter.expectation ?? "").trim();
    if (!chapterSynopsis) {
      throw new AppError("先写本章大纲，AI 才能推理细纲。", 400);
    }

    const [neighborChapters, settingsSnapshot] = await Promise.all([
      prisma.chapter.findMany({
        where: { novelId },
        orderBy: { order: "asc" },
        select: { order: true, title: true, expectation: true },
      }),
      storySettingsService.getPromptSnapshot(novelId).catch(() => null),
    ]);
    const previousChapterSummary = neighborChapters
      .filter((item) => item.order === chapter.order - 1)
      .map((item) => `${item.title}：${(item.expectation ?? "").trim().slice(0, 120)}`)
      .join("；") || undefined;
    const nextChapterSummary = neighborChapters
      .filter((item) => item.order === chapter.order + 1)
      .map((item) => `${item.title}：${(item.expectation ?? "").trim().slice(0, 120)}`)
      .join("；") || undefined;

    const generated = await runStructuredPrompt({
      asset: chapterDetailOutlinePrompt,
      promptInput: {
        novelTitle: novel.title,
        chapterTitle: chapter.title,
        chapterOrder: chapter.order,
        chapterSynopsis: chapterSynopsis.slice(0, 2000),
        previousChapterSummary,
        nextChapterSummary,
        settingsSnapshot: settingsSnapshot
          ? {
              characters: settingsSnapshot.characters.map((character) => `${character.name}（${character.role}）`),
              scenes: settingsSnapshot.scenes.map((scene) => scene.name),
              worldPremise: settingsSnapshot.world?.premise?.trim() || undefined,
            }
          : undefined,
      },
      options: {
        novelId,
        taskId: options.taskId,
        stage: "chapter_detail_outline",
        entrypoint: "drama_studio",
        temperature: 0.7,
      },
    });
    return generated.output;
  }

  // 保存用户编辑后的细纲：zod 服务层校验（节数/去重），落 Chapter.detailOutlineJson。
  async saveDetailOutline(
    novelId: string,
    chapterId: string,
    input: { beats: unknown; notes?: unknown },
  ): Promise<StoredDetailOutline> {
    await requireChapter(novelId, chapterId);
    const beats = normalizeBeats(input.beats);
    const notes = String(input.notes ?? "").trim().slice(0, 300) || null;
    const stored = toStoredDetailOutline({ beats, notes }, new Date().toISOString());
    await prisma.chapter.update({
      where: { id: chapterId },
      data: { detailOutlineJson: JSON.stringify(stored) },
    });
    return stored;
  }
}

export const chapterDetailOutlineService = new ChapterDetailOutlineService();
