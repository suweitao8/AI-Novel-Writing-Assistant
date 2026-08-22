// 状态图片提示词微调：新增状态常复用旧状态的图片提示词，用户给一条小改动指令
//（如「去掉身上的伤」「换成黑色外套」），AI 只改指令涉及的部分，其余逐字保留。
// 结果只写回表单由用户保存，不直接落库。
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import type { PromptAsset } from "../../core/promptTypes";

const stateImagePromptTweakSchema = z.object({
  /** 改写后的完整图片提示词（与状态表单同上限 600 字）。 */
  imagePrompt: z.string().min(4).max(600),
}).strict();

export interface StateImagePromptTweakPromptInput {
  /** 资产类别：character=人物形象，scene=环境，prop=物件。 */
  kind: "character" | "scene" | "prop";
  /** 资产名（角色名/场景名/道具名），帮助理解提示词主体。 */
  assetName?: string;
  /** 当前状态名（如 重伤、警察制服、黑夜）。 */
  stateLabel?: string;
  /** 当前图片提示词；为空表示按状态与指令写一条新的。 */
  imagePrompt?: string;
  /** 用户的小改动指令，如「去掉身上的伤」。 */
  instruction: string;
}

export interface StateImagePromptTweakOutput extends z.infer<typeof stateImagePromptTweakSchema> {}

function validateTweakedPrompt(output: StateImagePromptTweakOutput): StateImagePromptTweakOutput {
  const prompt = output.imagePrompt.trim();
  if (prompt.length < 4) {
    throw new Error("改写后的图片提示词过短，请输出一条完整的画面描述。");
  }
  return output;
}

export const stateImagePromptTweakPrompt: PromptAsset<StateImagePromptTweakPromptInput, StateImagePromptTweakOutput> = {
  id: "novel.state_image_prompt.tweak",
  version: "v1",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  contextPolicy: { maxTokensBudget: 1200 },
  outputSchema: stateImagePromptTweakSchema,
  repairPolicy: { maxAttempts: 1 },
  render: (input) => [
    new SystemMessage([
      "你是图片提示词编辑器：拿到现有图片提示词和一条小改动指令，输出改写后的完整提示词。",
      "这是轻微修改，不是重写：只改指令涉及的部分，其余描述（长相、服装、环境要素等）逐字保留。",
      "指令是删除类（如去掉身上的伤）就把相关描述删干净；替换类就只换对应词；新增类就补进去。",
      "imagePrompt 为空时，按 kind、assetName、stateLabel 和指令写一条新的完整画面描述。",
      "只描述画面内容：不要添加视图规格（四视图/全景/透视）、画风、透明底等词，生成链会自动注入。",
      "用中文写一条完整提示词，长度与原文相当，不要解释。只输出严格 JSON。",
    ].join("\n")),
    new HumanMessage(JSON.stringify(input, null, 2)),
  ],
  postValidate: validateTweakedPrompt,
};
