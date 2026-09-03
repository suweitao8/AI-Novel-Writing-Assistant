/**
 * 小说内容源适配器（novel_import）——共享层版本
 *
 * drama 与 comic 共用此适配器。唯一通过 prisma 只读访问 novel 相关表，
 * 不 import 任何 services/novel/* 业务逻辑（由 CI 守卫强制）。
 *
 * loadChapterText：按章节区间取原文，供 comic 分格脚本提取对白。
 */
import { prisma } from "../../../db/prisma";
import type { SourceContentPort } from "./SourceContentPort";
import {
  normalizeStoryCharacterStates,
  parseStoryAssetStatesJson,
} from "@ai-novel/shared/types/novelReferenceExtraction";
import type {
  SourceBundle,
  SourceBeat,
  SourceCharacter,
  SourceFact,
  SourceFactCategory,
  SourceRef,
} from "../contracts/sourceBundle";

function truncate(text: string, max = 200): string {
  const trimmed = text.replace(/\s+/g, " ").trim();
  return trimmed.length > max ? `${trimmed.slice(0, max)}…` : trimmed;
}

function normalizeFactCategory(raw: string): SourceFactCategory {
  if (raw === "revealed" || raw === "state_changed") return raw;
  return "completed";
}

export class NovelSourceAdapter implements SourceContentPort {
  readonly sourceType = "novel_import" as const;

  async loadBundle(ref: SourceRef): Promise<SourceBundle> {
    const novelId = ref.ref?.trim();
    if (!novelId) {
      throw new Error("novel_import 内容源缺少 novelId（ref.ref）。");
    }

    const novel = await prisma.novel.findUnique({
      where: { id: novelId },
      select: { id: true, title: true, description: true },
    });
    if (!novel) {
      throw new Error(`未找到源小说：${novelId}`);
    }

    const [chapters, characters, factRows] = await Promise.all([
      prisma.chapter.findMany({
        where: { novelId },
        orderBy: { order: "asc" },
        select: { order: true, title: true, expectation: true, content: true },
      }),
      prisma.character.findMany({
        where: { novelId },
        select: {
          id: true,
          name: true,
          gender: true,
          actorKind: true,
          bodyBuild: true,
          ageGroup: true,
          facePrompt: true,
          voiceTexture: true,
          role: true,
          personality: true,
          background: true,
          appearance: true,
          physique: true,
          attireStyle: true,
          signatureDetail: true,
          statesJson: true,
        },
      }),
      prisma.novelFactEntry.findMany({
        where: { novelId },
        orderBy: { chapterOrder: "asc" },
        select: { text: true, category: true },
      }),
    ]);

    const beats: SourceBeat[] = chapters.map((chapter) => {
      const summary =
        (chapter.expectation ?? "").trim() || truncate(chapter.content ?? "") || chapter.title;
      return {
        order: chapter.order,
        summary: `${chapter.title}：${summary}`,
        sourceChapterStart: chapter.order,
        sourceChapterEnd: chapter.order,
      };
    });

    const normalizeAgeGroup = (value: string | null | undefined): SourceCharacter["ageGroup"] => {
      if (value === "child" || value === "youth" || value === "middle" || value === "elder") {
        return value;
      }
      return undefined;
    };
    const bundleCharacters: SourceCharacter[] = characters.map((character) => {
      const states = normalizeStoryCharacterStates(
        parseStoryAssetStatesJson(character.statesJson).states,
        character,
      );
      const initialState = states[0];
      const stateImagePrompt = initialState?.imagePrompt?.trim() || initialState?.description?.trim();
      const stateVoicePrompt = initialState?.voicePrompt?.trim() || initialState?.voice?.prompt?.trim();
      return {
        name: character.name,
        gender: character.gender as "male" | "female" | "other" | "unknown" | undefined,
        actorKind: character.actorKind as "human" | "monster" | "other" | "unknown" | undefined,
        bodyBuild: character.bodyBuild as "slender" | "standard" | "broad" | "unknown" | undefined,
        ageGroup: normalizeAgeGroup(initialState?.ageGroup),
        persona: [character.role, character.personality].filter(Boolean).join("｜") || undefined,
        relations: character.background ?? undefined,
        // 漫剧改编的角色视觉与音色都以设定中心初始状态为源；旧字段已由归一化函数折入初始状态。
        visualHint: [stateImagePrompt, character.signatureDetail].filter(Boolean).join("，") || undefined,
        facePrompt: stateImagePrompt || undefined,
        voicePrompt: stateVoicePrompt || character.voiceTexture?.trim() || undefined,
        sourceCharacterRef: character.id,
      };
    });

    const hardFacts: SourceFact[] = factRows.map((row) => ({
      text: row.text,
      category: normalizeFactCategory(row.category),
    }));

    return {
      synopsis: (novel.description ?? "").trim() || novel.title,
      beats,
      characters: bundleCharacters,
      hardFacts,
    };
  }

  async loadChapterText(ref: SourceRef, start: number, end: number): Promise<string> {
    const novelId = ref.ref?.trim();
    if (!novelId) return "";

    const chapters = await prisma.chapter.findMany({
      where: { novelId, order: { gte: start, lte: end } },
      orderBy: { order: "asc" },
      select: { order: true, title: true, content: true },
    });

    return chapters
      .map((ch) => `【第${ch.order}章 ${ch.title}】\n${ch.content ?? ""}`)
      .join("\n\n");
  }
}

export const novelSourceAdapter = new NovelSourceAdapter();
