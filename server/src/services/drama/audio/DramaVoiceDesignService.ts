import { prisma } from "../../../db/prisma";
import { AppError } from "../../../middleware/errorHandler";
import { synthesizeAudioSpeech } from "../../audio/speechProvider";
import { persistIndexTTS25ReferenceAudio } from "../../audio/indexTTS25";
import { VOICE_PREVIEW_SAMPLE_TEXT } from "../../audio/voicePreviewSample";
import { globalNarratorVoiceSettingsService } from "../../settings/GlobalNarratorVoiceSettingsService";
import { readCharacterVoice } from "./DramaDialogueAudioService";

/** 兼容现有调用方；实际文本由 audio/voicePreviewSample 统一维护。 */
export const DRAMA_VOICE_SAMPLE_TEXT = VOICE_PREVIEW_SAMPLE_TEXT;

export interface CharacterVoiceDesignResult {
  characterId: string;
  prompt: string;
  sampleAudioUrl: string;
  referenceAudioUrl: string;
  indexTTS25Speaker?: string;
}

export interface CharacterVoiceSourceState {
  characterId: string;
  referenceAudioUrl?: string;
  indexTTS25Speaker?: string;
}

export interface NarratorVoiceState {
  description: string;
  sampleAudioUrl?: string;
  referenceAudioUrl?: string;
  indexTTS25Speaker?: string;
  updatedAt?: string;
}

function toNarratorVoiceState(data: {
  description?: string;
  sampleAudioUrl?: string;
  referenceAudioUrl?: string;
  indexTTS25Speaker?: string;
  updatedAt?: string;
}): NarratorVoiceState {
  return {
    description: data.description ?? "",
    sampleAudioUrl: data.sampleAudioUrl,
    referenceAudioUrl: data.referenceAudioUrl,
    indexTTS25Speaker: data.indexTTS25Speaker,
    updatedAt: data.updatedAt,
  };
}

/**
 * 音色设计（搬自 mydrama 的 voice design 模式）：
 * 用文字描述（年龄/性别/语气/节奏）作为情绪控制提示，让本机语音服务
 * 用固定样句合成一段参考音频；角色与项目旁白共用同一套描述→试听流程。
 */
export class DramaVoiceDesignService {
  async designCharacterVoice(
    characterId: string,
    prompt: string,
    options: { referenceAudioUrl?: string | null; indexTTS25Speaker?: string } = {},
  ): Promise<CharacterVoiceDesignResult> {
    const character = await prisma.dramaCharacter.findUnique({ where: { id: characterId } });
    if (!character) {
      throw new AppError(`未找到角色：${characterId}`, 404);
    }
    const trimmedPrompt = prompt.trim();
    if (trimmedPrompt.length < 4) {
      throw new AppError("音色描述太短了：写清年龄、性别、语气或节奏（例如「青年男声，低沉平静，说话慢」）。", 400);
    }
    const existingVoice = readCharacterVoice(character);
    const hasReferenceOverride = options.referenceAudioUrl !== undefined;
    const referenceCandidate = hasReferenceOverride
      ? options.referenceAudioUrl?.trim() || undefined
      : existingVoice.referenceAudioUrl;
    const referenceAudioUrl = referenceCandidate
      ? await persistIndexTTS25ReferenceAudio(referenceCandidate)
      : undefined;
    const indexTTS25Speaker = options.indexTTS25Speaker?.trim() || existingVoice.indexTTS25Speaker;
    const result = await synthesizeAudioSpeech({
      text: DRAMA_VOICE_SAMPLE_TEXT,
      audioType: "dialogue",
      speaker: character.name,
      emotion: trimmedPrompt,
      indexTTS25Speaker,
      referenceAudioUrl,
    });
    const persistedReferenceAudioUrl = referenceAudioUrl
      ?? await persistIndexTTS25ReferenceAudio(result.dataUrl);
    const mergedProfile = {
      ...existingVoice,
      name: character.name,
      voicePrompt: trimmedPrompt,
      sampleAudioUrl: result.dataUrl,
      referenceAudioUrl: persistedReferenceAudioUrl,
      ...(indexTTS25Speaker ? { indexTTS25Speaker } : {}),
      sampleUpdatedAt: new Date().toISOString(),
    };
    await prisma.dramaCharacter.update({
      where: { id: characterId },
      data: { voiceProfile: JSON.stringify(mergedProfile) },
    });
    return {
      characterId,
      prompt: trimmedPrompt,
      sampleAudioUrl: result.dataUrl,
      referenceAudioUrl: persistedReferenceAudioUrl,
      ...(indexTTS25Speaker ? { indexTTS25Speaker } : {}),
    };
  }

