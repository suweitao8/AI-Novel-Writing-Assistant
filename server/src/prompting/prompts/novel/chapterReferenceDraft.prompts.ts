// 漫剧工作室「参考」页签：把粘贴的小说原文（约 2000～3000 字）压缩成本章初稿，
// 逐行标注旁白/角色（约 20 行）。草稿不落库，用户确认后写入 Chapter.expectation。
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import type { PromptAsset } from "../../core/promptTypes";

const referenceDraftSegmentSchema = z.object({
  speaker: z.string().min(1).max(20),
  kind: z.enum(["narration", "dialogue"]),
  text: z.string().min(2).max(120),
}).strict();

const chapterReferenceDraftSchema = z.object({
  segments: z.array(referenceDraftSegmentSchema).min(15).max(25),
}).strict();

export interface ChapterReferenceDraftPromptInput {
  novelTitle: string;
  chapterTitle: string;
  chapterOrder: number;
  referenceText: string;
}

export interface ChapterReferenceDraftOutput extends z.infer<typeof chapterReferenceDraftSchema> {}

function validateChapterReferenceDraft(output: ChapterReferenceDraftOutput): ChapterReferenceDraftOutput {
  for (const segment of output.segments) {
    if (segment.kind === "narration" && segment.speaker !== "旁白") {
      throw new Error("旁白行的说话人必须是「旁白」。");
    }
    if (segment.kind === "dialogue" && (!segment.speaker.trim() || segment.speaker === "旁白")) {
      throw new Error("台词行必须写明说话的角色名。");
    }
    if (!segment.text.trim()) {
      throw new Error("初稿行的内容不能为空。");
    }
  }
  const texts = output.segments.map((segment) => segment.text.trim());
  if (new Set(texts).size !== texts.length) {
    throw new Error("初稿行不能重复。");
  }
  return output;
}

export const chapterReferenceDraftPrompt: PromptAsset<ChapterReferenceDraftPromptInput, ChapterReferenceDraftOutput> = {
  id: "novel.chapter.reference_draft",
  version: "v2",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  contextPolicy: { maxTokensBudget: 4000 },
  outputSchema: chapterReferenceDraftSchema,
  repairPolicy: { maxAttempts: 1 },
  render: (input) => [
    new SystemMessage([
      "你是中文网文改编编辑：把用户粘贴的参考小说原文（referenceText，通常 2000～3000 字）压缩成本章初稿。",
      "先剔除非正文内容：书名、章节标题行（如「第一章 xxx」）、作者感言、求票求收藏、错别字勘误等一切与剧情无关的元信息，一律不得进入初稿，只压缩故事本体。",
      "输出 15～25 行、以 20 行左右为目标；每一行是 segments 中的一个元素，一句话说完一件事。",
      "每行必须标明说话人：叙述行 kind=narration、speaker 固定为「旁白」；角色说话的行 kind=dialogue、speaker 用原文中说话角色的名字——保留原文人名，不得改名、不得把台词归到别人名下。",
      "旁白行优先保留有画面感的内容：人物的动作与神态、场景与环境描写、有视觉冲击的瞬间（这是漫剧分镜的画面素材），其次是情节推进；纯心理独白和重复铺垫删掉。",
      "台词逐句归属到说话角色，改写成紧凑口语，不逐字照搬原文；每行 text 不超过 60 字。",
      "保留原文主线（开端、关键冲突、转折、结尾钩子）；不得虚构原文没有的重大事件或人物。所有内容用中文。只输出严格 JSON。",
    ].join("\n")),
    new HumanMessage(JSON.stringify(input, null, 2)),
  ],
  postValidate: validateChapterReferenceDraft,
};
