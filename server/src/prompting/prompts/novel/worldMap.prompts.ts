// 地图场景标注：把未标注的场景资产放到三层地图（世界=国家分布 → 国家=城市分布 → 城市=具体地点）上。
// 标注直接落库：只新增国家/城市/地点节点，不改动已有节点、地形与人工布局；无法定位的场景标记 unmappable，下次跳过。
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

const mapAnnotationSchema = z.object({
  // 需要新建的国家（世界画布坐标）；已有的国家复用名字，不要出现在这里。
  newCountries: z.array(countryDraftSchema).max(12),
  // 需要新建的城市（国家画布坐标）；countryName 可指向已有国家或 newCountries 里的新国家。
  newCities: z.array(cityDraftSchema).max(24),
  // 场景放置：一律放进某个城市的城内画布；坐标是该城市内部画布上的位置。
  placements: z.array(placementSchema).max(100),
  // 无法定位的场景：名字过于笼统（如「街道」）或描述不足以判断归属时放这里，不要硬猜。
  unplaceable: z.array(unplaceableSchema).max(100),
}).strict();

export interface WorldMapAnnotatePromptInput {
  novelTitle: string;
  era?: string;
  // 现有地图树（按 国家→城市 折叠；地点数量用于让 AI 感知已有布局密度）。
  existingCountries?: Array<{
    name: string;
    cities: Array<{ name: string; placeCount: number }>;
  }>;
  // 待标注场景（已标注与已标记 unmappable 的不会传进来）。
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
  return output;
}

export const worldMapAnnotatePrompt: PromptAsset<WorldMapAnnotatePromptInput, WorldMapAnnotateOutput> = {
  id: "novel.world.map_annotate",
  version: "v1",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  contextPolicy: { maxTokensBudget: 4000 },
  outputSchema: mapAnnotationSchema,
  repairPolicy: { maxAttempts: 1 },
  render: (input) => [
    new SystemMessage([
      "你是小说故事地图的标注员：把场景资产按 国家 → 城市 → 城内地点 三层放到地图上。",
      "地图分三层画布：世界画布摆国家的相对位置；每个国家有自己的画布摆城市；每个城市有自己的画布摆具体地点（场景）。",
      "existingCountries 是已有的地图结构：优先把场景放进已有的国家和城市（名字要完全一致），确实缺再在 newCountries/newCities 里新建。",
      "场景依据名字与 summary 判断归属：说明里通常写明了它是什么样的场所、属于哪座城。",
      "坐标都是所在层画布的 0-100 平面百分比：同一层内各点要分散（任意两点至少相距 6 个单位），按地理逻辑布局，留出名字标注空间。",
      "newCountries 的 x/y 是世界画布坐标；newCities 的 x/y 是所属国家画布上的坐标；placements 的 x/y 是所属城市画布上的坐标。",
      "无法定位的场景放 unplaceable：名字是泛称（「街道」「野外」）、描述信息不足、或剧情空间不明确时不要硬猜，给出简短原因。",
      "每个待标注场景必须出现在 placements 或 unplaceable 之一，不能遗漏。",
      "所有内容用中文。只输出严格 JSON。",
    ].join("\n")),
    new HumanMessage(JSON.stringify(input, null, 2)),
  ],
  postValidate: validateAnnotation,
};
