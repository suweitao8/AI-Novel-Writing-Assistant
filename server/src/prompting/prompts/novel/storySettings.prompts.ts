// 设定中心一次性设定生成：依据小说想法生成角色/场景/道具/世界观（含关键设定与地图地点）。
// 短篇与简易通道共用；已有导演世界观的小说传入 existingWorldText 时做蒸馏而不是另起炉灶。
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import type { PromptAsset } from "../../core/promptTypes";

const characterGenderSchema = z.enum(["male", "female", "other"]);
const characterAgeGroupSchema = z.enum(["child", "youth", "middle", "elder"]);

const characterSchema = z.object({
  name: z.string().min(1).max(40),
  role: z.string().min(2).max(60),
  gender: characterGenderSchema.optional(),
  ageGroup: characterAgeGroupSchema.optional(),
  physique: z.string().min(2).max(120).optional(),
  personality: z.string().min(4).max(300),
  appearance: z.string().min(4).max(300).optional(),
  attireStyle: z.string().min(2).max(200).optional(),
  // 纯面部特征锚点（用于角色立绘）：[性别]，[年龄段]，[发型发色]，[眼睛特征]，[肤色]，[脸型]，禁止包含服装。
  facePrompt: z.string().min(8).max(300).optional(),
  background: z.string().min(4).max(400).optional(),
}).strict();

const sceneSchema = z.object({
  name: z.string().min(2).max(40),
  sceneType: z.enum(["interior", "exterior", "nature"]).optional(),
  summary: z.string().min(4).max(300),
  significance: z.string().min(4).max(300),
  // 360° 空间环境描述：方位布局/光源/材质风格，约 220-320 字，不含人物。
  environmentPrompt: z.string().min(30).max(600).optional(),
  mapLocationName: z.string().min(2).max(40),
}).strict();

const propTypeSchema = z.enum(["weapon", "accessory", "artifact", "document", "furniture", "object"]);

const propSchema = z.object({
  name: z.string().min(2).max(40),
  propType: propTypeSchema.optional(),
  description: z.string().min(4).max(300),
  plotFunction: z.string().min(4).max(300),
  // 视觉提示词：材质/工艺/尺寸/色泽/纹饰，80-120 字，描述固有外观，不含人物与使用场景。
  visualPrompt: z.string().min(20).max(300).optional(),
  ownerCharacterName: z.string().max(40).optional(),
  importance: z.enum(["core", "major", "minor"]),
  firstAppearHint: z.string().min(4).max(200).optional(),
}).strict();

const mapLocationSchema = z.object({
  id: z.string().min(1).max(60),
  name: z.string().min(2).max(40),
  kind: z.enum(["city", "region", "building", "wild", "other"]),
  summary: z.string().min(4).max(200),
}).strict();

const mapEdgeSchema = z.object({
  fromId: z.string().min(1).max(60),
  toId: z.string().min(1).max(60),
  label: z.string().min(1).max(40),
}).strict();

const worldSchema = z.object({
  premise: z.string().min(8).max(500),
  era: z.string().min(2).max(100),
  toneRules: z.array(z.string().min(2).max(120)).min(1).max(6),
  keySettings: z.array(z.object({
    title: z.string().min(2).max(40),
    content: z.string().min(8).max(400),
  }).strict()).min(2).max(8),
  mapLocations: z.array(mapLocationSchema).min(2).max(10),
  mapEdges: z.array(mapEdgeSchema).max(14),
}).strict();

const settingsBundleSchema = z.object({
  characters: z.array(characterSchema).min(1).max(10),
  scenes: z.array(sceneSchema).min(1).max(8),
  props: z.array(propSchema).min(1).max(8),
  world: worldSchema,
}).strict();

export interface StorySettingsBundlePromptInput {
  novelTitle: string;
  originalIdea: string;
  understanding?: string;
  genreName?: string;
  narrativeForm: "short_story" | "long_novel";
  existingWorldText?: string;
  existingCharacterSummaries?: string[];
}

export interface StorySettingsBundleOutput extends z.infer<typeof settingsBundleSchema> {}

function validateBundle(
  output: StorySettingsBundleOutput,
  input: StorySettingsBundlePromptInput,
): StorySettingsBundleOutput {
  const locationIds = new Set(output.world.mapLocations.map((location) => location.id));
  if (locationIds.size !== output.world.mapLocations.length) {
    throw new Error("世界观地图地点 id 不能重复。");
  }
  output.world.mapEdges.forEach((edge) => {
    if (!locationIds.has(edge.fromId) || !locationIds.has(edge.toId)) {
      throw new Error("世界观地图连线必须连接已存在的地点。");
    }
  });
  const locationNames = new Set(output.world.mapLocations.map((location) => location.name));
  output.scenes.forEach((scene) => {
    if (!locationNames.has(scene.mapLocationName)) {
      throw new Error(`场景「${scene.name}」引用的地图地点不存在。`);
    }
  });
  const characterNames = new Set(output.characters.map((character) => character.name));
  output.props.forEach((prop) => {
    if (prop.ownerCharacterName && !characterNames.has(prop.ownerCharacterName)) {
      throw new Error(`道具「${prop.name}」的持有角色不在角色列表中。`);
    }
  });
  if (input.narrativeForm === "short_story" && output.characters.length > 6) {
    throw new Error("短篇的角色数量应控制在 6 个以内。");
  }
  return output;
}

