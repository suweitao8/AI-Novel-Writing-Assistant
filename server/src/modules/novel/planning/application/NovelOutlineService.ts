// 空白小说的大纲工作台应用服务：简略大纲读写、AI 分章细纲推理（草稿不落库）、确认细纲落库。
// 边界说明：
// - novel.outline 存用户手写简略大纲；userChapterOutlineJson 存确认后的分章细纲（剧情契约）。
// - 细纲推理输入=大纲 + 设定中心快照 + 小说基础信息；设定为空也可推理（AI 自由发挥）。
// - 确认细纲时同步 estimatedChapterCount，让导演链按用户的章数规模做全书规划。
import { prisma } from "../../../../db/prisma";
import { AppError } from "../../../../middleware/errorHandler";
import { runStructuredPrompt } from "../../../../prompting/core/promptRunner";
import {
  novelOutlineExpandPrompt,
  type OutlineExpandOutput,
} from "../../../../prompting/prompts/novel/outlineExpand.prompts";
import { storySettingsService } from "../../story-settings/application/StorySettingsService";
import type {
  NovelChapterOutlineItem,
  NovelOutlineExpandDraft,
  NovelOutlineState,
} from "@ai-novel/shared/types/novelOutline";

const CHAPTER_COUNT_MIN = 3;
const CHAPTER_COUNT_MAX = 400;

interface StoredChapterOutline {
  schemaVersion: number;
  premise: string;
  chapters: NovelChapterOutlineItem[];
  confirmedAt: string;
}

function parseStoredChapters(value: string | null): StoredChapterOutline | null {
  if (!value?.trim()) {
    return null;
  }
  try {
    const parsed = JSON.parse(value) as StoredChapterOutline;
    if (parsed.schemaVersion !== 1 || !Array.isArray(parsed.chapters)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

async function requireNovel(novelId: string) {
  const novel = await prisma.novel.findUnique({
    where: { id: novelId },
    include: { genre: true },
  });
  if (!novel) {
    throw new AppError("没有找到这本小说。", 404);
  }
  return novel;
}

async function loadActiveIdea(novelId: string): Promise<string> {
  const intentRow = await prisma.novelIntentVersion.findFirst({
    where: { novelId, status: "active" },
    orderBy: { version: "desc" },
  });
  return intentRow?.originalExpression?.trim() ?? "";
}

function normalizeChapterInput(raw: unknown): NovelChapterOutlineItem {
  const item = raw as Partial<NovelChapterOutlineItem>;
  const title = String(item.title ?? "").trim();
  const synopsis = String(item.synopsis ?? "").trim();
  if (!title || !synopsis) {
    throw new AppError("每一章都需要标题和梗概。", 400);
  }
  const toNameList = (value: unknown, limit: number): string[] =>
    Array.isArray(value)
      ? value
          .map((entry) => String(entry ?? "").trim())
          .filter(Boolean)
          .slice(0, limit)
      : [];
  return {
    order: 0,
    title: title.slice(0, 60),
    synopsis: synopsis.slice(0, 600),
    keyEvents: toNameList(item.keyEvents, 5),
    characterNames: toNameList(item.characterNames, 8),
    sceneNames: toNameList(item.sceneNames, 6),
  };
}

export class NovelOutlineService {
  async getOutlineState(novelId: string): Promise<NovelOutlineState> {
    const novel = await requireNovel(novelId);
    const stored = parseStoredChapters(novel.userChapterOutlineJson);
    return {
      novelId,
      outline: novel.outline ?? "",
      chapters: stored?.chapters ?? null,
      premise: stored?.premise ?? null,
      confirmedAt: stored?.confirmedAt ?? null,
    };
  }

  async saveOutline(novelId: string, outline: string): Promise<NovelOutlineState> {
    await requireNovel(novelId);
    const normalized = outline.trim().slice(0, 20000);
    await prisma.novel.update({
      where: { id: novelId },
      data: { outline: normalized || null },
    });
    return this.getOutlineState(novelId);
  }

  // 推理分章细纲草稿：不落库，返回给前端预览编辑，确认后另行保存。
  async expandOutline(
    novelId: string,
    options: { targetChapterCount?: number } = {},
  ): Promise<NovelOutlineExpandDraft> {
    const novel = await requireNovel(novelId);
    const [idea, settingsSnapshot] = await Promise.all([
      loadActiveIdea(novelId),
      storySettingsService.getPromptSnapshot(novelId),
    ]);
    const briefIdea = novel.description?.trim() || idea;
    const userOutline = novel.outline?.trim() || undefined;
    if (!userOutline && !briefIdea) {
      throw new AppError("请先写下简略大纲，或至少填写一句故事想法，AI 才能开始推理。", 400);
    }
    const targetChapterCount = Number.isFinite(options.targetChapterCount)
      ? Math.min(CHAPTER_COUNT_MAX, Math.max(CHAPTER_COUNT_MIN, Math.round(options.targetChapterCount as number)))
      : undefined;
    const generated = await runStructuredPrompt({
      asset: novelOutlineExpandPrompt,
      promptInput: {
        novelTitle: novel.title,
        briefIdea: briefIdea || undefined,
        userOutline,
        targetChapterCount,
        genreName: novel.genre?.name ?? undefined,
        settingsSnapshot: settingsSnapshot
          ? {
              characters: settingsSnapshot.characters.map((character) => `${character.name}（${character.role}）`),
              scenes: settingsSnapshot.scenes.map((scene) => scene.name),
              props: settingsSnapshot.props.map((prop) => prop.name),
              worldPremise: settingsSnapshot.world?.premise?.trim() || undefined,
            }
          : undefined,
      },
      options: {
        novelId,
        stage: "outline_expansion",
        entrypoint: "blank_start",
        temperature: 0.7,
      },
    });
    const output: OutlineExpandOutput = generated.output;
    return {
      premise: output.premise,
      suggestedChapterCount: output.suggestedChapterCount,
      chapters: output.chapters,
      notes: output.notes,
    };
  }

  // 确认保存分章细纲：按数组顺序重新编号，并同步 estimatedChapterCount 供导演链规划规模。
  async saveChapterOutline(
    novelId: string,
    input: { premise: string; chapters: unknown[] },
  ): Promise<NovelOutlineState> {
    await requireNovel(novelId);
    if (!Array.isArray(input.chapters) || input.chapters.length < CHAPTER_COUNT_MIN) {
      throw new AppError(`分章细纲至少需要 ${CHAPTER_COUNT_MIN} 章。`, 400);
    }
    if (input.chapters.length > CHAPTER_COUNT_MAX) {
      throw new AppError(`分章细纲最多支持 ${CHAPTER_COUNT_MAX} 章。`, 400);
    }
    const premise = input.premise.trim().slice(0, 600);
    if (!premise) {
      throw new AppError("请先确认全书梗概（premise）。", 400);
    }
    const chapters = input.chapters.map((raw, index) => ({
      ...normalizeChapterInput(raw),
      order: index + 1,
    }));
    const document: StoredChapterOutline = {
      schemaVersion: 1,
      premise,
      chapters,
      confirmedAt: new Date().toISOString(),
    };
    await prisma.novel.update({
      where: { id: novelId },
      data: {
        userChapterOutlineJson: JSON.stringify(document),
        estimatedChapterCount: chapters.length,
      },
    });
    return this.getOutlineState(novelId);
  }
}

export const novelOutlineService = new NovelOutlineService();
