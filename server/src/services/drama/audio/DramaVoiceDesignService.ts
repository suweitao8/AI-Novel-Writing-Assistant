import { prisma } from "../../../db/prisma";
import { AppError } from "../../../middleware/errorHandler";
import { synthesizeAudioSpeech } from "../../audio/speechProvider";
import { VOICE_PREVIEW_SAMPLE_TEXT } from "../../audio/voicePreviewSample";
import { globalNarratorVoiceSettingsService } from "../../settings/GlobalNarratorVoiceSettingsService";
import { readCharacterVoice } from "./DramaDialogueAudioService";

/** 兼容现有调用方；实际文本由 audio/voicePreviewSample 统一维护。 */
export const DRAMA_VOICE_SAMPLE_TEXT = VOICE_PREVIEW_SAMPLE_TEXT;

export interface CharacterVoiceDesignResult {
  characterId: string;
  prompt: string;
  sampleAudioUrl: string;
}

export interface NarratorVoiceState {
  description: string;
  sampleAudioUrl?: string;
  updatedAt?: string;
}

function toNarratorVoiceState(data: {
  description?: string;
  sampleAudioUrl?: string;
  updatedAt?: string;
}): NarratorVoiceState {
  return {
    description: data.description ?? "",
    sampleAudioUrl: data.sampleAudioUrl,
    updatedAt: data.updatedAt,
  };
}

/**
 * 音色设计（搬自 mydrama 的 voice design 模式）：
 * 用文字描述（年龄/性别/语气/节奏）作为情绪控制提示，让本机语音服务
 * 用固定样句合成一段参考音频；角色与项目旁白共用同一套描述→试听流程。
 */
export class DramaVoiceDesignService {
  async designCharacterVoice(characterId: string, prompt: string): Promise<CharacterVoiceDesignResult> {
    const character = await prisma.dramaCharacter.findUnique({ where: { id: characterId } });
    if (!character) {
      throw new AppError(`未找到角色：${characterId}`, 404);
    }
    const trimmedPrompt = prompt.trim();
    if (trimmedPrompt.length < 4) {
      throw new AppError("音色描述太短了：写清年龄、性别、语气或节奏（例如「青年男声，低沉平静，说话慢」）。", 400);
    }
    const result = await synthesizeAudioSpeech({
      text: DRAMA_VOICE_SAMPLE_TEXT,
      audioType: "dialogue",
      speaker: character.name,
      emotion: trimmedPrompt,
    });
    const voice = readCharacterVoice(character);
    const mergedProfile = {
      ...voice,
      name: character.name,
      voicePrompt: trimmedPrompt,
      sampleAudioUrl: result.dataUrl,
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

  async updateNarratorVoiceDescription(projectId: string, description: string): Promise<NarratorVoiceState> {
    const project = await prisma.dramaProject.findUnique({ where: { id: projectId } });
    if (!project) {
      throw new AppError(`未找到项目：${projectId}`, 404);
    }
    return toNarratorVoiceState(await globalNarratorVoiceSettingsService.updateDescription(description));
  }

  async designNarratorVoice(projectId: string, description: string): Promise<NarratorVoiceState> {
    const project = await prisma.dramaProject.findUnique({ where: { id: projectId } });
    if (!project) {
      throw new AppError(`未找到项目：${projectId}`, 404);
    }
    return toNarratorVoiceState(await globalNarratorVoiceSettingsService.design(description));
  }
}

export const dramaVoiceDesignService = new DramaVoiceDesignService();
