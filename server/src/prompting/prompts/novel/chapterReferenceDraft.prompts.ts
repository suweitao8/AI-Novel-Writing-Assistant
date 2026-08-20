// 漫剧工作室「参考」页签：把粘贴的小说原文（约 2000～3000 字）改编成分镜式初稿，
// 每个分镜单元两行——「分镜画面」+「旁白/角色台词」，单元之间空行。草稿不落库，
// 用户确认后写入 Chapter.expectation。
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import type { PromptAsset } from "../../core/promptTypes";

const referenceDraftSegmentSchema = z.object({
  storyboard: z.string().min(2).max(80),
  speaker: z.string().min(1).max(20),
  kind: z.enum(["narration", "dialogue"]),
  mood: z.string().max(20).default(""),
  text: z.string().min(2).max(120),
}).strict();

const chapterReferenceDraftSchema = z.object({
  segments: z.array(referenceDraftSegmentSchema).min(8).max(18),
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
    if (!segment.storyboard.trim()) {
      throw new Error("分镜行的画面内容不能为空。");
    }
    if (segment.kind === "narration") {
      segment.speaker = "旁白";
      segment.mood = "";
    } else if (!segment.speaker.trim() || segment.speaker === "旁白") {
      throw new Error("台词行必须写明说话的角色名。");
    }
    if (!segment.text.trim()) {
      throw new Error("初稿行的内容不能为空。");
    }
  }
  const keys = output.segments.map((segment) => `${segment.storyboard.trim()}|${segment.text.trim()}`);
  if (new Set(keys).size !== keys.length) {
    throw new Error("分镜单元不能重复。");
  }
  return output;
}

export const chapterReferenceDraftPrompt: PromptAsset<ChapterReferenceDraftPromptInput, ChapterReferenceDraftOutput> = {
  id: "novel.chapter.reference_draft",
  version: "v3",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  contextPolicy: { maxTokensBudget: 4000 },
  outputSchema: chapterReferenceDraftSchema,
  repairPolicy: { maxAttempts: 1 },
  render: (input) => [
    new SystemMessage([
      "你是漫剧分镜编剧：把用户粘贴的参考小说原文（referenceText，通常 2000～3000 字）改编成本章分镜式初稿。",
      "先剔除非正文内容：书名、章节标题行（如「第一章 xxx」）、作者感言、求票求收藏、错别字勘误等一切与剧情无关的元信息，一律不得进入初稿，只改编故事本体。",
      "把整章拆成 10～16 个分镜单元（segments 数组元素），按剧情推进排列；一个分镜单元只讲一个镜头画面，不得把多个场景塞进同一单元。",
      "每个单元由两行构成：",
      "storyboard＝这一格分镜的画面：镜头拍什么（主体、动作、环境或景别），像导演给摄影师的一句话指令，不超过 40 字。",
      "第二行是这一格的内容：叙述镜头 kind=narration、speaker 固定「旁白」，text 写画面里发生的事与关键动作神态；角色开口 kind=dialogue、speaker 用原文中说话角色的名字，mood 写说话时的表情神态（如「皱眉」「冷笑」，没有就留空），text 是这句台词——紧凑口语，不逐字照搬原文。",
      "台词逐句归属到说话角色，不得改名、不得把台词归到别人名下；旁白优先有画面感的内容（动作神态、场景环境、有视觉冲击的瞬间），纯心理独白和重复铺垫删掉。",
      "保留原文主线（开端、关键冲突、转折、结尾钩子）；不得虚构原文没有的重大事件或人物。所有内容用中文。只输出严格 JSON。",
    ].join("\n")),
    new HumanMessage(JSON.stringify(input, null, 2)),
  ],
  postValidate: validateChapterReferenceDraft,
};
