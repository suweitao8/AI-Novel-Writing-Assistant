import type {
  StoryAssetState,
  StoryAssetStateVoiceMode,
} from "@ai-novel/shared/types/novelReferenceExtraction";
import {
  GENERIC_CHARACTER_VOICE_PROMPT_TAIL,
  getDefaultStoryAssetStateVoiceMode,
  normalizeStoryCharacterStates,
  normalizeStoryAssetStates,
  parseStoryAssetStatesJson,
  resolveStoryAssetStateAncestors,
  type StoryCharacterLegacyFields,
} from "@ai-novel/shared/types/novelReferenceExtraction";
import { prisma } from "../../../../db/prisma";
import { AppError } from "../../../../middleware/errorHandler";
import { runStructuredPrompt } from "../../../../prompting/core/promptRunner";
import {
  characterVoiceProfilePrompt,
  type CharacterVoiceProfilePromptInput,
} from "../../../../prompting/prompts/novel/characterVoiceProfile.prompts";
import {
  synthesizeAudioSpeech,
  type AudioSpeechResult,
} from "../../../../services/audio/speechProvider";
import {
  storySettingsService,
  type StorySettingsCharacter,
} from "./StorySettingsService";
import { updateStoryAssetStateJsonWithCas } from "./StorySettingsStatePolicy";

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
  gender?: string | null;
  ageGroup?: string | null;
  physique?: string | null;
  attireStyle?: string | null;
  facePrompt?: string | null;
  appearance?: string | null;
}

export interface StateVoiceGenerationInput {
  text: string;
  audioType: "dialogue";
  speaker: string;
  emotion: string;
}

/** 按角色形象估算音色描述（空描述时的 AI 兜底）；生产实现走 novel.character.voice_profile@v1。 */
export type EstimateVoiceProfile = (
  character: StateVoiceCharacterRow,
  state: Pick<StoryAssetState, "label" | "description" | "imagePrompt" | "ageGroup">,
) => Promise<string>;

interface StateVoiceServiceDependencies {
  findCharacter: (novelId: string, characterId: string) => Promise<StateVoiceCharacterRow | null>;
  /** 测试或外部适配器可注入整包保存；生产默认走目标状态 CAS 写入。 */
  updateStates?: (characterId: string, statesJson: string | null) => Promise<void>;
  listCharacters: (novelId: string) => Promise<StorySettingsCharacter[]>;
  synthesize: (input: StateVoiceGenerationInput) => Promise<AudioSpeechResult>;
  estimateVoiceProfile?: EstimateVoiceProfile;
}

async function estimateVoiceProfileByAi(
  novelId: string,
  character: StateVoiceCharacterRow,
  state: Pick<StoryAssetState, "label" | "description" | "imagePrompt" | "ageGroup">,
): Promise<string> {
  const promptInput: CharacterVoiceProfilePromptInput = {
    name: character.name,
    gender: character.gender?.trim() || undefined,
    ageGroup: character.ageGroup?.trim() || state.ageGroup?.trim() || undefined,
    appearance: character.appearance?.trim() || undefined,
    physique: character.physique?.trim() || undefined,
    attireStyle: character.attireStyle?.trim() || undefined,
    facePrompt: character.facePrompt?.trim() || undefined,
    stateLabel: state.label?.trim() || undefined,
    stateDescription: state.description?.trim() || undefined,
    stateImagePrompt: state.imagePrompt?.trim() || undefined,
  };
  const generated = await runStructuredPrompt({
    asset: characterVoiceProfilePrompt,
    promptInput,
    options: {
      novelId,
      stage: "state_voice_profile",
      entrypoint: "drama_studio",
      temperature: 0.3,
    },
  });
  return generated.output.voiceProfile.trim();
}

export function getDefaultStateVoiceMode(
  states: Array<{ id: string }>,
  stateId: string,
): StoryAssetStateVoiceMode {
  return getDefaultStoryAssetStateVoiceMode(states, stateId);
}

