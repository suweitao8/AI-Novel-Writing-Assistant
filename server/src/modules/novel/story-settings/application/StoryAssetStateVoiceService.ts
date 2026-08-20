import type {
  StoryAssetState,
  StoryAssetStateVoiceMode,
} from "@ai-novel/shared/types/novelReferenceExtraction";
import {
  getDefaultStoryAssetStateVoiceMode,
  normalizeStoryAssetStates,
} from "@ai-novel/shared/types/novelReferenceExtraction";
import { prisma } from "../../../../db/prisma";
import { AppError } from "../../../../middleware/errorHandler";
import {
  synthesizeAudioSpeech,
  type AudioSpeechResult,
} from "../../../../services/audio/speechProvider";
import {
  storySettingsService,
  type StorySettingsCharacter,
} from "./StorySettingsService";

/** 与 DramaVoiceDesignService 共用的固定试听短句。 */
export const STATE_VOICE_SAMPLE_TEXT = "这是当前音色的试听效果，一句话就能听出年龄、语气和节奏。";

export interface PreviousStateVoice {
  stateId: string;
  sampleAudioUrl: string;
}

export interface StateVoiceCharacterRow {
  id: string;
  novelId: string;
  name: string;
  voiceTexture: string | null;
  statesJson: string | null;
}

export interface StateVoiceGenerationInput {
  text: string;
  audioType: "dialogue";
  speaker: string;
  emotion: string;
}

interface StateVoiceServiceDependencies {
  findCharacter: (novelId: string, characterId: string) => Promise<StateVoiceCharacterRow | null>;
  updateStates: (characterId: string, statesJson: string | null) => Promise<void>;
  listCharacters: (novelId: string) => Promise<StorySettingsCharacter[]>;
  synthesize: (input: StateVoiceGenerationInput) => Promise<AudioSpeechResult>;
}

export function getDefaultStateVoiceMode(
  states: Array<{ id: string }>,
  stateId: string,
): StoryAssetStateVoiceMode {
  return getDefaultStoryAssetStateVoiceMode(states, stateId);
}

/** 只读取当前状态的直接上一状态，避免复用链形成隐式多跳。 */
export function resolvePreviousStateVoice(
  states: StoryAssetState[],
  stateId: string,
): PreviousStateVoice | null {
  const index = states.findIndex((state) => state.id === stateId);
  const previous = index > 0 ? states[index - 1] : undefined;
  const sampleAudioUrl = previous?.voice?.sampleAudioUrl?.trim();
  if (previous?.voice?.status !== "done" || !sampleAudioUrl) {
    return null;
  }
  return { stateId: previous.id, sampleAudioUrl };
}

export function buildStateVoiceSynthesisInput(
  character: { name: string; voiceTexture?: string | null },
  state: Pick<StoryAssetState, "voicePrompt" | "description">,
): StateVoiceGenerationInput {
  const emotion = state.voicePrompt?.trim() || character.voiceTexture?.trim() || "";
  return {
    text: STATE_VOICE_SAMPLE_TEXT,
    audioType: "dialogue",
    speaker: character.name,
    emotion,
  };
}

function parseStates(value: string | null | undefined): StoryAssetState[] {
  if (!value?.trim()) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? normalizeStoryAssetStates((parsed as StoryAssetState[]).filter((state) => (
        typeof state?.id === "string" && typeof state?.label === "string"
      )))
      : [];
  } catch {
    return [];
  }
}

function serializeStates(states: StoryAssetState[]): string | null {
  return states.length > 0 ? JSON.stringify(normalizeStoryAssetStates(states)) : null;
}

function nowIso(): string {
  return new Date().toISOString();
}

function buildVoiceErrorState(
  current: StoryAssetState | undefined,
  mode: StoryAssetStateVoiceMode,
  message: string,
): StoryAssetState["voice"] {
  return {
    ...(current?.voice ?? {}),
    status: "error",
    mode,
    error: message,
    generatedAt: nowIso(),
  };
}

export class StoryAssetStateVoiceService {
  private readonly dependencies: StateVoiceServiceDependencies;

