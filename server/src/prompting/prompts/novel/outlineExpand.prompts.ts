// 空白小说：把用户手写的简略大纲推理成分章细纲（每章标题/梗概/关键事件/出场角色与场景）。
// 草稿不落库，用户在前端逐章编辑确认后才保存为剧情契约。
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import type { PromptAsset } from "../../core/promptTypes";

const chapterOutlineItemSchema = z.object({
  order: z.number().int().min(1).max(400),
  title: z.string().min(2).max(40),
  synopsis: z.string().min(10).max(400),
  keyEvents: z.array(z.string().min(2).max(120)).min(1).max(5),
  characterNames: z.array(z.string().min(1).max(40)).max(8).default([]),
  sceneNames: z.array(z.string().min(1).max(40)).max(6).default([]),
}).strict();

const outlineExpandSchema = z.object({
  premise: z.string().min(10).max(400),
  suggestedChapterCount: z.number().int().min(3).max(400),
  chapters: z.array(chapterOutlineItemSchema).min(3).max(400),
  notes: z.array(z.string().min(2).max(200)).max(5).default([]),
}).strict();

export interface OutlineExpandPromptInput {
  novelTitle: string;
  briefIdea?: string;
  userOutline?: string;
  targetChapterCount?: number;
  genreName?: string;
  settingsSnapshot?: {
    characters: string[];
    scenes: string[];
    props: string[];
    worldPremise?: string;
  };
}

export interface OutlineExpandOutput extends z.infer<typeof outlineExpandSchema> {}

function validateChapterOutline(output: OutlineExpandOutput, input: OutlineExpandPromptInput): OutlineExpandOutput {
  const orders = output.chapters.map((chapter) => chapter.order);
  const seen = new Set(orders);
  if (seen.size !== orders.length) {
    throw new Error("分章细纲的章序不能重复。");
  }
  const sorted = [...orders].sort((left, right) => left - right);
  const contiguous = sorted.every((order, index) => order === index + 1);
  if (!contiguous) {
    throw new Error("分章细纲的章序必须从 1 开始连续编号。");
  }
  if (input.targetChapterCount && output.chapters.length !== input.targetChapterCount) {
    throw new Error(`用户期望 ${input.targetChapterCount} 章，推理结果必须是这个章数。`);
  }
  const settings = input.settingsSnapshot;
  if (settings && settings.characters.length > 0) {
    const knownNames = new Set(settings.characters.map((item) => item.replace(/（[^）]*）$/, "").trim()));
    for (const chapter of output.chapters) {
      for (const name of chapter.characterNames) {
        if (!knownNames.has(name)) {
          throw new Error(`章节「${chapter.title}」出场的角色「${name}」不在设定中心的角色列表中。`);
        }
      }
    }
  }
  return output;
}

export const novelOutlineExpandPrompt: PromptAsset<OutlineExpandPromptInput, OutlineExpandOutput> = {
  id: "novel.outline.expand",
  version: "v1",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  contextPolicy: { maxTokensBudget: 6000 },
  outputSchema: outlineExpandSchema,
  repairPolicy: { maxAttempts: 1 },
  render: (input) => [
    new SystemMessage([
      "你是中文长篇小说的细纲主编：把用户手写的简略大纲推理成可直接投产的分章细纲。",
      "用户的大纲（userOutline）是最高优先级的剧情契约：事件顺序、因果链与结局方向必须遵循，不得擅自改写、跳过或反转用户写明的情节；大纲没写到的空白（衔接、过渡、铺垫、支线）由你合理补全。",
      "如果用户只给了一句想法（briefIdea）而没有大纲，你基于想法原创完整剧情，保持网文节奏：目标推进、阻力升级、阶段回报循环。",
      "每章给出：章标题（具体、有信息量，不用「第X章」前缀）、80～200 字梗概（本章发生了什么、推进了什么、结尾钩子）、1～5 条关键事件、出场角色与场景（只能引用设定中心已存在的名字，没有设定就留空数组）。",
      "premise 用 2～3 句话概括全书：主角、核心冲突、整体走向——它是用户确认细纲前最先看到的内容。",
      "章数：用户指定 targetChapterCount 时必须严格等于该数；否则根据大纲体量建议 12～60 章，长线冲突给足铺垫但不注水。",
      "章节之间要有明确的因果与递进：后一章的问题来自前一章的选择与后果；避免每章互相独立的事件罗列。",
      "如对大纲有补充性调整（新增过渡章、把一章拆成两章），在 notes 里逐条说明理由；用户没写的结局不要替用户定死方向，按大纲走向收束。",
      "所有内容用中文，符合网文阅读习惯。只输出严格 JSON。",
    ].join("\n")),
    new HumanMessage(JSON.stringify(input, null, 2)),
  ],
  postValidate: validateChapterOutline,
};
