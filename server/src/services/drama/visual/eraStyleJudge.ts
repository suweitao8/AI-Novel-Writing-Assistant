// 时代风格判定的服务封装：调用 drama.visual.era_style_judge@v1，任何失败都返回 null
// （判定是增强，不是门槛——失败时调用方回落现行解析链，绝不阻塞生成）。
import { runStructuredPrompt } from "../../../prompting/core/promptRunner";
import {
  eraStyleJudgePrompt,
  type EraStyleJudgePromptInput,
} from "../../../prompting/prompts/drama/eraStyleJudge.prompts";

export interface JudgeEraStyleInput {
  novelId?: string | null;
  target: string;
  scriptExcerpt: string;
  availableStyles: Array<{ key: string; label: string; summary: string }>;
  defaultKey?: string | null;
}

export interface JudgedEraStyle {
  styleKey: string;
  reason: string;
}

/** 可注入的判定函数（resolver 测试用 stub 替代真实 LLM 调用）。 */
export type JudgeEraStyleFn = (input: JudgeEraStyleInput) => Promise<JudgedEraStyle | null>;

export async function judgeEraStyle(input: JudgeEraStyleInput): Promise<JudgedEraStyle | null> {
  const excerpt = input.scriptExcerpt.trim();
  // 只有一个可选风格时无从选择；空文本无从判定——都直接跳过。
  if (!excerpt || input.availableStyles.length <= 1) {
    return null;
  }
  const promptInput: EraStyleJudgePromptInput = {
    target: input.target,
    scriptExcerpt: excerpt,
    availableStyles: input.availableStyles,
    ...(input.defaultKey?.trim() ? { defaultKey: input.defaultKey.trim() } : {}),
  };
  try {
    const generated = await runStructuredPrompt({
      asset: eraStyleJudgePrompt,
      promptInput,
      options: {
        ...(input.novelId?.trim() ? { novelId: input.novelId.trim() } : {}),
        stage: "era_style_judge",
        entrypoint: "drama_studio",
        temperature: 0.1,
      },
    });
    return { styleKey: generated.output.styleKey.trim(), reason: generated.output.reason.trim() };
  } catch (error) {
    console.error(
      "[era-style-judge] 判定失败，回落现行风格链：",
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}
