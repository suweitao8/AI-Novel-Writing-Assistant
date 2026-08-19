// 漫剧/小说阶段：把用户写的单章大纲（Chapter.expectation）推理成该章的细纲节拍。
// 草稿不落库，用户在前端逐拍编辑确认后才保存到 Chapter.detailOutlineJson。
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import type { PromptAsset } from "../../core/promptTypes";

const chapterBeatItemSchema = z.object({
  summary: z.string().min(4).max(200),
  keyEvent: z.string().min(2).max(120).nullable().default(null),
}).strict();

const chapterDetailOutlineSchema = z.object({
  beats: z.array(chapterBeatItemSchema).min(3).max(10),
  notes: z.string().min(2).max(300).nullable().default(null),
}).strict();

export interface ChapterDetailOutlinePromptInput {
  novelTitle: string;
  chapterTitle: string;
  chapterOrder: number;
  chapterSynopsis: string;
  previousChapterSummary?: string;
  nextChapterSummary?: string;
  settingsSnapshot?: {
    characters: string[];
    scenes: string[];
    worldPremise?: string;
  };
}

export interface ChapterDetailOutlineOutput extends z.infer<typeof chapterDetailOutlineSchema> {}

function validateChapterDetailOutline(output: ChapterDetailOutlineOutput): ChapterDetailOutlineOutput {
  const summaries = output.beats.map((beat) => beat.summary.trim());
  if (new Set(summaries).size !== summaries.length) {
    throw new Error("细纲节拍不能重复。");
  }
  if (summaries.some((summary) => !summary)) {
    throw new Error("细纲节拍的内容不能为空。");
  }
  return output;
}

export const chapterDetailOutlinePrompt: PromptAsset<ChapterDetailOutlinePromptInput, ChapterDetailOutlineOutput> = {
  id: "novel.chapter.detail_outline",
  version: "v1",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  contextPolicy: { maxTokensBudget: 3000 },
  outputSchema: chapterDetailOutlineSchema,
  repairPolicy: { maxAttempts: 1 },
  render: (input) => [
    new SystemMessage([
      "你是中文网文的章节细纲编辑：把用户写的本章大纲（chapterSynopsis）展开成 3～10 个可执行的情节节拍。",
      "本章大纲是最高优先级契约：大纲写明的事件、顺序与结果必须保留；大纲没写到的衔接、反应、过渡由你合理补全，不得推翻或跳过大纲内容。",
      "每个节拍一句话说清「谁做了什么、发生了什么变化」，具体到可写成正文的程度；有明确转折/揭示/冲突升级的节拍补 keyEvent（一句话，没有就为 null）。",
      "节拍之间要有因果递进：后一拍的问题来自前一拍的选择与后果；最后一拍要给本章收束或钩子。",
      "参考 previousChapterSummary / nextChapterSummary 保证与前后章衔接：不重复上一章已完成的事，也不提前泄掉下一章的核心事件。",
      "settingsSnapshot 提供角色与场景名单，节拍内容只能使用名单内的名字；没有设定就按大纲人名称呼，不要凭空发明设定。",
      "notes 用于向用户说明你对大纲做的补充取舍（可 null）；所有内容用中文。只输出严格 JSON。",
    ].join("\n")),
    new HumanMessage(JSON.stringify(input, null, 2)),
  ],
  postValidate: validateChapterDetailOutline,
};
