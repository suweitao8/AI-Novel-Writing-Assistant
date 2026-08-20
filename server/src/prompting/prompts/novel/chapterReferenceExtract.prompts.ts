// 漫剧工作室「解析」：从本章参考文本提取设定建议——角色 / 场景 / 道具 / 世界观条目，
// 角色带结构化 gender/ageGroup/physique（应用时分别填进设定表单）+ 外貌/性格/画面提示词（生图）/音色提示词（配音）。
// 结果随章节持久化，前端「提取」页签逐条核对/修改后点「应用」创建（不批量、不自动写入）。
// 重复资产由前端按名称拦截（不重复创建）；外观状态不在提取环节生成（用户手动管理），
// 提示词一律写资产当前的初始形象。
// 提取策略「宁多勿漏」：建议列表由用户筛选确认，漏提比多提更影响使用。
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import type { PromptAsset } from "../../core/promptTypes";

const extractItemSchema = z.object({
  name: z.string().min(1).max(30),
  description: z.string().min(2).max(160),
  imagePrompt: z.string().max(300).optional().default(""),
}).strict();

const chapterReferenceExtractSchema = z.object({
  characters: z.array(z.object({
    name: z.string().min(1).max(20),
    role: z.string().min(1).max(12),
    gender: z.enum(["male", "female", "other", "unknown"]).default("unknown"),
    ageGroup: z.enum(["child", "youth", "middle", "elder"]).nullable().default(null),
    physique: z.string().max(40).default(""),
    appearance: z.string().min(2).max(200),
    personality: z.string().min(2).max(120),
    imagePrompt: z.string().min(2).max(300),
    voicePrompt: z.string().min(2).max(160),
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
  version: "v5",
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
      "- gender/ageGroup/physique 是结构化字段，应用时会分别填进设定的性别、年龄段、体型：gender 按 male/female/other/unknown 输出（原文可推断就给准确值，完全看不出才用 unknown）；ageGroup 按 child（少年/儿童）/youth（青年）/middle（中年）/elder（老年）输出，原文写不出年龄段就填 null；physique 写体型短词（如 高瘦/娇小/壮实/魁梧），推不出就留空串。",
      "- appearance＝外貌一句话：发型发色、五官特点、穿着、标志性特征——性别、年龄段、体型已经写在结构化字段里，这里不要再重复。",
      "- personality＝性格一句话（按言行推测）。",
      "- imagePrompt＝角色画面提示词（中文，80～150 字）：以全身像可直接作画为准，写清性别年龄段、发型发色、五官特点、体型、服装配饰、气质神态；不要写动作场景。",
      "- voicePrompt＝音色提示词（中文，30～60 字）：音高（低沉/清亮）、音质（沙哑/柔/冷）、说话气质（如 急躁少年音/疲惫沙哑的中年男声），按角色身份与言行推测。",
      "",
      "scenes＝场景地点（每个独立空间都算）：name＝地点名；description＝环境特征与用途一句话；imagePrompt＝环境画面提示词（中文，60～120 字）：时间（白天/黑夜）、天气、光线、空间结构、氛围。",
      "props＝重要道具（武器/信物/关键物品，路人杂物不算）：name＝物品名；description＝用途与来历一句话；imagePrompt＝实物画面提示词（中文，40～80 字）。",
      "worldview＝世界观条目：力量体系、金手指/系统、势力组织、关键规则、时代背景等（name＝条目名，description＝一句话说明），不需要提示词。",
      "",
      "每类上限：characters 16、scenes 16、props 12、worldview 16；原文里确实没有的类别返回空数组。",
      "严禁把「示例文本」等占位内容原样输出——每一条都必须来自原文。所有内容用中文。只输出严格 JSON。",
    ].join("\n")),
    new HumanMessage(JSON.stringify(input, null, 2)),
  ],
  postValidate: validateChapterReferenceExtract,
};
