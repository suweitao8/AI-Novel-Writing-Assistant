// 地图场景标注：单层平面地图，把场景资产按相互位置关系摆到画布上。
// 结果直接落库：只新增地点节点，不改动已有节点、地形与人工布局；无法定位的场景标记 unmappable，下次跳过。
// 地形分区（平原/山地/水域）只在地图还没有地形时输出一次，之后只增不改。
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import type { PromptAsset } from "../../core/promptTypes";

const placementSchema = z.object({
  sceneName: z.string().min(1).max(60),
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
  // 地点类型：城市 city / 区域 region / 建筑 building / 荒野 wild / 其他 other。
  kind: z.enum(["city", "region", "building", "wild", "other"]).optional(),
}).strict();

const unplaceableSchema = z.object({
  sceneName: z.string().min(1).max(60),
  reason: z.string().min(2).max(120),
}).strict();

const terrainDraftSchema = z.object({
  type: z.enum(["plain", "mountain", "water"]),
  label: z.string().max(40).optional(),
  points: z.array(z.object({ x: z.number().min(0).max(100), y: z.number().min(0).max(100) }).strict()).min(3).max(8),
}).strict();

const mapAnnotationSchema = z.object({
  // 场景放置：坐标是画布上的绝对位置（0-100 平面百分比）。
  placements: z.array(placementSchema).max(100),
  // 无法定位的场景：名字过于笼统（如「街道」）或描述不足以判断位置时放这里，不要硬猜。
  unplaceable: z.array(unplaceableSchema).max(100),
  // 地形分区（仅当地图还没有地形时输出）：粗多边形圈出 平原/山地/水域 的大致范围。
  terrain: z.array(terrainDraftSchema).max(8),
}).strict();

export interface WorldMapAnnotatePromptInput {
  novelTitle: string;
  premise?: string;
  era?: string;
  keySettings?: Array<{ title: string; content: string }>;
  // 已在画布上的地点（人工摆过或此前标注过）：新场景要参照它们的位置关系摆放，不要挤在一起。
  existingNodes?: Array<{ name: string; x: number; y: number }>;
  // 地图是否还没有地形分区：true 时需要顺便输出 terrain，false 时 terrain 必须为空。
  terrainEmpty: boolean;
  // 待标注场景（已放上画布与已标记 unmappable 的不会传进来）。
  scenes: Array<{ name: string; summary: string }>;
}

export interface WorldMapAnnotateOutput extends z.infer<typeof mapAnnotationSchema> {}

function validateAnnotation(output: WorldMapAnnotateOutput, input: WorldMapAnnotatePromptInput): WorldMapAnnotateOutput {
  const sceneNames = new Set(input.scenes.map((scene) => scene.name.trim()));
  const decided = new Set<string>();
  for (const placement of output.placements) {
    if (!sceneNames.has(placement.sceneName.trim())) {
      throw new Error(`场景「${placement.sceneName}」不在待标注名单里。`);
    }
    decided.add(placement.sceneName.trim());
  }
  for (const item of output.unplaceable) {
    if (!sceneNames.has(item.sceneName.trim())) {
      throw new Error(`场景「${item.sceneName}」不在待标注名单里。`);
    }
    decided.add(item.sceneName.trim());
  }
  const missing = input.scenes.filter((scene) => !decided.has(scene.name.trim()));
  if (missing.length > 0) {
    throw new Error(`这些场景没有给出结论：${missing.map((scene) => scene.name).join("、")}。每个场景必须放置或标记无法定位。`);
  }
  if (!input.terrainEmpty && output.terrain.length > 0) {
    throw new Error("地图已有地形分区时不允许再输出 terrain（必须为空）。");
  }
  return output;
}

export const worldMapAnnotatePrompt: PromptAsset<WorldMapAnnotatePromptInput, WorldMapAnnotateOutput> = {
  id: "novel.world.map_annotate",
  version: "v4",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  contextPolicy: { maxTokensBudget: 4000 },
  outputSchema: mapAnnotationSchema,
  repairPolicy: { maxAttempts: 1 },
  render: (input) => [
    new SystemMessage([
      "你是小说故事地图的标注员：地图是单层平面画布，把场景资产按地理逻辑摆到画布上。",
      "任务：依据 scenes 的名字与 summary、premise/era/keySettings 的世界观信息，估算每个场景相对其他场景的位置（东/南/西/北、相邻、跨城、沿河沿海等），给出 0-100 平面百分比坐标。",
      "existingNodes 是画布上已有的地点：新场景要参照它们摆放（描述里提到相邻/同城的就靠近，跨地区的就拉开），已有位置不可更改、不可杜撰不存在的关系。",
      "摆放要求：同画布各点分散（任意两点至少相距 6 个单位），整体铺开利用画布空间，室内场景（住宅、店铺、学校内部等）用 building，城区/街区用 city，城市内区域用 region，山野郊外用 wild，拿不准用 other。",
      "无法定位的场景放 unplaceable：名字是泛称（「街道」「野外」）、描述信息不足、或剧情空间不明确时不要硬猜，给出简短原因。",
      "每个待标注场景必须出现在 placements 或 unplaceable 之一，不能遗漏。",
      "terrainEmpty=true 时（地图还没有地形分区）需要顺便输出 terrain：3～8 个粗多边形大致圈出 平原（plain，主要陆地）、山地（mountain）、水域（water，海/湖/河）的范围，顶点 3～8 个，拼出可信的地理轮廓，让场景点尽量落在合理的地形上（海边城市贴水域、山门贴山地）；terrainEmpty=false 时 terrain 必须为空数组。",
      "地形 label（如「中部平原」「望海湾」）必须贴合 era/premise/keySettings 的世界观风格：现代世界用现代词汇（市、区、湾、港、山脉），不要出现玄幻词（荒原、王庭、秘境、帝国）；反之只有世界观本身是玄幻/古代时才用那类词。虚构地名，不使用现实中的真实地名。",
      "所有内容用中文。只输出严格 JSON。",
    ].join("\n")),
    new HumanMessage(JSON.stringify(input, null, 2)),
  ],
  postValidate: validateAnnotation,
};
