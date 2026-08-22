// 漫剧工作室「参考」页签「解析」：一次大模型调用同时产出两份成果（2026-08-20
// 起由原来的初稿/提取两个并行调用合并而来——参考文本量不大，合并省一半输入）：
// 1. segments＝分镜式初稿（每个单元两行：分镜画面 + 旁白/角色台词），
//    切换标记由服务端按 scene/stateSwitches 序列化：【场景：地点】【角色状态：名字：状态】；
//    美术风格不进初稿（画风由设定·美术风格的默认风格决定）。
// 2. characters/scenes/props/worldview＝本章设定提取建议，随章节持久化，
//    前端「提取」页签逐条核对/修改后点「应用」创建（不批量、不自动写入）。
// 两份成果共享同一份原文，人物与场景天然对齐。
// v3（2026-08-21）：storyboard/说话人必须用角色本名、禁亲属称谓等代称（下游按名字挂
// 角色参考图），且 storyboard 写明人物位置与姿态、同场景内位置连贯——用户实测称谓
// 会导致画面挂不上对应角色形象、人物在镜头间无故换位。
// v4（2026-08-21）：登记过外观状态的角色在首次出场的分镜单元补起始状态标记——
// 开场没有基准状态，后续【角色状态】切换就没有起点（用户实测第一章开头主角无状态）。
// v5（2026-08-21）：characters 不再输出 role/身份定位——参考小说只处理成脚本，
// 定位男主/女主没有消费方（用户明确要求去掉；表单与卡片同步移除该字段）。
// v6（2026-08-21）：场景条目新增结构化 timeOfDay（早/中/晚）与 weather（晴/阴/雨），
// 三类资产的提示词统一叫「图片提示词」（用户要求：时间天气影响场景图，氛围/故事作用
// 从场景表单移除，summary/significance 仅保留 DB 列）。
// v7（2026-08-21）：场景名必须具体（带归属/特征限定，如 叶城大学宿舍）——用户实测
// 提取出「卧室」这类通用名，多场景会撞车且画面无辨识度；同一空间逐字同名，不同空间不得同名。
// v8（2026-08-22）：输入新增 characterAliases 名单（「叶晨：哥哥、晨哥」）——用户在设定里
// 登记角色别名后，原文用称呼指代角色时按名单归一成本名（storyboard/speaker/characters
// 一律写本名，别名只是识别线索，不作为 name 输出）。
// v11（2026-08-22）：图片提示词的纯内容约束再加一层——时代氛围词（末世风/玄幻感等）
// 也不写：时代氛围由系统按「时代风格」选择注入，直接写进提示词会与注入的风格打架
//（用户实测旧提示词带「写实动漫风格，纯白背景」残留）。postValidate 对三类资产的
// imagePrompt 做确定性噪音剥离（shared/utils/imagePromptPurity），模型漏写也能兜住。
// v12（2026-08-22）：gender 收敛为 male/female/other 三值（用户要求：性别要么男要么女
// 要么其他——怪物等非人角色归 other，看不出男女的也归 other，不再输出 unknown；设定
// 表单的下拉同步只剩三项，存量 unknown 数据仍被存储与路由枚举容忍）。
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import type { PromptAsset } from "../../core/promptTypes";
import { stripAssetImagePromptNoise } from "@ai-novel/shared/utils/imagePromptPurity";

const referenceParseStateSwitchSchema = z.object({
  name: z.string().min(1).max(20),
  state: z.string().min(1).max(20),
}).strict();

const referenceParseSegmentSchema = z.object({
  shot: z.enum(["大远景", "远景", "全景", "中景", "近景", "特写"]),
  storyboard: z.string().min(2).max(80),
  scene: z.string().min(1).max(30),
  speaker: z.string().min(1).max(20),
  kind: z.enum(["narration", "dialogue"]),
  mood: z.string().max(20).default(""),
  text: z.string().min(2).max(120),
  /** 角色外观状态切换：这一格起某些角色的形象发生变化（优先用 characterStates 里登记过的状态名） */
  stateSwitches: z.array(referenceParseStateSwitchSchema).max(3).default([]),
}).strict();

