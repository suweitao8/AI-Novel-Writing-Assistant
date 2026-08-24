// 角色音色描述估算：状态/角色都没填音色描述时，按角色形象（性别、年龄段、外貌、画面提示词、状态变化）
// 推断一条自然的中文音色描述，交给本地 TTS 适配层做声音设计（2026-08-22 用户要求）。
// 用户显式填写的音色提示词永远优先——这里只做「没填」时的 AI 兜底，不覆盖人工输入。
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import type { PromptAsset } from "../../core/promptTypes";

const voiceProfileSchema = z.object({
  /** 一条中文音色描述：性别年龄段 + 音质 + 语气/语速，供 TTS control 指令直接使用。 */
  voiceProfile: z.string().min(4).max(60),
}).strict();

export interface CharacterVoiceProfilePromptInput {
  name: string;
  gender?: string;
  ageGroup?: string;
  /** 稳定外貌/体型/着装（角色资料）。 */
  appearance?: string;
  physique?: string;
  attireStyle?: string;
  /** 画面提示词（形象气质的主要依据，如「青年男性大学生，清爽短发」）。 */
  facePrompt?: string;
  /** 当前状态（非初始状态时叠加：受伤/老年/变声只改语气与气力，不改基础音色）。 */
  stateLabel?: string;
  stateDescription?: string;
  stateImagePrompt?: string;
}

export interface CharacterVoiceProfileOutput extends z.infer<typeof voiceProfileSchema> {}

function validateVoiceProfile(output: CharacterVoiceProfileOutput): CharacterVoiceProfileOutput {
  const profile = output.voiceProfile.trim();
  if (profile.length < 4) {
    throw new Error("音色描述过短，请给出「性别年龄段 + 音质 + 语气」的完整描述。");
  }
  return output;
}

export const characterVoiceProfilePrompt: PromptAsset<CharacterVoiceProfilePromptInput, CharacterVoiceProfileOutput> = {
  id: "novel.character.voice_profile",
  version: "v1",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  contextPolicy: { maxTokensBudget: 1200 },
  outputSchema: voiceProfileSchema,
  repairPolicy: { maxAttempts: 1 },
  render: (input) => [
    new SystemMessage([
      "你是真人有声剧的选角配音导演：根据角色档案推断他/她说话的音色，输出一条中文音色描述。",
      "判断依据优先级：gender 与 ageGroup > facePrompt/appearance/physique（形象气质）> 状态变化（stateDescription 只叠加语气与气力，不改变基础音色）。",
      "描述格式：一条短句，依次写 性别年龄段、音质、语气/语速，不超过 40 字。",
      "例如：「青年男性，嗓音清亮干净，语速平缓，像身边同学自然说话」「中年女性，声音温和沉稳，吐字清晰」。",
      "基线是像真人日常交流：不要播音腔、不要旁白腔；禁止无依据的戏剧化词（沙哑、嘶哑、低沉如怪物、机械音、变声、嘶吼）——只有档案明确写了（如老年、重伤失力）才允许相应特征，且程度要克制。",
      "所有内容用中文。只输出严格 JSON。",
    ].join("\n")),
    new HumanMessage(JSON.stringify(input, null, 2)),
  ],
  postValidate: validateVoiceProfile,
};
