import { createHash } from "node:crypto";
import { prisma } from "../../../db/prisma";
import { AppError } from "../../../middleware/errorHandler";
import { safeJsonParse } from "../utils/json";
import { ttsProviderRegistry } from "./TTSProviderPort";

export type DialogueAudioStatus = "idle" | "generating" | "done" | "error";
/** 台词行类型：有说话人=对白，无说话人=旁白（搬自 mydrama 的 narration/dialogue 语义） */
export type DialogueLineType = "dialogue" | "narration";

export interface DialogueAudioItem {
  lineIndex: number;
  type: DialogueLineType;
  speaker?: string;
  text: string;
  voiceId?: string;
  /** 生成时的文本指纹与音色指纹，用于判断已有音频是否过期（参考 mydrama 的 sha 过期判定） */
  textHash?: string;
  voiceKey?: string;
  audioUrl: string;
  durationSec?: number;
  provider: string;
}

export interface DialogueAudioData {
  status: DialogueAudioStatus;
  provider?: string;
  items?: DialogueAudioItem[];
  generatedAt?: string;
  error?: string;
}

interface DialogueLine {
  lineIndex: number;
  type: DialogueLineType;
  speaker?: string;
  text: string;
}

export interface CharacterVoice {
  name: string;
  voiceId?: string;
  emotion?: string;
  speed?: number;
  /** 角色音色描述（voiceProfile.voicePrompt），无显式 emotion 时作为语气提示传入 */
  voicePrompt?: string;
}

export interface NarratorVoiceData {
  description?: string;
  sampleAudioUrl?: string;
  updatedAt?: string;
}

const DEFAULT_TTS_PROVIDER = "mock";

export function parseDialogueLines(raw: string | null | undefined): DialogueLine[] {
  return (raw ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const match = /^([^:：]{1,32})[:：]\s*(.+)$/.exec(line);
      if (!match) {
        return { lineIndex: index, type: "narration" as DialogueLineType, text: line };
      }
      return {
        lineIndex: index,
        type: "dialogue" as DialogueLineType,
        speaker: match[1]?.trim(),
        text: match[2]?.trim() || line,
      };
    })
    .filter((line) => line.text.length > 0);
}

export function hashDialogueText(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 16);
}

/** 音色指纹：voiceId/情绪/语速或旁白描述变化即视为音色变化，需要重新合成 */
export function buildDialogueVoiceKey(input: {
  type: DialogueLineType;
  voice?: CharacterVoice;
  narratorDescription?: string;
}): string {
  if (input.type === "narration") {
    return `narrator|${(input.narratorDescription ?? "").trim()}`;
  }
  const voice = input.voice;
  return [
    voice?.voiceId ?? "",
    voice?.emotion ?? voice?.voicePrompt ?? "",
    voice?.speed ?? "",
  ].join("|");
}

function normalizeKey(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed.toLowerCase() : null;
}

export function readCharacterVoice(character: {
  name: string;
  voiceProfile?: string | null;
}): CharacterVoice {
  const raw = character.voiceProfile;
  if (!raw?.trim()) {
    return { name: character.name };
  }
  const parsed = safeJsonParse<Record<string, unknown> | null>(raw, null);
  if (parsed && typeof parsed === "object") {
    const voiceId = [parsed.voiceId, parsed.voice, parsed.id]
      .find((value) => typeof value === "string" && value.trim());
    const emotion = typeof parsed.emotion === "string" ? parsed.emotion.trim() : undefined;
    const voicePrompt = typeof parsed.voicePrompt === "string" ? parsed.voicePrompt.trim() : undefined;
    const speed = Number(parsed.speed);
    return {
      name: character.name,
      voiceId: typeof voiceId === "string" ? voiceId.trim() : undefined,
      emotion: emotion || undefined,
      voicePrompt: voicePrompt || undefined,
      speed: Number.isFinite(speed) && speed > 0 ? speed : undefined,
    };
  }
  return { name: character.name };
}

export function buildVoiceMap(characters: Array<{ name: string; voiceProfile?: string | null }>): Map<string, CharacterVoice> {
  const map = new Map<string, CharacterVoice>();
  for (const character of characters) {
    const key = normalizeKey(character.name);
    if (key) {
      map.set(key, readCharacterVoice(character));
    }
  }
  return map;
}

export function readNarratorVoiceData(raw: string | null | undefined): NarratorVoiceData {
  const parsed = safeJsonParse<Record<string, unknown> | null>(raw, null);
  if (!parsed || typeof parsed !== "object") {
    return {};
  }
  return {
    description: typeof parsed.description === "string" ? parsed.description : undefined,
    sampleAudioUrl: typeof parsed.sampleAudioUrl === "string" ? parsed.sampleAudioUrl : undefined,
    updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : undefined,
  };
}

