// 设定中心一次性设定生成：依据小说想法生成角色/场景/道具/世界观（含关键设定与地图地点）。
// 短篇与简易通道共用；已有导演世界观的小说传入 existingWorldText 时做蒸馏而不是另起炉灶。
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import type { PromptAsset } from "../../core/promptTypes";

const characterSchema = z.object({
  name: z.string().min(1).max(40),
  role: z.string().min(2).max(60),
  personality: z.string().min(4).max(300),
  appearance: z.string().min(4).max(300).optional(),
  background: z.string().min(4).max(400).optional(),
}).strict();

const sceneSchema = z.object({
  name: z.string().min(2).max(40),
  summary: z.string().min(4).max(300),
  significance: z.string().min(4).max(300),
  mapLocationName: z.string().min(2).max(40),
}).strict();

const propSchema = z.object({
  name: z.string().min(2).max(40),
  description: z.string().min(4).max(300),
  plotFunction: z.string().min(4).max(300),
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
      "角色：给出姓名、身份定位、性格（含说话方式与行动倾向）、外貌与背景。主角必须有清晰的欲望与阻力；配角要有明确的剧情功能，不写没有用途的路人。",
      "场景（地点场景）：故事实际发生的地方。每个场景写清环境氛围与它在故事中的作用（为什么故事要在这里发生）。场景必须挂在地图地点上。",
      "关键道具：推动剧情或承载伏笔的具体物品。写清外观来历、剧情功能（用于什么转折/伏笔）、持有者与重要度。不要罗列无关紧要的日常物品。",
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
