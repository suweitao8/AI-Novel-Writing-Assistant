// 地图场景标注与生成：有未标注场景时按 国家→城市→城内地点 放置；没有场景时依据书名/世界观生成基础地图（国家+城市）。
// 结果直接落库：只新增国家/城市/地点节点，不改动已有节点、地形与人工布局；无法定位的场景标记 unmappable，下次跳过。
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import type { PromptAsset } from "../../core/promptTypes";

const countryDraftSchema = z.object({
  name: z.string().min(2).max(40),
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
  summary: z.string().max(200).optional(),
}).strict();

const cityDraftSchema = z.object({
  name: z.string().min(2).max(40),
  countryName: z.string().min(2).max(40),
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
  summary: z.string().max(200).optional(),
}).strict();

const placementSchema = z.object({
  sceneName: z.string().min(1).max(60),
  countryName: z.string().min(2).max(40),
  cityName: z.string().min(2).max(40),
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
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
  // 需要新建的国家（世界画布坐标）；已有的国家复用名字，不要出现在这里。
  newCountries: z.array(countryDraftSchema).max(12),
  // 需要新建的城市（国家画布坐标）；countryName 可指向已有国家或 newCountries 里的新国家。
  newCities: z.array(cityDraftSchema).max(24),
  // 场景放置：一律放进某个城市的城内画布；坐标是该城市内部画布上的位置。
  placements: z.array(placementSchema).max(100),
  // 无法定位的场景：名字过于笼统（如「街道」）或描述不足以判断归属时放这里，不要硬猜。
  unplaceable: z.array(unplaceableSchema).max(100),
  // 世界层地形分区（仅生成模式输出）：粗多边形圈出 平原/山地/海洋 的大致范围。
  terrain: z.array(terrainDraftSchema).max(8),
}).strict();

export interface WorldMapAnnotatePromptInput {
  novelTitle: string;
  premise?: string;
  era?: string;
  keySettings?: Array<{ title: string; content: string }>;
  // 现有地图树（按 国家→城市 折叠；地点数量用于让 AI 感知已有布局密度）。
  existingCountries?: Array<{
    name: string;
    cities: Array<{ name: string; placeCount: number }>;
  }>;
  // 待标注场景（已标注与已标记 unmappable 的不会传进来）；可能为空——空时按书名/世界观生成基础地图。
  scenes: Array<{ name: string; summary: string }>;
}

export interface WorldMapAnnotateOutput extends z.infer<typeof mapAnnotationSchema> {}

function validateAnnotation(output: WorldMapAnnotateOutput, input: WorldMapAnnotatePromptInput): WorldMapAnnotateOutput {
  const sceneNames = new Set(input.scenes.map((scene) => scene.name.trim()));
  const knownCountry = (name: string) =>
    (input.existingCountries ?? []).some((country) => country.name === name.trim())
    || output.newCountries.some((country) => country.name.trim() === name.trim());
  const assertUnique = (keys: Array<[string, string]>) => {
    const seen = new Set<string>();
    for (const [key, label] of keys) {
      const trimmed = key.trim();
      if (seen.has(trimmed)) {
        throw new Error(`标注结果里「${trimmed}」重复了（${label}），请合并后重新输出。`);
      }
      seen.add(trimmed);
    }
  };
  assertUnique(output.newCountries.map((item) => [item.name, "国家"] as [string, string]));
  assertUnique(output.newCities.map((item) => [`${item.countryName}\u0000${item.name}`, "同一国家下的城市"] as [string, string]));
  const decided = new Set<string>();
  for (const placement of output.placements) {
    if (!sceneNames.has(placement.sceneName.trim())) {
      throw new Error(`场景「${placement.sceneName}」不在待标注名单里。`);
    }
    if (!knownCountry(placement.countryName)) {
      throw new Error(`场景「${placement.sceneName}」指向的国家「${placement.countryName}」不存在，请先在 newCountries 里给出。`);
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
  // 空地图空场景的「生成」模式：必须给出至少一个国家，否则调用方拿到的地图与之前完全一样。
  if (input.scenes.length === 0 && (input.existingCountries ?? []).length === 0 && output.newCountries.length === 0) {
    throw new Error("还没有场景也没有已有国家时，必须至少规划一个国家。");
  }
  // 地形只在生成模式输出；标注模式（有场景/已有国家）不允许动地形。
  if ((input.scenes.length > 0 || (input.existingCountries ?? []).length > 0) && output.terrain.length > 0) {
    throw new Error("标注已有地图时不允许输出地形分区（terrain 必须为空）。");
  }
  return output;
}

export const worldMapAnnotatePrompt: PromptAsset<WorldMapAnnotatePromptInput, WorldMapAnnotateOutput> = {
  id: "novel.world.map_annotate",
  version: "v3",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  contextPolicy: { maxTokensBudget: 4000 },
  outputSchema: mapAnnotationSchema,
  repairPolicy: { maxAttempts: 1 },
  render: (input) => [
    new SystemMessage([
      "你是小说故事地图的规划与标注员：维护 国家 → 城市 → 城内地点 三层地图。",
      "地图分三层画布：世界画布摆国家的相对位置；每个国家有自己的画布摆城市；每个城市有自己的画布摆具体地点（场景）。",
      "【命名风格是最重要的硬约束】所有地名必须与 era/premise/keySettings 给出的世界观风格一致：现代/近未来世界用现代地名词汇（如「临江市」「南湾区」「云东新区」「望海港」——市、区、新区、开发区、港、湾、街道、CBD 这类后缀），不要出现玄幻词（荒原、联邦、群岛、王庭、宗门、秘境、帝国）；反之只有世界观本身是玄幻/古代时才用那类词。虚构地名，不使用现实中的真实城市名，但命名质感要贴近该世界观的现实感。",
      "scenes 为空（还没有场景资产）时，依据 novelTitle、premise、keySettings、era 构思一张基础地图：1～4 个国家/地区（现代故事通常一个国家内的多个区域或城市圈就够，不要硬凑多国；架空世界才是多国格局），每区域 2～5 座主要城市，此时只输出 newCountries/newCities/terrain，placements/unplaceable 留空——城内地点等场景出现后再标。",
      "生成模式必须同时用 terrain 划分世界层地形：3～8 个粗多边形大致圈出 平原（plain，主要陆地）、山地（mountain）、海洋（water）的范围，顶点 3～8 个，拼出可信的大陆轮廓；每个国家/区域的位置要落在对应的陆地多边形上。",
      "scenes 不为空时按标注处理：existingCountries 是已有的地图结构，优先把场景放进已有的国家和城市（名字要完全一致），确实缺再在 newCountries/newCities 里新建；场景依据名字与 summary 判断归属；此时 terrain 必须为空。",
      "keySettings 里的设定要体现在地名与 summary 中，但同样服从命名风格约束。",
      "坐标都是所在层画布的 0-100 平面百分比：同一层内各点要分散（任意两点至少相距 6 个单位），按地理逻辑布局，留出名字标注空间。",
      "newCountries 的 x/y 是世界画布坐标；newCities 的 x/y 是所属国家画布上的坐标；placements 的 x/y 是所属城市画布上的坐标。",
      "无法定位的场景放 unplaceable：名字是泛称（「街道」「野外」）、描述信息不足、或剧情空间不明确时不要硬猜，给出简短原因。",
      "scenes 不为空时，每个待标注场景必须出现在 placements 或 unplaceable 之一，不能遗漏。",
      "所有内容用中文。只输出严格 JSON。",
    ].join("\n")),
    new HumanMessage(JSON.stringify(input, null, 2)),
  ],
  postValidate: validateAnnotation,
};
