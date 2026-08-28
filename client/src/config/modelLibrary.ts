/**
 * 模型库目录：内置常用模型的静态清单。
 *
 * 模型文件放在 client/public/models/ 下由前端静态服务；目录只是数据，
 * 不做任何运行时探测。unitScale 把源文件几何单位换算成米——
 * Cine57 走 FBX2glTF 转换时已经把 UE 厘米换算成米，这里保持 1。
 */

export interface ModelLibraryEntry {
  id: string;
  name: string;
  category: string;
  fileName: string;
  fileUrl: string;
  unitScale: number;
  source: string;
  sizeKb: number;
}

export const MODEL_LIBRARY_CATEGORIES = ["厨房", "地面", "炉灶", "装饰", "背景"] as const;

const CINE57_SOURCE = "Cine57 示例包";
const FBX2GLTF_ALREADY_METERS = 1;

function cine57Model(
  id: string,
  name: string,
  category: (typeof MODEL_LIBRARY_CATEGORIES)[number],
  fileName: string,
  sizeKb: number,
): ModelLibraryEntry {
  return {
    id,
    name,
    category,
    fileName,
    fileUrl: `/models/cine57/${fileName}`,
    unitScale: FBX2GLTF_ALREADY_METERS,
    source: CINE57_SOURCE,
    sizeKb,
  };
}

export const MODEL_LIBRARY: ModelLibraryEntry[] = [
  cine57Model("food-shipment-01a", "食材组合 A", "厨房", "SM_FoodShipmentSet_01a.glb", 182),
  cine57Model("food-shipment-01b", "食材组合 B", "厨房", "SM_FoodShipmentSet_01b.glb", 176),
  cine57Model("food-shipment-01c", "食材组合 C", "厨房", "SM_FoodShipmentSet_01c.glb", 244),
  cine57Model("food-shipment-01d", "食材组合 D", "厨房", "SM_FoodShipmentSet_01d.glb", 225),
  cine57Model("food-shipment-01e", "食材组合 E", "厨房", "SM_FoodShipmentSet_01e.glb", 163),
  cine57Model("rug-04a", "花纹地毯", "地面", "SM_Rug_04a.glb", 45),
  cine57Model("rugs-03a", "地毯 03A", "地面", "SM_Rugs_03a.glb", 62),
  cine57Model("rugs-03b", "地毯 03B", "地面", "SM_Rugs_03b.glb", 81),
  cine57Model("rugs-03c", "地毯 03C", "地面", "SM_Rugs_03c.glb", 83),
  cine57Model("brick-stove-1", "砖砌炉灶 · 组合", "炉灶", "SM_brick_stove_1.glb", 243),
  cine57Model("brick-stove-2", "砖砌炉灶 · 主体", "炉灶", "SM_brick_stove_2.glb", 24),
  cine57Model("brick-stove-3", "砖砌炉灶 · 部件", "炉灶", "SM_brick_stove_3.glb", 24),
  cine57Model("decorative-1", "装饰构件 1", "装饰", "SM_decorative_elements_1.glb", 20),
  cine57Model("decorative-2", "装饰构件 2", "装饰", "SM_decorative_elements_2.glb", 24),
  cine57Model("z-backdrop-01a", "纯色背景板", "背景", "SM_ZBackdrop_01a.glb", 4),
];

export function getModelLibraryEntry(id: string | undefined): ModelLibraryEntry | null {
  if (!id) return null;
  return MODEL_LIBRARY.find((entry) => entry.id === id) ?? null;
}
