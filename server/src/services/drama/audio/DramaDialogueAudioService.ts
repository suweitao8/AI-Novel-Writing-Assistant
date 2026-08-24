import { createHash } from "node:crypto";
import type { StoryAssetState } from "@ai-novel/shared/types/novelReferenceExtraction";
import { resolveStoryAssetStateAncestors } from "@ai-novel/shared/types/novelReferenceExtraction";
import { prisma } from "../../../db/prisma";
import { getAudioModelProvider } from "../../../llm/modelCategories";
import { AppError } from "../../../middleware/errorHandler";
import { safeJsonParse } from "../utils/json";
import { loadNovelCharacterStatesByName } from "../DramaContextAssembler";
import { globalNarratorVoiceSettingsService, hashNarratorSample } from "../../settings/GlobalNarratorVoiceSettingsService";
import { isRealTTSProvider, ttsProviderRegistry, type TTSGenerationRequest } from "./TTSProviderPort";

export type DialogueAudioStatus = "idle" | "generating" | "done" | "error";
/** 台词行类型：旁白标记或无说话人=旁白，其余有说话人=对白（搬自 mydrama 的 narration/dialogue 语义） */
export type DialogueLineType = "dialogue" | "narration";

export interface DialogueAudioItem {
  lineIndex: number;
  type: DialogueLineType;
  speaker?: string;
  text: string;
  /** 台词行自带的语气（「角色（语气）：台词」约定），配音时优先于角色默认情绪 */
  emotion?: string;
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
  /** 「角色（语气）：台词」行里的语气，供 TTS emotion_prompt 使用 */
  emotion?: string;
}

export interface CharacterVoice {
  name: string;
  voiceId?: string;
  /** IndexTTS 2.5 的已训练 speaker 名称。 */
  indexTTS25Speaker?: string;
  emotion?: string;
  speed?: number;
  /** 角色音色描述（voiceProfile.voicePrompt），无显式 emotion 时作为语气提示传入 */
  voicePrompt?: string;
  /** 角色当前剧情状态已生成的试听，用作 IndexTTS 2.5 的参考音频。 */
  referenceAudioUrl?: string;
}

export interface NarratorVoiceData {
  description?: string;
  sampleAudioUrl?: string;
  referenceAudioUrl?: string;
  indexTTS25Speaker?: string;
  updatedAt?: string;
}

/**
 * 把分镜行统一转换为 TTS 请求。
 * 旁白使用 narration 语义并只携带旁白参考音频；角色对白使用 dialogue 语义和角色名。
 * 这层不能交给 provider 猜测，否则旁白会被错误包装成角色对白。
 */
export function buildDialogueTTSRequest(
  item: Pick<DialogueAudioItem, "type" | "speaker" | "text" | "emotion">,
  voice: CharacterVoice | undefined,
  narratorVoice: NarratorVoiceData,
): TTSGenerationRequest {
  const isNarrationLine = item.type === "narration" || item.speaker === "旁白";
  return {
    text: item.text,
    audioType: isNarrationLine ? "narration" : "dialogue",
    voiceId: isNarrationLine ? undefined : voice?.voiceId,
    indexTTS25Speaker: isNarrationLine ? narratorVoice.indexTTS25Speaker : voice?.indexTTS25Speaker,
    speed: isNarrationLine ? undefined : voice?.speed,
    emotion: isNarrationLine
      ? narratorVoice.description
      : (item.emotion || voice?.emotion || voice?.voicePrompt),
    speaker: isNarrationLine ? undefined : item.speaker,
    referenceAudioUrl: isNarrationLine
      ? (narratorVoice.referenceAudioUrl ?? narratorVoice.sampleAudioUrl)
      : voice?.referenceAudioUrl,
  };
}

const DEFAULT_TTS_PROVIDER = getAudioModelProvider();
/** 旁白曾被错误包装成 dialogue；升级版本后旧音频必须重新生成。 */
export const NARRATION_AUDIO_SEMANTICS_VERSION = "narration-v2";

// 对白行约定：「角色名（语气）：台词」——语气会作为该行的配音情绪提示（IndexTTS 2.5 的
// emotion_prompt），角色名保持干净便于匹配角色音色；没有（语气）时回落角色默认情绪。
const SPEAKER_EMOTION_PATTERN = /^([^（(]{1,24})[（(]([^）)]{1,24})[)）]/;

