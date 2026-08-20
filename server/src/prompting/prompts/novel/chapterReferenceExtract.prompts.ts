// 漫剧工作室「提取」页签：从参考小说原文提取设定建议——角色 / 场景 / 世界观条目。
// 结果不落库，前端展示给用户勾选确认后创建进设定中心；这是「建议创建」而不是直接写入。
// 提取策略「宁多勿漏」：建议列表由用户筛选确认，漏提比多提更影响使用。
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

// 弱模型可能把结构化骨架里的占位内容原样抄回来；命中即判输出无效，触发修复重试。
const PLACEHOLDER_VALUES = new Set(["示例文本", "示例内容", "示例", "xxx", "XXX", "占位"]);

function validateChapterReferenceExtract(output: ChapterReferenceExtractOutput): ChapterReferenceExtractOutput {
  for (const group of [output.characters, output.scenes, output.worldview] as Array<Array<{ name: string; description: string }>>) {
    const names = group.map((item) => item.name.trim());
    if (names.some((name) => !name)) {
      throw new Error("提取条目的名称不能为空。");
    }
    if (new Set(names).size !== names.length) {
      throw new Error("同一类提取条目不能重名。");
    }
    for (const item of group) {
      if (PLACEHOLDER_VALUES.has(item.name.trim()) || PLACEHOLDER_VALUES.has(item.description.trim())) {
        throw new Error("提取条目不能是占位内容。");
      }
    }
  }
  return output;
}

export const chapterReferenceExtractPrompt: PromptAsset<ChapterReferenceExtractPromptInput, ChapterReferenceExtractOutput> = {
  id: "novel.chapter.reference_extract",
  version: "v2",
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
      "原则是宁多勿漏：建议列表由用户逐条挑选确认，漏提比多提更影响使用。",
      "characters＝出场角色：凡是原文里有名字或有台词的角色都要提取（含只出现一次的有名配角，role 可用「配角」）；name 用原文人名，role 是身份定位（如 男主/女主/反派/导师/配角），description 一句话简略概括：身份、外形（年龄段、体型、穿着特征）、性格与关键能力——不用很细，一句到位。",
      "scenes＝出现过的场景地点：每个独立的空间都算（房间、街道、建筑、区域），name 是地点名，description 一句话写环境特征与用途。",
      "worldview＝世界观条目：力量体系、金手指/系统、势力组织、关键规则、时代背景等支撑剧情理解的设定概念（name 是条目名，description 一句话说明）。",
      "只提取原文明确出现或可直接推断的内容，不虚构；每类挑重要的、上限 16 条。",
      "名字保留原文写法。严禁把结构示例中的「示例文本」等占位内容原样输出——每一条都必须来自原文；原文里确实没有的类别才返回空数组。所有内容用中文。只输出严格 JSON。",
    ].join("\n")),
    new HumanMessage(JSON.stringify(input, null, 2)),
  ],
  postValidate: validateChapterReferenceExtract,
};
