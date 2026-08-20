// 漫剧工作室「提取」页签：从参考小说原文提取设定建议——角色 / 场景 / 世界观条目。
// 结果不落库，前端展示给用户勾选确认后创建进设定中心；这是「建议创建」而不是直接写入。
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import type { PromptAsset } from "../../core/promptTypes";

const extractItemSchema = z.object({
  name: z.string().min(1).max(30),
  description: z.string().min(2).max(160),
}).strict();

const chapterReferenceExtractSchema = z.object({
  characters: z.array(z.object({
    name: z.string().min(1).max(20),
    role: z.string().min(1).max(12),
    description: z.string().min(2).max(160),
  }).strict()).max(20).default([]),
  scenes: z.array(extractItemSchema).max(20).default([]),
  worldview: z.array(extractItemSchema).max(20).default([]),
}).strict();

export interface ChapterReferenceExtractPromptInput {
  novelTitle: string;
  chapterTitle: string;
  chapterOrder: number;
  referenceText: string;
}

export interface ChapterReferenceExtractOutput extends z.infer<typeof chapterReferenceExtractSchema> {}

function validateChapterReferenceExtract(output: ChapterReferenceExtractOutput): ChapterReferenceExtractOutput {
  for (const group of [output.characters, output.scenes, output.worldview] as Array<Array<{ name: string }>>) {
    const names = group.map((item) => item.name.trim());
    if (names.some((name) => !name)) {
      throw new Error("提取条目的名称不能为空。");
    }
    if (new Set(names).size !== names.length) {
      throw new Error("同一类提取条目不能重名。");
    }
  }
  return output;
}

export const chapterReferenceExtractPrompt: PromptAsset<ChapterReferenceExtractPromptInput, ChapterReferenceExtractOutput> = {
  id: "novel.chapter.reference_extract",
  version: "v1",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  contextPolicy: { maxTokensBudget: 3000 },
  outputSchema: chapterReferenceExtractSchema,
  repairPolicy: { maxAttempts: 1 },
  render: (input) => [
    new SystemMessage([
      "你是中文网文设定编辑：从用户粘贴的参考小说原文（referenceText）中提取三类设定建议，供用户确认后创建为项目设定。",
      "忽略非正文内容：书名、章节标题行、作者感言、求票求收藏等元信息不参与提取。",
      "characters＝出场角色：name 用原文人名，role 是身份定位（如 男主/女主/反派/导师/配角），description 一句话写身份、性格与关键特征。",
      "scenes＝出现过的场景地点：name 是地点名，description 一句话写环境特征与用途。",
      "worldview＝世界观条目：力量体系、社会结构、核心规则、时代背景等（name 是条目名，description 一句话说明）。",
      "只提取原文明确出现或可直接推断的内容，不虚构；每类挑最重要的、上限 12 条，次要路人角色与一次性地点不收。",
      "名字保留原文写法。所有内容用中文。只输出严格 JSON。",
    ].join("\n")),
    new HumanMessage(JSON.stringify(input, null, 2)),
  ],
  postValidate: validateChapterReferenceExtract,
};