  async updateCharacterVoiceSource(
    characterId: string,
    options: { referenceAudioUrl?: string | null; indexTTS25Speaker?: string } = {},
  ): Promise<CharacterVoiceSourceState> {
    const character = await prisma.dramaCharacter.findUnique({ where: { id: characterId } });
    if (!character) {
      throw new AppError(`未找到角色：${characterId}`, 404);
    }
    const existingVoice = readCharacterVoice(character);
    const hasReferenceOverride = options.referenceAudioUrl !== undefined;
    const suppliedReference = options.referenceAudioUrl?.trim() || undefined;
    const referenceAudioUrl = suppliedReference
      ? await persistIndexTTS25ReferenceAudio(suppliedReference)
      : hasReferenceOverride ? undefined : existingVoice.referenceAudioUrl;
    const indexTTS25Speaker = options.indexTTS25Speaker?.trim() || existingVoice.indexTTS25Speaker;
    const nextProfile: Record<string, unknown> = {
      ...existingVoice,
      name: character.name,
      ...(referenceAudioUrl ? { referenceAudioUrl } : {}),
      ...(indexTTS25Speaker ? { indexTTS25Speaker } : {}),
    };
    if (!referenceAudioUrl) delete nextProfile.referenceAudioUrl;
    if (!indexTTS25Speaker) delete nextProfile.indexTTS25Speaker;
    await prisma.dramaCharacter.update({
      where: { id: characterId },
      data: { voiceProfile: JSON.stringify(nextProfile) },
    });
    return {
      characterId,
      ...(referenceAudioUrl ? { referenceAudioUrl } : {}),
      ...(indexTTS25Speaker ? { indexTTS25Speaker } : {}),
    };
  }

  async getNarratorVoice(projectId: string): Promise<NarratorVoiceState> {
    const project = await prisma.dramaProject.findUnique({ where: { id: projectId } });
    if (!project) {
      throw new AppError(`未找到项目：${projectId}`, 404);
    }
    const data = await globalNarratorVoiceSettingsService.get();
    return toNarratorVoiceState(data);
  }

  async updateNarratorVoiceDescription(
    projectId: string,
    description: string,
    options: { referenceAudioUrl?: string | null; indexTTS25Speaker?: string } = {},
  ): Promise<NarratorVoiceState> {
    const project = await prisma.dramaProject.findUnique({ where: { id: projectId } });
    if (!project) {
      throw new AppError(`未找到项目：${projectId}`, 404);
    }
    return toNarratorVoiceState(await globalNarratorVoiceSettingsService.updateDescription(description, options));
  }

  async designNarratorVoice(
    projectId: string,
    description: string,
    options: { referenceAudioUrl?: string | null; indexTTS25Speaker?: string } = {},
  ): Promise<NarratorVoiceState> {
    const project = await prisma.dramaProject.findUnique({ where: { id: projectId } });
    if (!project) {
      throw new AppError(`未找到项目：${projectId}`, 404);
    }
    return toNarratorVoiceState(await globalNarratorVoiceSettingsService.design(description, options));
  }
}

export const dramaVoiceDesignService = new DramaVoiceDesignService();