const referenceParseItemSchema = z.object({
  name: z.string().min(1).max(30),
  description: z.string().min(2).max(160),
  imagePrompt: z.string().max(300).optional().default(""),
}).strict();

// 场景条目在通用条目之上多两个结构化字段：时间与天气（影响场景图的光线与氛围）。
const referenceParseSceneSchema = referenceParseItemSchema.extend({
  timeOfDay: z.enum(["morning", "noon", "night"]).nullable().default(null),
  weather: z.enum(["sunny", "cloudy", "rainy"]).nullable().default(null),
}).strict();

const chapterReferenceParseSchema = z.object({
  segments: z.array(referenceParseSegmentSchema).min(8).max(18),
  characters: z.array(z.object({
    name: z.string().min(1).max(20),
    gender: z.enum(["male", "female", "other"]).default("other"),
    ageGroup: z.enum(["child", "youth", "middle", "elder"]).nullable().default(null),
    appearance: z.string().min(2).max(200),
    imagePrompt: z.string().min(2).max(300),
    voicePrompt: z.string().min(2).max(160),
  }).strict()).max(16).default([]),
  scenes: z.array(referenceParseSceneSchema).max(16).default([]),
  props: z.array(referenceParseItemSchema).max(12).default([]),
  worldview: z.array(z.object({
    name: z.string().min(1).max(30),
    description: z.string().min(2).max(160),
  }).strict()).max(16).default([]),
}).strict();

export interface ChapterReferenceParsePromptInput {
  novelTitle: string;
  chapterTitle: string;
  chapterOrder: number;
  referenceText: string;
  /** 设定中心已有的场景名（初稿与提取都优先沿用，保证与项目资产对得上） */
  existingScenes?: string[];
  /** 角色与其已登记的外观状态，格式如「李火旺：正常、重伤、癫狂」（名单第一个是初始状态）；未登记的角色不出现 */
  characterStates?: string[];
  /** 角色别名名单，格式如「叶晨：哥哥、晨哥」——原文用这些称呼指代角色时，一律归一成本名输出 */
  characterAliases?: string[];
}

export interface ChapterReferenceParseOutput extends z.infer<typeof chapterReferenceParseSchema> {}

// 弱模型可能把结构化骨架里的占位内容原样抄回来；命中即判输出无效，触发修复重试。
const PLACEHOLDER_VALUES = new Set(["示例文本", "示例内容", "示例", "xxx", "XXX", "占位"]);

function validateChapterReferenceParse(output: ChapterReferenceParseOutput): ChapterReferenceParseOutput {
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
  // 三类资产的图片提示词出口统一过纯度剥离（确定性后处理）：模型偶尔仍会漏写
  // 画风/背景/视图/时代氛围词，这里兜住，不触发重试（内容本身有效，只是多余词）。
  for (const item of [...output.characters, ...output.scenes, ...output.props]) {
    item.imagePrompt = stripAssetImagePromptNoise(item.imagePrompt ?? "");
  }
  return output;
}