  constructor(dependencies?: Partial<StateVoiceServiceDependencies>) {
    this.dependencies = {
      findCharacter: async (novelId, characterId) => prisma.character.findFirst({
        where: { id: characterId, novelId },
        select: { id: true, novelId: true, name: true, voiceTexture: true, statesJson: true },
      }),
      updateStates: async (characterId, statesJson) => {
        await prisma.character.update({ where: { id: characterId }, data: { statesJson } });
      },
      listCharacters: (novelId) => storySettingsService.listCharacters(novelId),
      synthesize: (input) => synthesizeAudioSpeech(input),
      ...dependencies,
    };
  }

  private async saveStates(characterId: string, states: StoryAssetState[]): Promise<void> {
    await this.dependencies.updateStates(characterId, serializeStates(states));
  }

  async generateStateVoice(
    novelId: string,
    characterId: string,
    stateId: string,
    requestedMode?: StoryAssetStateVoiceMode,
  ): Promise<StorySettingsCharacter> {
    const character = await this.dependencies.findCharacter(novelId, characterId);
    if (!character) {
      throw new AppError("没有找到这个角色。", 404);
    }

    const states = parseStates(character.statesJson);
    const state = states.find((item) => item.id === stateId);
    if (!state) {
      throw new AppError("未找到这个角色状态。", 404);
    }

    const defaultMode = state.voice?.mode ?? getDefaultStateVoiceMode(states, stateId);
    const mode = requestedMode ?? (
      defaultMode === "reuse_previous" && resolvePreviousStateVoice(states, stateId)
        ? "reuse_previous"
        : "generate_new"
    );
    if (mode === "reuse_previous") {
      const previous = resolvePreviousStateVoice(states, stateId);
      if (!previous) {
        const message = "上一状态还没有可复用的已生成音色，请先生成新的音色。";
        const failedStates = states.map((item) => item.id === stateId
          ? { ...item, voice: buildVoiceErrorState(item, mode, message) }
          : item);
        await this.saveStates(characterId, failedStates);
        throw new AppError(message, 400);
      }
      const reusedStates = states.map((item) => item.id === stateId
        ? {
          ...item,
          voice: {
            status: "done" as const,
            mode,
            sourceStateId: previous.stateId,
            sampleAudioUrl: previous.sampleAudioUrl,
            prompt: states.find((candidate) => candidate.id === previous.stateId)?.voice?.prompt,
            generatedAt: nowIso(),
          },
        }
        : item);
      await this.saveStates(characterId, reusedStates);
      return this.getUpdatedCharacter(novelId, characterId);
    }

    const synthesisInput = buildStateVoiceSynthesisInput(character, state);
    if (!synthesisInput.emotion) {
      const message = "请先填写角色基础音色或当前状态的音色提示词。";
      const failedStates = states.map((item) => item.id === stateId
        ? { ...item, voice: buildVoiceErrorState(item, mode, message) }
        : item);
      await this.saveStates(characterId, failedStates);
      throw new AppError(message, 400);
    }

    const generatingStates = states.map((item) => item.id === stateId
      ? {
        ...item,
        voice: {
          ...(item.voice ?? {}),
          status: "generating" as const,
          mode,
          sourceStateId: null,
          prompt: synthesisInput.emotion,
          error: undefined,
        },
      }
      : item);
    await this.saveStates(characterId, generatingStates);

    try {
      const result = await this.dependencies.synthesize(synthesisInput);
      const completedStates = generatingStates.map((item) => item.id === stateId
        ? {
          ...item,
          voice: {
            status: "done" as const,
            mode,
            sourceStateId: null,
            sampleAudioUrl: result.dataUrl,
            prompt: synthesisInput.emotion,
            generatedAt: nowIso(),
          },
        }
        : item);
      await this.saveStates(characterId, completedStates);
    } catch (error) {
      const message = error instanceof Error ? error.message : "音色生成失败。";
      const failedStates = generatingStates.map((item) => item.id === stateId
        ? { ...item, voice: buildVoiceErrorState(item, mode, message) }
        : item);
      await this.saveStates(characterId, failedStates);
      throw error;
    }

    return this.getUpdatedCharacter(novelId, characterId);
  }

  private async getUpdatedCharacter(novelId: string, characterId: string): Promise<StorySettingsCharacter> {
    const characters = await this.dependencies.listCharacters(novelId);
    const character = characters.find((item) => item.id === characterId);
    if (!character) {
      throw new AppError("角色更新后无法读取。", 500);
    }
    return character;
  }
}

export const storyAssetStateVoiceService = new StoryAssetStateVoiceService();