/** 沿当前状态的参考链查找最近可用的试听音频，支持连续多个未生成状态。 */
export function resolvePreviousStateVoice(
  states: StoryAssetState[],
  stateId: string,
): PreviousStateVoice | null {
  for (const previous of resolveStoryAssetStateAncestors(states, stateId)) {
    const sampleAudioUrl = previous.voice?.sampleAudioUrl?.trim();
    if (previous.voice?.status === "done" && sampleAudioUrl) {
      return { stateId: previous.id, sampleAudioUrl };
    }
  }
  return null;
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

function resolveStateVoicePrompt(
  states: StoryAssetState[],
  stateId: string,
  character: StoryCharacterLegacyFields,
): string {
  const current = states.find((state) => state.id === stateId);
  const candidates = current
    ? [current, ...resolveStoryAssetStateAncestors(states, stateId)]
    : [];
  for (const state of candidates) {
    const prompt = [state?.voicePrompt, state?.voice?.prompt]
      .find((value) => Boolean(value?.trim()))
      ?.trim();
    if (prompt) {
      return prompt;
    }
  }
  return character.voiceTexture?.trim() ?? "";
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
        select: {
          id: true,
          novelId: true,
          name: true,
          voiceTexture: true,
          statesJson: true,
          gender: true,
          ageGroup: true,
          physique: true,
          attireStyle: true,
          facePrompt: true,
          appearance: true,
        },
      }),
      listCharacters: (novelId) => storySettingsService.listCharacters(novelId),
      synthesize: (input) => synthesizeAudioSpeech(input),
      estimateVoiceProfile: (character, state) => estimateVoiceProfileByAi(character.novelId, character, state),
      ...dependencies,
    };
  }

  private async saveStates(
    novelId: string,
    characterId: string,
    stateId: string,
    states: StoryAssetState[],
  ): Promise<void> {
    if (this.dependencies.updateStates) {
      await this.dependencies.updateStates(characterId, serializeStates(states));
      return;
    }
    const targetVoice = states.find((state) => state.id === stateId)?.voice;
    await updateStoryAssetStateJsonWithCas({
      stateId,
      fallbackStates: states,
      read: async () => {
        const row = await prisma.character.findFirst({
          where: { id: characterId, novelId },
          select: {
            statesJson: true,
            name: true,
            gender: true,
            ageGroup: true,
            physique: true,
            attireStyle: true,
            facePrompt: true,
            appearance: true,
            voiceTexture: true,
          },
        });
        if (!row) {
          throw new AppError("没有找到这个角色。", 404);
        }
        const legacy: StoryCharacterLegacyFields = row;
        const parsedStates = parseStoryAssetStatesJson(row.statesJson);
        return {
          raw: row.statesJson,
          fallbackStates: normalizeStoryCharacterStates(parsedStates.states, legacy),
          normalize: (currentStates: StoryAssetState[]) => normalizeStoryCharacterStates(currentStates, legacy),
        };
      },
      write: async (expectedRaw, nextRaw) => {
        const result = await prisma.character.updateMany({
          where: { id: characterId, novelId, statesJson: expectedRaw },
          data: { statesJson: nextRaw },
        });
        return result.count === 1;
      },
      patch: (state) => ({
        ...state,
        voice: targetVoice,
      }),
    });
  }

  async generateStateVoice(
    novelId: string,
    characterId: string,
    stateId: string,
    requestedMode?: StoryAssetStateVoiceMode,
    sourceStateId?: string,
  ): Promise<StorySettingsCharacter> {
    const character = await this.dependencies.findCharacter(novelId, characterId);
    if (!character) {
      throw new AppError("没有找到这个角色。", 404);
    }

    const parsedStates = parseStoryAssetStatesJson(character.statesJson);
    if (character.statesJson?.trim() && !parsedStates.canSafelyRewrite) {
      throw new AppError("状态数据格式异常，已停止覆盖原始状态；请先在设定中心保存一次角色状态。", 409);
    }
    const states = normalizeStoryCharacterStates(parsedStates.states, character);
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
      // 选取音色（2026-08-22 用户决定）：显式指定用哪个状态的音色，不再隐式沿用参考链上一状态。
      // 显式选取就是显式——所选状态没有可用音色时直接报错，不静默回落别的状态。
      if (sourceStateId?.trim()) {
        const picked = states.find((item) => item.id === sourceStateId.trim());
        if (picked?.id === stateId) {
          throw new AppError("不能选取当前状态自己的音色。", 400);
        }
        const sampleAudioUrl = picked?.voice?.status === "done"
          ? picked.voice.sampleAudioUrl?.trim()
          : "";
        if (!picked || !sampleAudioUrl) {
          const message = picked
            ? "所选状态还没有已生成的音色，请先为它生成音色。"
            : "所选状态不存在，请重新选取。";
          const failedStates = states.map((item) => item.id === stateId
            ? { ...item, voice: buildVoiceErrorState(item, mode, message) }
            : item);
          await this.saveStates(novelId, characterId, stateId, failedStates);
          throw new AppError(message, 400);
        }
        const reusedStates = states.map((item) => item.id === stateId
          ? {
            ...item,
            voice: {
              status: "done" as const,
              mode,
              sourceStateId: picked.id,
              sampleAudioUrl,
              prompt: resolveStateVoicePrompt(states, picked.id, character) || undefined,
              generatedAt: nowIso(),
            },
          }
          : item);
        await this.saveStates(novelId, characterId, stateId, reusedStates);
        return this.getUpdatedCharacter(novelId, characterId);
      }
      const previous = resolvePreviousStateVoice(states, stateId);
      if (!previous) {
        const message = "上一状态还没有可复用的已生成音色，请先生成新的音色。";
        const failedStates = states.map((item) => item.id === stateId
          ? { ...item, voice: buildVoiceErrorState(item, mode, message) }
          : item);
        await this.saveStates(novelId, characterId, stateId, failedStates);
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
            prompt: resolveStateVoicePrompt(states, previous.stateId, character) || undefined,
            generatedAt: nowIso(),
          },
        }
        : item);
      await this.saveStates(novelId, characterId, stateId, reusedStates);
      return this.getUpdatedCharacter(novelId, characterId);
    }

    const inheritedVoicePrompt = resolveStateVoicePrompt(states, stateId, character);
    let synthesisInput = buildStateVoiceSynthesisInput(
      character,
      inheritedVoicePrompt ? { ...state, voicePrompt: inheritedVoicePrompt } : state,
    );
    const emotionIsGeneric = synthesisInput.emotion.includes(GENERIC_CHARACTER_VOICE_PROMPT_TAIL);
    if (!synthesisInput.emotion || emotionIsGeneric) {
      // 音色描述缺失（或只是表单预填的通用占位）时按角色形象 AI 估算（2026-08-22 用户要求）；
      // 估算结果只写进本次生成（voice.prompt），不回填状态表单——用户显式填写永远优先。
      try {
        const estimated = await this.dependencies.estimateVoiceProfile?.(character, state);
        if (estimated) {
          synthesisInput = { ...synthesisInput, emotion: estimated };
        }
      } catch (error) {
        console.error("[state-voice] 音色描述估算失败：", error instanceof Error ? error.message : error);
      }
      // 估算失败：通用占位仍然可用（保持旧行为继续合成），只有真正为空才要求补写。
      if (!synthesisInput.emotion) {
        const message = "没能按角色形象推断出音色描述，请先填写初始状态的音色描述或当前状态的音色变化。";
        const failedStates = states.map((item) => item.id === stateId
          ? { ...item, voice: buildVoiceErrorState(item, mode, message) }
          : item);
        await this.saveStates(novelId, characterId, stateId, failedStates);
        throw new AppError(message, 400);
      }
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
    await this.saveStates(novelId, characterId, stateId, generatingStates);

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
      await this.saveStates(novelId, characterId, stateId, completedStates);
    } catch (error) {
      const message = error instanceof Error ? error.message : "音色生成失败。";
      const failedStates = generatingStates.map((item) => item.id === stateId
        ? { ...item, voice: buildVoiceErrorState(item, mode, message) }
        : item);
      await this.saveStates(novelId, characterId, stateId, failedStates);
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
