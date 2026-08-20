// 漫剧工作室「解析」：从本章参考文本提取设定建议——角色 / 场景 / 道具 / 世界观条目，
// 并为每条推测外貌、性格、画面提示词（生图）、音色提示词（配音）。
// 结果随章节持久化，前端「提取」页签勾选确认后创建进设定中心（建议创建，不直接写入）。
// 已存在的同名资产若本章发生重大外观变化（换装/受伤/昼夜/损坏），输出 stateLabel/stateNote
// 与新状态下的提示词——创建时追加为资产的新外观状态，而不是新建资产。
// 提取策略「宁多勿漏」：建议列表由用户筛选确认，漏提比多提更影响使用。
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import type { PromptAsset } from "../../core/promptTypes";

const extractItemSchema = z.object({
  name: z.string().min(1).max(30),
  description: z.string().min(2).max(160),
  imagePrompt: z.string().max(300).optional().default(""),
  stateLabel: z.string().max(24).optional().default(""),
  stateNote: z.string().max(200).optional().default(""),
}).strict();

const chapterReferenceExtractSchema = z.object({
  characters: z.array(z.object({
    name: z.string().min(1).max(20),
    role: z.string().min(1).max(12),
    appearance: z.string().min(2).max(200),
    personality: z.string().min(2).max(120),
    imagePrompt: z.string().min(2).max(300),
    voicePrompt: z.string().min(2).max(160),
    stateLabel: z.string().max(24).optional().default(""),
    stateNote: z.string().max(200).optional().default(""),
  }).strict()).max(16).default([]),
  scenes: z.array(extractItemSchema).max(16).default([]),
  props: z.array(extractItemSchema).max(12).default([]),
  worldview: z.array(z.object({
    name: z.string().min(1).max(30),
    description: z.string().min(2).max(160),
  }).strict()).max(16).default([]),
}).strict();

export interface ChapterReferenceExtractPromptInput {
  novelTitle: string;
  chapterTitle: string;
  chapterOrder: number;
  referenceText: string;
  /** 已存在资产摘要（每行一条：类别｜名称｜当前状态），用于同名判断与外观变化检测 */
  existingAssets?: string[];
}

export interface ChapterReferenceExtractOutput extends z.infer<typeof chapterReferenceExtractSchema> {}

// 弱模型可能把结构化骨架里的占位内容原样抄回来；命中即判输出无效，触发修复重试。
const PLACEHOLDER_VALUES = new Set(["示例文本", "示例内容", "示例", "xxx", "XXX", "占位"]);

function validateChapterReferenceExtract(output: ChapterReferenceExtractOutput): ChapterReferenceExtractOutput {
  // 小说章节里有场景/道具却没有任何角色，基本是模型漏掉了主角群——判无效触发修复重试。
  if (output.characters.length === 0 && (output.scenes.length > 0 || output.props.length > 0)) {
    throw new Error("参考文本里有人物活动，characters 不能为空。");
  }
  for (const group of [output.characters, output.scenes, output.props, output.worldview] as Array<Array<{ name: string; description?: string }>>) {
    const names = group.map((item) => item.name.trim());
    if (names.some((name) => !name)) {
      throw new Error("提取条目的名称不能为空。");
    }
    if (new Set(names).size !== names.length) {
      throw new Error("同一类提取条目不能重名。");
    }
    for (const item of group) {
      const description = item.description ?? "";
      if (PLACEHOLDER_VALUES.has(item.name.trim()) || PLACEHOLDER_VALUES.has(description.trim())) {
        throw new Error("提取条目不能是占位内容。");
      }
    }
  }
  return output;
}

export const chapterReferenceExtractPrompt: PromptAsset<ChapterReferenceExtractPromptInput, ChapterReferenceExtractOutput> = {
  id: "novel.chapter.reference_extract",
  version: "v3",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  contextPolicy: { maxTokensBudget: 3000 },
  outputSchema: chapterReferenceExtractSchema,
  repairPolicy: { maxAttempts: 1 },
  render: (input) => [
    new SystemMessage([
      "你是中文网文设定编辑：从用户提供的参考小说正文（referenceText）中提取设定建议，供用户确认后创建为项目设定。",
      "忽略非正文内容：书名、章节标题行、作者感言、求票求收藏等元信息不参与提取。",
      "原则是宁多勿漏：建议列表由用户逐条挑选确认，漏提比多提更影响使用。只提取原文明确出现或可直接推断的内容，不虚构；名字保留原文写法。",
      "",
      "characters＝出场角色（凡是原文里有名字或有台词的角色都要提取，含只出现一次的有名配角，role 可用「配角」）。只要原文里有人物，characters 绝不能是空数组：",
      "- name＝原文人名；role＝身份定位（男主/女主/反派/导师/配角等）。",
      "- appearance＝外貌一句话：性别、年龄段、体型、发色发型、穿着、标志性特征合并成一句，按原文与常理推测。",
      "- personality＝性格一句话（按言行推测）。",
      "- imagePrompt＝角色画面提示词（中文，80～150 字）：以全身像可直接作画为准，写清性别年龄段、发型发色、五官特点、体型、服装配饰、气质神态；不要写动作场景。",
      "- voicePrompt＝音色提示词（中文，30～60 字）：音高（低沉/清亮）、音质（沙哑/柔/冷）、说话气质（如 急躁少年音/疲惫沙哑的中年男声），按角色身份与言行推测。",
      "",
      "scenes＝场景地点（每个独立空间都算）：name＝地点名；description＝环境特征与用途一句话；imagePrompt＝环境画面提示词（中文，60～120 字）：时间（白天/黑夜）、天气、光线、空间结构、氛围。",
      "props＝重要道具（武器/信物/关键物品，路人杂物不算）：name＝物品名；description＝用途与来历一句话；imagePrompt＝实物画面提示词（中文，40～80 字）。",
      "worldview＝世界观条目：力量体系、金手指/系统、势力组织、关键规则、时代背景等（name＝条目名，description＝一句话说明），不需要提示词。",
      "",
      "外观状态变化（重要）：existingAssets 列出了项目里已有的资产和它们的当前外观状态。",
      "- 提取到的条目若与已有资产同名：不要当成新资产重复提取字段的基准，而是对照该资产当前状态——若本章原文出现了重大外观变化（换装、受伤/残疾、形象改造、场景昼夜或天气剧变、道具损坏等），这条要输出 stateLabel（状态短名，如「警察制服」「断臂」「黑夜」「破损」，2～8 字）与 stateNote（变化说明：发生了什么、相对上一状态变了哪里，一句话），并且这一条的 imagePrompt/voicePrompt 直接写**新状态下**的画面与音色；只是情节推进、表情情绪、小装饰变化不算状态变化，不写 stateLabel。",
      "- 新资产（existingAssets 里没有同名）一律不写 stateLabel/stateNote，提示词写初始形象。",
      "- 已有资产本章没有外观变化的，也要出现在建议列表里（让用户知道本章它出场了），但不带 stateLabel。",
      "",
      "每类上限：characters 16、scenes 16、props 12、worldview 16；原文里确实没有的类别返回空数组。",
      "严禁把「示例文本」等占位内容原样输出——每一条都必须来自原文。所有内容用中文。只输出严格 JSON。",
    ].join("\n")),
    new HumanMessage(JSON.stringify(input, null, 2)),
  ],
  postValidate: validateChapterReferenceExtract,
};