export const storySettingsBundlePrompt: PromptAsset<
  StorySettingsBundlePromptInput,
  StorySettingsBundleOutput
> = {
  id: "novel.story_settings.bundle",
  version: "v1",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  contextPolicy: { maxTokensBudget: 6000 },
  outputSchema: settingsBundleSchema,
  repairPolicy: { maxAttempts: 1 },
  render: (input) => [
    new SystemMessage([
      "你是中文小说的设定主编，负责在动笔之前把故事的地基打牢：人物、地点、关键道具和世界观。",
      "设定要服务于故事而不是炫技：每一项都必须能在正文中被用到、被看见，服务于主角的冲突与变化。",
      "角色：给出姓名、性别、年龄段（child/youth/middle/elder）、身份定位、体型、性格（含说话方式与行动倾向）、外貌、默认着装、背景与面部锚点。facePrompt 按「[性别]，[年龄段]，[发型发色]，[眼睛特征]，[肤色]，[脸型]」模板写纯面部特征，禁止包含服装，用于角色立绘生成。主角必须有清晰的欲望与阻力；配角要有明确的剧情功能，不写没有用途的路人。姓名随机起，符合题材与世界观气质，不要与已有角色重名。",
      "场景（地点场景）：故事实际发生的地方。每个场景写清类型（interior 室内/exterior 室外/nature 自然）、环境氛围与它在故事中的作用（为什么故事要在这里发生），并给出 environmentPrompt：一段 220～320 字的完整空间环境描述，覆盖正面/左侧/右侧/背面的可见布局、光源与材质风格，不含人物与临时道具，缺失的信息要合理补全。场景必须挂在地图地点上。",
      "关键道具：推动剧情或承载伏笔的具体物品。写清类型（weapon/accessory/artifact/document/furniture/object）、外观来历、剧情功能（用于什么转折/伏笔）、持有者与重要度，并给出 visualPrompt：80～120 字的固有外观描述，必须包含材质、工艺、尺寸、色泽、纹饰，不含人物、使用场景与临时状态。不要罗列无关紧要的日常物品。",
      "世界观：一段前提（这个世界的基本图景与核心张力）、时代背景、基调规则（不超过 6 条）、2～8 条关键设定（力量体系/社会规则/核心禁忌等，每条独立成段并可回看）。",
      "地图：2～10 个地点组成的世界骨架（城市/区域/建筑/荒野等），用不超过 14 条连线描述地点之间的 reachability 与关系。地点名要具体可感，不要「东方大陆」这种空壳。",
      "数量克制：短篇 1～6 个角色、2～5 个场景、1～4 个道具；长篇可适当放宽但仍在 schema 上限内。宁缺毋滥。",
      "所有内容用中文，符合网文阅读习惯，避免翻译腔与设定堆砌。",
      "如果提供了已有世界观文本（existingWorldText），你的任务是基于它蒸馏提炼：保留其核心设定与地名，补充缺失的地图骨架与关键设定条目，不要推翻已有设定另起炉灶。",
      "只输出严格 JSON。",
    ].join("\n")),
    new HumanMessage(JSON.stringify(input, null, 2)),
  ],
  postValidate: validateBundle,
};


// 实体级 AI 生成：用户给一句提示（如「男大学生」），AI 生成完整实体草稿供预览编辑。
// 草稿不直接落库；与 bundle 共用字段模板（面部锚点/环境提示词/视觉提示词）。
export interface StoryEntityGeneratePromptInput {
  novelTitle: string;
  genreName?: string;
  entityType: "character" | "scene" | "prop";
  hint?: string;
  worldPremise?: string;
  existingCharacters?: string[];
  existingScenes?: string[];
  existingProps?: string[];
}