export function parseDialogueLines(raw: string | null | undefined): DialogueLine[] {
  return (raw ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const match = /^([^:：]{1,48})[:：]\s*(.+)$/.exec(line);
      if (!match) {
        return { lineIndex: index, type: "narration" as DialogueLineType, text: line };
      }
      const rawSpeaker = (match[1] ?? "").trim();
      let speaker = rawSpeaker;
      let emotion: string | undefined;
      const emotionMatch = SPEAKER_EMOTION_PATTERN.exec(speaker);
      if (emotionMatch) {
        speaker = (emotionMatch[1] ?? "").trim();
        emotion = (emotionMatch[2] ?? "").trim() || undefined;
      }
      const text = match[2]?.trim() || line;
      if (speaker === "旁白") {
        // 兼容旧格式「旁白（语气）：内容」，旁白不携带行内语气，也不作为对白展示。
        return {
          lineIndex: index,
          type: "narration" as DialogueLineType,
          speaker: "旁白",
          text,
        };
      }
      return {
        lineIndex: index,
        type: "dialogue" as DialogueLineType,
        speaker: speaker || rawSpeaker,
        text,
        emotion,
      };
    })
    .filter((line) => line.text.length > 0);
}

export function hashDialogueText(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 16);
}

/** 音色指纹：voiceId/行内语气/角色情绪/语速或旁白描述变化即视为音色变化，需要重新合成 */
export function buildDialogueVoiceKey(input: {
  type: DialogueLineType;
  voice?: CharacterVoice;
  narratorDescription?: string;
  narratorSampleAudioUrl?: string;
  narratorSampleSha256?: string;
  narratorReferenceAudioUrl?: string;
  narratorIndexTTS25Speaker?: string;
  lineEmotion?: string;
}): string {
  if (input.type === "narration") {
    const sampleFingerprint = input.narratorSampleSha256
      ?? (input.narratorSampleAudioUrl ? hashNarratorSample(input.narratorSampleAudioUrl) : "");
    return [
      "narrator",
      NARRATION_AUDIO_SEMANTICS_VERSION,
      (input.narratorDescription ?? "").trim(),
      sampleFingerprint,
      input.narratorReferenceAudioUrl ?? "",
      input.narratorIndexTTS25Speaker ?? "",
    ].join("|");
  }
  const voice = input.voice;
  return [
    voice?.voiceId ?? "",
    voice?.indexTTS25Speaker ?? "",
    input.lineEmotion ?? "",
    voice?.emotion ?? voice?.voicePrompt ?? "",
    voice?.speed ?? "",
    voice?.referenceAudioUrl ?? "",
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
    const indexTTS25Speaker = typeof parsed.indexTTS25Speaker === "string"
      ? parsed.indexTTS25Speaker.trim()
      : undefined;
    const emotion = typeof parsed.emotion === "string" ? parsed.emotion.trim() : undefined;
    const voicePrompt = typeof parsed.voicePrompt === "string" ? parsed.voicePrompt.trim() : undefined;
    const sampleAudioUrl = typeof parsed.sampleAudioUrl === "string" ? parsed.sampleAudioUrl.trim() : undefined;
    const referenceAudioUrl = typeof parsed.referenceAudioUrl === "string"
      ? parsed.referenceAudioUrl.trim()
      : sampleAudioUrl;
    const speed = Number(parsed.speed);
    return {
      name: character.name,
      voiceId: typeof voiceId === "string" ? voiceId.trim() : undefined,
      indexTTS25Speaker: indexTTS25Speaker || undefined,
      emotion: emotion || undefined,
      voicePrompt: voicePrompt || undefined,
      referenceAudioUrl: referenceAudioUrl || undefined,
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

/** 解析分镜 LLM 标注的每镜角色状态（[{name,state}] JSON）。 */
export function parseShotCharacterStates(raw: string | null | undefined): Map<string, string> {
  const parsed = safeJsonParse<Array<{ name?: unknown; state?: unknown }>>(raw, []);
  const map = new Map<string, string>();
  if (!Array.isArray(parsed)) {
    return map;
  }
  for (const entry of parsed) {
    const name = normalizeKey(entry?.name);
    const state = typeof entry?.state === "string" ? entry.state.trim() : "";
    if (name && state) {
      map.set(name, state);
    }
  }
  return map;
}

export function findNovelCharacterStates(
  statesByName: Map<string, StoryAssetState[]>,
  characterName: string,
): StoryAssetState[] | undefined {
  const direct = statesByName.get(characterName.trim());
  if (direct) {
    return direct;
  }
  const key = normalizeKey(characterName);
  if (!key) {
    return undefined;
  }
  for (const [name, states] of statesByName) {
    if (normalizeKey(name) === key) {
      return states;
    }
  }
  return undefined;
}

/** 把小说角色状态的音色覆盖到漫剧角色基础音色上。 */
export function resolveVoiceForCharacterState(
  voice: CharacterVoice | undefined,
  states: StoryAssetState[] | undefined,
  stateLabel: string | undefined,
  characterName?: string,
): CharacterVoice | undefined {
  if ((!voice && !characterName) || !stateLabel?.trim() || !states?.length) {
    return voice;
  }
  const stateKey = normalizeKey(stateLabel);
  const state = states.find((item) => normalizeKey(item.label) === stateKey);
  if (!state) {
    return voice;
  }
  const candidates = [state, ...resolveStoryAssetStateAncestors(states, state.id)];
  const stateVoice = candidates
    .find((candidate) => candidate.voice?.status === "done" && candidate.voice.sampleAudioUrl?.trim())
    ?.voice?.sampleAudioUrl?.trim();
  const statePrompt = candidates
    .map((candidate) => candidate.voice?.prompt?.trim() || candidate.voicePrompt?.trim())
    .find(Boolean);
  if (!stateVoice && !statePrompt) {
    return voice;
  }
  const baseVoice = voice ?? { name: characterName! };
  return {
    ...baseVoice,
    ...(statePrompt ? { emotion: statePrompt, voicePrompt: statePrompt } : {}),
    ...(stateVoice ? { referenceAudioUrl: stateVoice } : {}),
  };
}

export function readNarratorVoiceData(raw: string | null | undefined): NarratorVoiceData {
  const parsed = safeJsonParse<Record<string, unknown> | null>(raw, null);
  if (!parsed || typeof parsed !== "object") {
    return {};
  }
  return {
    description: typeof parsed.description === "string" ? parsed.description : undefined,
    sampleAudioUrl: typeof parsed.sampleAudioUrl === "string" ? parsed.sampleAudioUrl : undefined,
    referenceAudioUrl: typeof parsed.referenceAudioUrl === "string" ? parsed.referenceAudioUrl : undefined,
    indexTTS25Speaker: typeof parsed.indexTTS25Speaker === "string" ? parsed.indexTTS25Speaker : undefined,
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
    const narratorVoice = await globalNarratorVoiceSettingsService.get();
    const shotCharacterStates = parseShotCharacterStates(shot.characterStates);
    const novelStatesByName = shot.storyboard.project.source === "novel_import"
      && shot.storyboard.project.sourceRef?.trim()
      ? await loadNovelCharacterStatesByName(shot.storyboard.project.sourceRef.trim())
      : new Map<string, StoryAssetState[]>();
    const resolvedVoiceByLine = new Map<number, CharacterVoice | undefined>();

    const pendingItems: DialogueAudioItem[] = [];
    const reusedItems: DialogueAudioItem[] = [];
    for (const line of lines) {
      const baseVoice = line.speaker ? voiceMap.get(normalizeKey(line.speaker) ?? "") : undefined;
      const voice = line.speaker
        ? resolveVoiceForCharacterState(
          baseVoice,
          findNovelCharacterStates(novelStatesByName, line.speaker),
          shotCharacterStates.get(normalizeKey(line.speaker) ?? ""),
          line.speaker,
        )
        : undefined;
      resolvedVoiceByLine.set(line.lineIndex, voice);
      const textHash = hashDialogueText(line.text);
      const voiceKey = buildDialogueVoiceKey({
        type: line.type,
        voice,
        narratorDescription: narratorVoice.description,
        narratorSampleAudioUrl: narratorVoice.sampleAudioUrl,
        narratorSampleSha256: narratorVoice.sampleSha256,
        narratorReferenceAudioUrl: narratorVoice.referenceAudioUrl,
        narratorIndexTTS25Speaker: narratorVoice.indexTTS25Speaker,
        lineEmotion: line.emotion,
      });
      const prev = existingItems.get(line.lineIndex);
      const reusable = !options.force
        && isRealTTSProvider(provider)
        && existing?.status === "done"
        && existing?.provider === provider
        && prev?.audioUrl?.startsWith("data:")
        && prev.provider === provider
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
        emotion: line.emotion,
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
      // 先在派发前解析每行的音色/语气参数，避免并发 worker 内重复查表。
      const prepared = pendingItems.map((item) => {
        const voice = resolvedVoiceByLine.get(item.lineIndex);
        return {
          item,
          request: buildDialogueTTSRequest(item, voice, narratorVoice),
        };
      });
      // 有界并发（3 路）合成；任一行失败仍走原有整体失败语义，最终按 lineIndex 排序。
      const synthesized: DialogueAudioItem[] = [];
      let cursor = 0;
      let aborted = false;
      const worker = async (): Promise<void> => {
        while (!aborted && cursor < prepared.length) {
          const current = prepared[cursor++];
          try {
            const result = await adapter.synthesize(current.request);
            synthesized.push({ ...current.item, audioUrl: result.audioUrl, durationSec: result.durationSec });
          } catch (error) {
            aborted = true;
            throw error;
          }
        }
      };
      await Promise.all(Array.from({ length: Math.min(3, prepared.length) }, () => worker()));

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