export class DramaDialogueAudioService {
  async synthesizeShotDialogue(
    shotId: string,
    provider = DEFAULT_TTS_PROVIDER,
    options: { force?: boolean } = {},
  ): Promise<DialogueAudioData> {
    const shot = await prisma.dramaShot.findUnique({
      where: { id: shotId },
      include: {
        storyboard: {
          include: {
            project: { include: { characters: true } },
          },
        },
      },
    });
    if (!shot) {
      throw new AppError(`未找到短剧镜头：${shotId}`, 404);
    }

    const lines = parseDialogueLines(shot.dialogue);
    if (!lines.length) {
      const idleData: DialogueAudioData = { status: "idle", provider, items: [] };
      await prisma.dramaShot.update({
        where: { id: shotId },
        data: { dialogueAudioData: JSON.stringify(idleData) },
      });
      return idleData;
    }

    const existing = safeJsonParse<DialogueAudioData | null>(shot.dialogueAudioData, null);
    const existingItems = new Map<number, DialogueAudioItem>();
    for (const item of existing?.items ?? []) {
      existingItems.set(item.lineIndex, item);
    }

    const adapter = ttsProviderRegistry.resolve(provider);
    const voiceMap = buildVoiceMap(shot.storyboard.project.characters);
    const narratorVoice = readNarratorVoiceData(shot.storyboard.project.narratorVoiceData);

    const pendingItems: DialogueAudioItem[] = [];
    const reusedItems: DialogueAudioItem[] = [];
    for (const line of lines) {
      const voice = line.speaker ? voiceMap.get(normalizeKey(line.speaker) ?? "") : undefined;
      const textHash = hashDialogueText(line.text);
      const voiceKey = buildDialogueVoiceKey({
        type: line.type,
        voice,
        narratorDescription: narratorVoice.description,
      });
      const prev = existingItems.get(line.lineIndex);
      const reusable = !options.force
        && existing?.status === "done"
        && prev?.audioUrl?.startsWith("data:")
        && prev.textHash === textHash
        && prev.voiceKey === voiceKey;
      if (reusable && prev) {
        reusedItems.push(prev);
        continue;
      }
      pendingItems.push({
        lineIndex: line.lineIndex,
        type: line.type,
        speaker: line.speaker,
        text: line.text,
        voiceId: voice?.voiceId,
        textHash,
        voiceKey,
        audioUrl: "",
        provider,
      });
    }

    const generatingData: DialogueAudioData = {
      status: "generating",
      provider,
      items: [...reusedItems, ...pendingItems.map((item) => ({ ...item, audioUrl: "" }))],
    };
    await prisma.dramaShot.update({
      where: { id: shotId },
      data: { dialogueAudioData: JSON.stringify(generatingData) },
    });

    try {
      const synthesized: DialogueAudioItem[] = [];
      for (const item of pendingItems) {
        const voice = item.speaker ? voiceMap.get(normalizeKey(item.speaker) ?? "") : undefined;
        const result = await adapter.synthesize({
          text: item.text,
          voiceId: item.type === "dialogue" ? voice?.voiceId : undefined,
          speed: item.type === "dialogue" ? voice?.speed : undefined,
          emotion: item.type === "dialogue"
            ? (voice?.emotion || voice?.voicePrompt)
            : narratorVoice.description,
          speaker: item.type === "dialogue" ? item.speaker : "旁白",
        });
        synthesized.push({ ...item, audioUrl: result.audioUrl, durationSec: result.durationSec });
      }

      const doneData: DialogueAudioData = {
        status: "done",
        provider,
        items: [...reusedItems, ...synthesized].sort((a, b) => a.lineIndex - b.lineIndex),
        generatedAt: new Date().toISOString(),
      };
      await prisma.dramaShot.update({
        where: { id: shotId },
        data: { dialogueAudioData: JSON.stringify(doneData) },
      });
      return doneData;
    } catch (error) {
      const errorData: DialogueAudioData = {
        status: "error",
        provider,
        items: [...reusedItems],
        error: error instanceof Error ? error.message : String(error),
      };
      await prisma.dramaShot.update({
        where: { id: shotId },
        data: { dialogueAudioData: JSON.stringify(errorData) },
      });
      throw error;
    }
  }
}

export const dramaDialogueAudioService = new DramaDialogueAudioService();
