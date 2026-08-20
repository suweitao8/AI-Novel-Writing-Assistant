// 漫剧工作室「参考」页签：把粘贴的小说原文（约 2000～3000 字）改编成分镜式初稿，
// 每个分镜单元两行——「分镜画面」+「旁白/角色台词」，单元之间空行。草稿不落库，
// 用户确认后写入 Chapter.expectation。
// 切换标记（序列化后单独成行、持续生效到下一个同类标记）：
// - 场景变化 → 【场景：地点】
// - 角色外观状态变化 → 【角色状态：名字：状态】
// 美术风格不进初稿（v8 移除 styleSwitch，2026-08-20 用户决定）：画风由设定·美术风格的默认风格决定。
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import type { PromptAsset } from "../../core/promptTypes";

const referenceDraftStateSwitchSchema = z.object({
  name: z.string().min(1).max(20),
  state: z.string().min(1).max(20),
}).strict();

const referenceDraftSegmentSchema = z.object({
  shot: z.enum(["大远景", "远景", "全景", "中景", "近景", "特写"]),
  storyboard: z.string().min(2).max(80),
  scene: z.string().min(1).max(30),
  speaker: z.string().min(1).max(20),
  kind: z.enum(["narration", "dialogue"]),
  mood: z.string().max(20).default(""),
  text: z.string().min(2).max(120),
  /** 角色外观状态切换：这一格起某些角色的形象发生变化（优先用 characterStates 里登记过的状态名） */
  stateSwitches: z.array(referenceDraftStateSwitchSchema).max(3).default([]),
}).strict();

const chapterReferenceDraftSchema = z.object({
  segments: z.array(referenceDraftSegmentSchema).min(8).max(18),
}).strict();

export interface ChapterReferenceDraftPromptInput {
  novelTitle: string;
  chapterTitle: string;
  chapterOrder: number;
  referenceText: string;
  /** 设定中心已有的场景名（优先沿用，保证初稿场景与项目资产对得上） */
  existingScenes?: string[];
  /** 角色与其已登记的外观状态，格式如「李火旺：正常、重伤、癫狂」；未登记的角色不出现 */
  characterStates?: string[];
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
  version: "v8",
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
      "第一行是这一格分镜的画面，由 shot 与 storyboard 组成：shot 必须选一个景别（大远景/远景/全景/中景/近景/特写）；storyboard 写这个画面里正在发生什么——谁在画面中、人物的动作/姿势/神态、所处的环境，像导演给摄影师的一句话指令，不超过 40 字。这是初步分镜，后续会再细化，不用写得太细。",
      "第二行是这一格的内容：叙述镜头 kind=narration、speaker 固定「旁白」，text 写画面里发生的事与关键动作神态；角色开口 kind=dialogue、speaker 用原文中说话角色的名字，mood 写这一句说话的神态与语气（如「冷笑嘲讽」「压抑怒气」「急切」「沙哑低语」，2～8 字）——它会作为后续配音的情绪提示，只写听得出的语气，不写纯视觉描写；没有明显情绪就留空。text 是这句台词——紧凑口语，不逐字照搬原文。",
      "scene 是这一格所在的场景（地点名，具体到空间，如 卧室/客厅/街道/天台/仓库）：优先使用 existingScenes 名单里的名字（画面发生在名单场景就用名单名，不要另起同义名）；名单没有的按原文地点起短名。同一场景连续出现的单元 scene 保持同一个值；地点变了才换新值——初稿会按 scene 的变化生成「【场景：…】」换场标记，后续分镜与视频生成按它切换场景。",
      "stateSwitches 是角色外观状态切换：某个角色的形象从这一格起发生显著且持续的变化（重伤、变身、换装、沾血、形态切换）才填一条 {name,state}；state 优先用 characterStates 里该角色登记过的状态名（逐字一致），没登记过的按原文起 2～6 字短状态名；只写发生变化的角色，恢复原状时写回原状态名。初稿会按它生成「【角色状态：名字：状态】」标记，后续画面按它切换角色形象。",
      "台词逐句归属到说话角色，不得改名、不得把台词归到别人名下；旁白优先有画面感的内容（动作神态、场景环境、有视觉冲击的瞬间），纯心理独白和重复铺垫删掉。",
      "保留原文主线（开端、关键冲突、转折、结尾钩子）；不得虚构原文没有的重大事件或人物。所有内容用中文。只输出严格 JSON。",
    ].join("\n")),
    new HumanMessage(JSON.stringify(input, null, 2)),
  ],
  postValidate: validateChapterReferenceDraft,
};
