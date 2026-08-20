// 世界地图生成：依据世界观前提/关键设定/场景名单（可为空，空时按书名自由构思）产出带平面坐标的世界地图草稿。
// 草稿不落库，用户在地图工作台里预览、微调（拖拽/增删）后才保存进 NovelSettingsWorld.mapJson。
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import type { PromptAsset } from "../../core/promptTypes";

const mapNodeKindSchema = z.enum(["city", "region", "building", "wild", "other"]);
const mapNodeTierSchema = z.enum(["capital", "city", "town", "landmark"]);

const mapLocationSchema = z.object({
  name: z.string().min(2).max(40),
  kind: mapNodeKindSchema,
  summary: z.string().min(4).max(200),
  // 平面坐标（0-100），由 AI 按地理逻辑布局；前端渲染成 SVG 地图并允许拖拽微调。
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
  tier: mapNodeTierSchema.optional(),
}).strict();

const mapPathSchema = z.object({
  fromName: z.string().min(2).max(40),
  toName: z.string().min(2).max(40),
  label: z.string().min(1).max(40),
}).strict();

const worldMapSchema = z.object({
  // 地图总述：一段话讲清这个世界的整体地理格局（方位、势力分布、危险区域）。
  overview: z.string().min(8).max(400),
  locations: z.array(mapLocationSchema).min(3).max(12),
  paths: z.array(mapPathSchema).max(16),
}).strict();

export interface WorldMapPromptInput {
  novelTitle: string;
  premise?: string;
  era?: string;
  toneRules?: string[];
  keySettings?: Array<{ title: string; content: string }>;
  existingLocations?: Array<{ name: string; kind: string; summary: string }>;
  sceneNames?: string[];
  characterNames?: string[];
}

export interface WorldMapOutput extends z.infer<typeof worldMapSchema> {}

function validateWorldMap(output: WorldMapOutput): WorldMapOutput {
  const names = output.locations.map((location) => location.name.trim());
  if (new Set(names).size !== names.length) {
    throw new Error("地图地点名不能重复。");
  }
  if (names.some((name) => !name)) {
    throw new Error("地图地点名不能为空。");
  }
  const nameSet = new Set(names);
  const seenPairs = new Set<string>();
  output.paths.forEach((path) => {
    if (!nameSet.has(path.fromName) || !nameSet.has(path.toName)) {
      throw new Error("地图连线必须连接已存在的地点。");
    }
    if (path.fromName === path.toName) {
      throw new Error("地图连线不能指向自身。");
    }
    const pairKey = [path.fromName, path.toName].sort().join("\u0000");
    if (seenPairs.has(pairKey)) {
      throw new Error("地图连线不能重复。");
    }
    seenPairs.add(pairKey);
  });
  // 坐标要分散：任意两点不能几乎重叠（<6 个坐标单位），否则标签会叠在一起。
  for (let i = 0; i < output.locations.length; i += 1) {
    for (let j = i + 1; j < output.locations.length; j += 1) {
      const a = output.locations[i];
      const b = output.locations[j];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      if (distance < 6) {
        throw new Error(`地点「${a.name}」与「${b.name}」坐标过于接近，请重新布局。`);
      }
    }
  }
  return output;
}

export const worldMapPrompt: PromptAsset<WorldMapPromptInput, WorldMapOutput> = {
  id: "novel.world.map",
  version: "v2",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  contextPolicy: { maxTokensBudget: 3000 },
  outputSchema: worldMapSchema,
  repairPolicy: { maxAttempts: 1 },
  render: (input) => [
    new SystemMessage([
      "你是中文网文的世界地图设计师：在世界观成立的前提下，规划一张故事世界的平面地图。",
      "如果没有提供 premise、keySettings、existingLocations、sceneNames 或 characterNames，说明世界观尚未整理：依据 novelTitle 与 era 自行构思一个适合展开长篇故事的世界（含势力格局与冲突点），再规划地图，不要因为输入为空而拒绝或敷衍。",
      "地点要具体可感（有名字、有功能、有故事价值），覆盖核心势力与故事主要区域；不要「东方大陆」「某国」这类空壳地名。",
      "kind 含义：city 城市 / region 大区域 / building 具体建筑 / wild 荒野或危险区 / other 其他。tier 表示规模：capital 中心 / city 大 / town 小 / landmark 地标。总量 3～12 个，宁精勿滥。",
      "x/y 是 0-100 的平面坐标：按地理逻辑布局（主城居中偏心、荒野靠边、卫星城镇环绕），任意两点至少相距 6 个单位，重要地点之间留出标注空间。",
      "overview 用一段话描述整体地理格局：方位关系、势力分布、危险区域在哪，让读者不用看图也能想象这个世界。",
      "paths 描述地点之间的通路或关系（商路/国道/秘径/对立防线），每条一句话（如「南下商路」），最多 16 条。",
      "keySettings 里的力量体系、禁忌与规则要体现在地名与 summary 中（例如丧尸围城的世界要有安全区与失陷区）。",
      "如果提供了 existingLocations，说明地图已有人工整理：必须保留这些地点（名称不变，可以微调坐标），在它们之间补充缺失区域并重新布局全局坐标；paths 优先沿用既有地点间的通路。",
      "所有内容用中文。只输出严格 JSON。",
    ].join("\n")),
    new HumanMessage(JSON.stringify(input, null, 2)),
  ],
  postValidate: validateWorldMap,
};