const entityDraftSchema = z.object({
  character: z.object({
    name: z.string().min(1).max(40),
    role: z.string().min(2).max(60),
    gender: characterGenderSchema,
    ageGroup: characterAgeGroupSchema,
    physique: z.string().min(2).max(120),
    personality: z.string().min(4).max(300),
    appearance: z.string().min(4).max(300),
    attireStyle: z.string().min(2).max(200),
    facePrompt: z.string().min(8).max(300),
    background: z.string().min(4).max(400),
  }).strict().nullable(),
  scene: z.object({
    name: z.string().min(2).max(40),
    sceneType: z.enum(["interior", "exterior", "nature"]),
    summary: z.string().min(4).max(300),
    significance: z.string().min(4).max(300),
    environmentPrompt: z.string().min(30).max(600),
  }).strict().nullable(),
  prop: z.object({
    name: z.string().min(2).max(40),
    propType: propTypeSchema,
    description: z.string().min(4).max(300),
    plotFunction: z.string().min(4).max(300),
    visualPrompt: z.string().min(20).max(300),
    importance: z.enum(["core", "major", "minor"]),
    firstAppearHint: z.string().min(4).max(200).optional(),
  }).strict().nullable(),
}).strict();

export interface StoryEntityGenerateOutput extends z.infer<typeof entityDraftSchema> {}

function validateEntityDraft(
  output: StoryEntityGenerateOutput,
  input: StoryEntityGeneratePromptInput,
): StoryEntityGenerateOutput {
  const filled = [output.character, output.scene, output.prop].filter(Boolean);
  if (filled.length !== 1) {
    throw new Error("实体草稿必须且只能包含请求的那一类实体。");
  }
  if (input.entityType === "character" && !output.character) {
    throw new Error("请求的是角色，但草稿里没有角色。");
  }
  if (input.entityType === "scene" && !output.scene) {
    throw new Error("请求的是场景，但草稿里没有场景。");
  }
  if (input.entityType === "prop" && !output.prop) {
    throw new Error("请求的是道具，但草稿里没有道具。");
  }
  if (input.entityType === "character") {
    // 服务端会把已有角色整理成「名字（身份）」格式，比较时剥离括号后缀取纯名字。
    const names = new Set((input.existingCharacters ?? []).map((item) => item.replace(/（[^）]*）$/, "").trim()));
    if (names.has(output.character!.name)) {
      throw new Error("生成的角色姓名与已有角色重复，请换一个名字。");
    }
  }
  if (input.entityType === "scene" && (input.existingScenes ?? []).includes(output.scene!.name)) {
    throw new Error("生成的场景名与已有场景重复，请换一个名字。");
  }
  if (input.entityType === "prop" && (input.existingProps ?? []).includes(output.prop!.name)) {
    throw new Error("生成的道具名与已有道具重复，请换一个名字。");
  }
  return output;
}

export const storyEntityGeneratePrompt: PromptAsset<
  StoryEntityGeneratePromptInput,
  StoryEntityGenerateOutput
> = {
  id: "novel.story_settings.entity.generate",
  version: "v1",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  contextPolicy: { maxTokensBudget: 4000 },
  outputSchema: entityDraftSchema,
  repairPolicy: { maxAttempts: 1 },
  render: (input) => [
    new SystemMessage([
      "你是中文小说的设定助手，负责按用户的一句话提示现场生成一个完整的设定实体草稿。",
      "用户提示可能很具体（「男大学生」）也可能很模糊或为空；提示里明确的约束（性别、年龄段、职业、身份、风格）必须遵守，没提到的信息由你合理发明，不要反问。",
      "角色：随机起一个符合题材与世界气质的中文姓名（不与已有角色重名）；给出性别、年龄段（child/youth/middle/elder）、身份定位、体型、性格（含说话方式与行动倾向）、外貌、默认着装、背景。",
      "角色的 facePrompt 是角色立绘的面部锚点，必须按「[性别]，[年龄段]，[发型发色]，[眼睛特征]，[肤色]，[脸型]」模板写纯面部特征，禁止出现任何服装信息。",
      "场景：给出场景名、类型（interior 室内/exterior 室外/nature 自然）、氛围概述、故事作用，以及 environmentPrompt——一段 220～320 字的完整空间环境描述，覆盖正面/左侧/右侧/背面的可见布局、光源与材质风格，不含人物与临时道具；缺失的信息要合理补全，不要写「未提及」。",
      "道具：给出名称、类型（weapon 兵器/accessory 饰品/artifact 法器·神器/document 文书/furniture 家具/object 其他)、外观来历、剧情功能、重要度，以及 visualPrompt——80～120 字的固有外观描述，必须包含材质、工艺、尺寸、色泽、纹饰，不含人物、使用场景与临时状态。",
      "生成的实体要融入这本书的题材、世界观与已有角色阵容：风格一致、能发生互动，不要游离在故事之外。",
      "所有内容用中文，符合网文阅读习惯。只输出严格 JSON：character/scene/prop 三个字段中，只有请求的那一类填对象，其余必须是 null。",
    ].join("\n")),
    new HumanMessage(JSON.stringify(input, null, 2)),
  ],
  postValidate: validateEntityDraft,
};
