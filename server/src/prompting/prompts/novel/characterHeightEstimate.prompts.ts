import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import {
  STORY_ASSET_CHARACTER_HEIGHT_MAX_METERS,
  STORY_ASSET_CHARACTER_HEIGHT_MIN_METERS,
} from "@ai-novel/shared/types/novelReferenceExtraction";
import type { PromptAsset } from "../../core/promptTypes";

const characterHeightEstimateOutputSchema = z.object({
  heightMeters: z.number()
    .min(STORY_ASSET_CHARACTER_HEIGHT_MIN_METERS)
    .max(STORY_ASSET_CHARACTER_HEIGHT_MAX_METERS),
  confidence: z.number().min(0).max(1),
  rationale: z.string().trim().min(1).max(240),
}).strict();

export interface CharacterHeightEstimatePromptInput {
  characterJson: string;
}

export type CharacterHeightEstimateOutput = z.infer<typeof characterHeightEstimateOutputSchema>;

export const characterHeightEstimatePrompt: PromptAsset<
  CharacterHeightEstimatePromptInput,
  CharacterHeightEstimateOutput
> = {
  id: "novel.character.heightEstimate",
  version: "v1",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  contextPolicy: { maxTokensBudget: 1200 },
  management: { productPrompt: true, editModes: ["readonly"] },
  outputSchema: characterHeightEstimateOutputSchema,
  postValidate: (output) => ({
    ...output,
    rationale: output.rationale.trim(),
  }),
  render: (input) => [
    new SystemMessage([
      "你负责为角色 3D 分镜推断一个用于相对比例的近似身高。",
      "必须综合年龄段、体型、外貌、背景、剧情定位和其他明确描述；儿童或少年可以明显低于成年人，高个、矮小、健壮或娇小等明确特征要反映在结果中。",
      `身高必须输出 ${STORY_ASSET_CHARACTER_HEIGHT_MIN_METERS.toFixed(2)} 到 ${STORY_ASSET_CHARACTER_HEIGHT_MAX_METERS.toFixed(2)} 米之间；怪物、巨型生物或其他非人角色可以输出远高于人类的数值，例如 5 米。`,
      "没有证据时请给出常见范围内的保守估计，不要仅凭姓名、性别刻板印象或单一职业决定身高。",
      "结果不是医学或现实测量值，只用于让同一角色在不同分镜中保持稳定的视觉比例。",
      "只输出符合 schema 的 JSON，不输出 Markdown、解释段落或额外字段。",
    ].join("\n")),
    new HumanMessage(`【角色设定】\n${input.characterJson}`),
  ],
};
