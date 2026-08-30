import { AppError } from "../../middleware/errorHandler";
import { runStructuredPrompt } from "../../prompting/core/promptRunner";
import {
  stateImagePromptTweakPrompt,
  type StateImagePromptTweakPromptInput,
} from "../../prompting/prompts/novel/stateImagePromptTweak.prompts";

export interface StateImagePromptTweakRequest {
  kind: "character" | "scene" | "prop";
  assetName?: string;
  stateLabel?: string;
  imagePrompt?: string;
  instruction: string;
}

/**
 * 状态图片提示词微调：新增状态常复用旧状态的提示词（如旧状态带伤、新状态没伤），
 * 用户给一条小改动指令，AI 只改指令涉及的部分。纯文本改写，不读不写资产——
 * 资产还没保存（没有 id）时也能用，结果写回表单由用户随状态一起保存。
 *
 * 从小说模块下沉到 services/image：微调只依赖 Prompt Registry 与 LLM 运行时，
 * 小说场景状态与通用环境资产共用同一份改写契约；novelId 仅作为运行元数据，
 * 全局资产（通用环境）可以不传。
 */
export class StoryStateImagePromptService {
  async tweakStateImagePrompt(
    novelId: string | undefined,
    request: StateImagePromptTweakRequest,
  ): Promise<{ imagePrompt: string }> {
    const promptInput: StateImagePromptTweakPromptInput = {
      kind: request.kind,
      assetName: request.assetName?.trim() || undefined,
      stateLabel: request.stateLabel?.trim() || undefined,
      imagePrompt: request.imagePrompt?.trim() || undefined,
      instruction: request.instruction.trim(),
    };
    const generated = await runStructuredPrompt({
      asset: stateImagePromptTweakPrompt,
      promptInput,
      options: {
        ...(novelId ? { novelId } : {}),
        stage: "state_image_prompt_tweak",
        entrypoint: "story_settings",
        temperature: 0.3,
      },
    });
    const imagePrompt = generated.output.imagePrompt.trim();
    if (!imagePrompt) {
      throw new AppError("没能改写出新的图片提示词，请换个说法再试。", 502);
    }
    return { imagePrompt };
  }
}

export const storyStateImagePromptService = new StoryStateImagePromptService();