export const chapterReferenceParsePrompt: PromptAsset<ChapterReferenceParsePromptInput, ChapterReferenceParseOutput> = {
  id: "novel.chapter.reference_parse",
  version: "v12",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  contextPolicy: { maxTokensBudget: 6000 },
  outputSchema: chapterReferenceParseSchema,
  repairPolicy: { maxAttempts: 1 },
  render: (input) => [
    new SystemMessage([
      "你同时担任漫剧分镜编剧和网文设定编辑：对用户粘贴的参考小说原文（referenceText，通常 2000～3000 字）做一次完整解析，在同一段故事理解的基础上产出两部分——segments（本章分镜式初稿）和 characters/scenes/props/worldview（本章设定建议）。两部分说的必须是同一份原文：人物名字、场景地点要完全一致。",
      "先剔除非正文内容：书名、章节标题行（如「第一章 xxx」）、作者感言、求票求收藏、错别字勘误等一切与剧情无关的元信息，一律不得进入任何一部分，只处理故事本体。",
      "",
      "【第一部分 segments＝分镜式初稿】",
      "把整章拆成 10～16 个分镜单元（segments 数组元素），按剧情推进排列；一个分镜单元只讲一个镜头画面，不得把多个场景塞进同一单元。",
      "每个单元由两行构成：",
      "第一行是这一格分镜的画面，由 shot 与 storyboard 组成：shot 必须选一个景别（大远景/远景/全景/中景/近景/特写）；storyboard 写这个画面里正在发生什么——谁在画面中、每个人物的位置与姿态（站/坐/躺/蹲、面向哪边、在画面中的方位）、动作与神态、所处的环境，像导演给摄影师的一句话指令，不超过 60 字。分镜是给程序读的：提到角色必须写角色的本名（与 characters 提取的 name 一致，如「叶竹」），严禁用「妹妹」「哥哥」「老板」这类称谓或身份词指代角色——后续按名字给画面挂角色参考图，称谓对不上角色就画不出对应形象。同一场景里连续几格，人物的位置姿态要连贯；角色起身/坐下/躺下/走动等位置变化必须在 storyboard 里写明，不要让人物在格与格之间无故换位。",
      "第二行是这一格的内容：叙述镜头 kind=narration、speaker 固定「旁白」，text 写画面里发生的事与关键动作神态；角色开口 kind=dialogue、speaker 用原文中说话角色的本名（原文用称谓的换成本名，不写「妹妹」这类称呼），mood 写这一句说话的神态与语气（如「冷笑嘲讽」「压抑怒气」「急切」「沙哑低语」，2～8 字）——它会作为后续配音的情绪提示，只写听得出的语气，不写纯视觉描写；没有明显情绪就留空。text 是这句台词——紧凑口语，不逐字照搬原文。原文对角色的称呼若出现在 characterAliases 名单里（如名单「叶晨：哥哥、晨哥」而原文写「哥哥说」），指的就是该本名角色，storyboard/speaker 一律写本名；名单只是识别线索，任何输出里都不用别名当角色名。",
      "scene 是这一格所在的场景（具体到独立空间）：优先使用 existingScenes 名单里的名字（画面发生在名单场景就用名单名，不要另起同义名）；名单没有的按原文起**具体名**——带上归属或特征限定（如 叶城大学宿舍/林川的卧室/医院走廊/老城区天台），不要只写 卧室/客厅/街道 这类通用词：一本书里常有多个卧室、多条街道，通用名会撞车、画面也没有辨识度，一般 4～12 字。同一空间的单元 scene 必须逐字同名；不同空间不得起同一个名字。地点变了才换新值——初稿会按 scene 的变化生成「【场景：…】」换场标记，后续分镜与视频生成按它切换场景。",
      "stateSwitches 是角色外观状态切换。每个在 characterStates 里登记过状态、且本章出场的角色，必须在其首次出场的分镜单元先补一条起始 {name,state}：默认写该角色名单里的第一个状态（即初始形象），本章开场就明显处于其他登记状态（如开场已重伤）才写那个状态——开场不给基准状态，后续的状态切换就没有起点。没登记过状态的角色不补起始标记，也不要为它编造状态。之后形象从某一格起发生显著且持续的变化（重伤、变身、换装、沾血、形态切换）再追加 {name,state}；state 优先用 characterStates 里该角色登记过的状态名（逐字一致），没登记过的按原文起 2～6 字短状态名；只写发生变化的角色，恢复原状时写回原状态名。初稿会按它生成「【角色状态：名字：状态】」标记，后续画面按它切换角色形象。",
      "台词逐句归属到说话角色，不得改名、不得把台词归到别人名下；旁白优先有画面感的内容（动作神态、场景环境、有视觉冲击的瞬间），纯心理独白和重复铺垫删掉。保留原文主线（开端、关键冲突、转折、结尾钩子）；不得虚构原文没有的重大事件或人物。",
      "",
      "【第二部分设定建议＝characters/scenes/props/worldview】供用户确认后创建为项目设定，原则是宁多勿漏：建议列表由用户逐条挑选确认，漏提比多提更影响使用。只提取原文明确出现或可直接推断的内容，不虚构；名字保留原文写法。",
      "characters＝出场角色（凡是原文里有名字或有台词的角色都要提取，含只出现一次的有名配角）。只要原文里有人物，characters 绝不能是空数组，且必须覆盖 segments 里出现过的全部说话角色与 storyboard 里点名出现的角色。只登记做视频要用的字段（外貌体型、画面与音色提示词），不判断剧情定位：",
      "- name＝原文人名。",
      "- gender/ageGroup 是结构化字段，应用时会分别填进设定的性别、年龄段：gender 按 male/female/other 输出（原文可推断就给准确值；怪物等非人角色与看不出男女的用 other，不输出 unknown）；ageGroup 按 child（少年/儿童）/youth（青年）/middle（中年）/elder（老年）输出，原文写不出年龄段就填 null。",
      "- appearance＝外貌体型一句话：体型（高瘦/娇小/壮实/魁梧）、发型发色、五官特点、穿着、标志性特征——性别与年龄段已在结构化字段里，不在此重复（2026-08-20 起 physique/personality 不再单列：做视频只关注画面与音色提示词，属性从简）。",
      "- imagePrompt＝图片提示词（角色形象，中文，80～150 字）：只写「这个人长什么样」——性别年龄段、发型发色、五官特点（脸型/眼睛/肤色，如 黑色短发、瓜子脸、丹凤眼）、体型、服装配饰、气质神态，照着就能画出这个人。画风、背景、视图、时代氛围一律由系统统一管理，提示词里禁止出现：画风/风格/渲染类词（写实、动漫、CG、3D、虚幻引擎、高清等），背景类词（纯白背景、白底、透明背景等），视图/构图规格（全身像、四视图、特写、正面等），时代/画风氛围词（末世风格、末世感、玄幻氛围这类——生成时按所选时代风格自动注入，写了反而互相打架）；也不要写动作场景。",
      "- voicePrompt＝音色提示词（中文，30～60 字）：音高（低沉/清亮）、音质（沙哑/柔/冷）、说话气质（如 急躁少年音/疲惫沙哑的中年男声），按角色身份与言行推测。",
      "scenes＝场景地点（每个独立空间都算）：name＝具体地点名——与 segments 里用的 scene 名逐字一致，带归属或特征限定（如 叶城大学宿舍，不写 卧室 这类通用词，一般 4～12 字），已有的 existingScenes 名单优先沿用；description＝环境特征一句话（列表摘要用）；timeOfDay/weather 是结构化字段：时间按 morning（早上）/noon（中午）/night（晚上）输出、天气按 sunny（晴天）/cloudy（阴天）/rainy（雨天）输出——按这个场景在原文里的常态推断（一个场景多次出现就按主要时段），原文写不出就填 null；imagePrompt＝图片提示词（场景环境，中文，60～120 字）：光线、空间结构、材质与氛围——时间与天气已走结构化字段，不在此重复；画风与时代氛围由系统统一管理，禁止出现画风/风格/渲染类词（写实、动漫、CG、3D 等）、画幅/构图规格（全景、360 度等）与时代/画风氛围词（末世风格、玄幻氛围这类——生成时按所选时代风格自动注入）。",
      "props＝重要道具（武器/信物/关键物品，路人杂物不算）：name＝物品名；description＝用途与来历一句话；imagePrompt＝图片提示词（道具实物，中文，40～80 字）：只写这一件道具本身——材质、颜色、造型比例、工艺细节、磨损痕迹、表面文字图案等，写具体写满，它是成图的唯一主体；道具周围的环境与其它物品（抹布、桌面、地面、附近杂物等）一律不写，它们属于场景；背景与画风由系统统一管理，禁止出现背景类词（中性背景、白底等）、画风/风格类词、视图规格（45 度透视等）与时代/画风氛围词（末世风格、玄幻氛围这类——生成时按所选时代风格自动注入）。",
      "worldview＝世界观条目：力量体系、金手指/系统、势力组织、关键规则、时代背景等（name＝条目名，description＝一句话说明），不需要提示词。",
      "每类上限：characters 16、scenes 16、props 12、worldview 16；原文里确实没有的类别返回空数组。外观状态不在解析环节生成（用户手动管理），提示词一律写资产当前的初始形象。",
      "严禁把「示例文本」等占位内容原样输出——每一条都必须来自原文。所有内容用中文。只输出严格 JSON。",
    ].join("\n")),
    new HumanMessage(JSON.stringify(input, null, 2)),
  ],
  postValidate: validateChapterReferenceParse,
};
