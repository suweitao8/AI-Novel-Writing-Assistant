/**
 * 模型库目录：内置常用模型的静态清单。
 *
 * 模型文件放在 client/public/models/ 下由前端静态服务；目录只是数据，
 * 不做任何运行时探测。数据来自 Cine57（UE 5.7）经 FBX + FBX2glTF 的
 * 导出管线（见 docs/wiki/product/model-library.md），几何单位已是米。
 * materials 把 FBX 带出的材质资源名映射到真实贴图，运行时由
 * modelLibrary3d/modelMaterials.ts 回填到 PlayCanvas 材质上。
 */

/** 单个材质的外观声明。 */
export interface ModelMaterialInfo {
  /** 漫反射贴图 URL。 */
  baseColor?: string;
  /** 镂空透明贴图 URL（植物叶片等）。 */
  opacity?: string;
  /** 无贴图时的漫反射颜色（0-1 线性 RGB）。 */
  tint?: [number, number, number];
}

/** key：UE 材质资产名（匹配时忽略大小写与符号）。 */
export type ModelMaterialMap = Record<string, ModelMaterialInfo>;

export interface ModelLibraryEntry {
  id: string;
  name: string;
  category: string;
  fileName: string;
  fileUrl: string;
  unitScale: number;
  source: string;
  sizeKb: number;
  /** 材质回填映射：GLB 里只有 FBX 占位材质，无贴图。 */
  materials?: ModelMaterialMap;
}

export const MODEL_LIBRARY_CATEGORIES = ["家具", "装饰", "植物", "自然", "厨房", "地面", "背景"] as const;

const CINE57_SOURCE = "Cine57";

export const MODEL_LIBRARY: ModelLibraryEntry[] = [
  { id: "bed-12a", name: "双人床 A", category: "家具", fileName: "SM_Bed_12a.glb", fileUrl: "/models/cine57/SM_Bed_12a.glb", unitScale: 1, source: CINE57_SOURCE, sizeKb: 2433, materials: {"MI_Bed_12a":{"baseColor":"/models/cine57/tex/_EnvHouse_Suburbs_VOL16_Bedroom_Textures_TX_Bed_12a_ALB.TX_Bed_12a_ALB_baseColor.jpg","tint":[0.24,0.085,0.066]},"MI_Bed_12b":{"baseColor":"/models/cine57/tex/_EnvHouse_Suburbs_VOL16_Bedroom_Textures_TX_Bed_12b_ALB.TX_Bed_12b_ALB_baseColor.jpg","tint":[1,1,1]},"MI_Bed_12c":{"baseColor":"/models/cine57/tex/_EnvHouse_Suburbs_VOL16_Bedroom_Textures_TX_Bed_12c_ALB.TX_Bed_12c_ALB_baseColor.jpg","tint":[1,1,1]}} },
  { id: "bed-19a", name: "单人床", category: "家具", fileName: "SM_Bed_19a.glb", fileUrl: "/models/cine57/SM_Bed_19a.glb", unitScale: 1, source: CINE57_SOURCE, sizeKb: 1719, materials: {"MI_Bed_19b":{"baseColor":"/models/cine57/tex/_EnvHouse_Suburbs_VOL16_Bedroom_Textures_TX_Bed_19b_ALB.TX_Bed_19b_ALB_baseColor.jpg","tint":[1,1,1]},"MI_Bed_19a":{"baseColor":"/models/cine57/tex/_EnvHouse_Suburbs_VOL16_Bedroom_Textures_TX_Bed_19a_ALB.TX_Bed_19a_ALB_baseColor.jpg","tint":[0.24,0.085,0.066]},"MI_Bed_19c":{"baseColor":"/models/cine57/tex/_EnvHouse_Suburbs_VOL16_Bedroom_Textures_TX_Bed_19c_ALB.TX_Bed_19c_ALB_baseColor.jpg","tint":[0.24,0.085,0.066]}} },
  { id: "bed-frame-01a", name: "床架", category: "家具", fileName: "SM_Bed_Frame_01a.glb", fileUrl: "/models/cine57/SM_Bed_Frame_01a.glb", unitScale: 1, source: CINE57_SOURCE, sizeKb: 1493, materials: {"MI_Bed_Frame_01a":{"baseColor":"/models/cine57/tex/_EnvHouse_Suburbs_VOL16_Bedroom_Textures_TX_Bed_Frame_01a_ALB.TX_Bed_Frame_01a_ALB_baseColor.jpg"}} },
  { id: "sofa-pullout-01a", name: "沙发床", category: "家具", fileName: "SM_Sofa_Pullout_01a.glb", fileUrl: "/models/cine57/SM_Sofa_Pullout_01a.glb", unitScale: 1, source: CINE57_SOURCE, sizeKb: 164, materials: {"MI_Sofa_Pullout_01a":{"baseColor":"/models/cine57/tex/_EnvHouse_Suburbs_VOL16_Bedroom_Textures_TX_Sofa_Pullout_01a_ALB.TX_Sofa_Pullout_01a_ALB_baseColor.jpg","tint":[0.24,0.138,0.017]}} },
  { id: "crib-baby-01a", name: "婴儿床", category: "家具", fileName: "SM_Crib_Baby_01a.glb", fileUrl: "/models/cine57/SM_Crib_Baby_01a.glb", unitScale: 1, source: CINE57_SOURCE, sizeKb: 388, materials: {"MI_Crib_Baby_01a":{"baseColor":"/models/cine57/tex/_EnvHouse_Suburbs_VOL16_Bedroom_Textures_TX_Crib_Baby_01a_ALB.TX_Crib_Baby_01a_ALB_baseColor.jpg","tint":[0,0.296,1]}} },
  { id: "pillow-bed-01a", name: "床头枕", category: "装饰", fileName: "SM_Pillow_Bed_01a.glb", fileUrl: "/models/cine57/SM_Pillow_Bed_01a.glb", unitScale: 1, source: CINE57_SOURCE, sizeKb: 178, materials: {"MI_Pillows_Bed_01a":{"baseColor":"/models/cine57/tex/_EnvHouse_Suburbs_VOL16_Bedroom_Textures_TX_Pillows_Bed_01a_ALB.TX_Pillows_Bed_01a_ALB_baseColor.jpg"}} },
  { id: "desk-office-08a", name: "办公桌 A", category: "家具", fileName: "SM_Desk_Office_08a.glb", fileUrl: "/models/cine57/SM_Desk_Office_08a.glb", unitScale: 1, source: CINE57_SOURCE, sizeKb: 217, materials: {"MI_Desk_Office_08a":{"baseColor":"/models/cine57/tex/_EnvHouse_Suburbs_VOL19_Office_Textures_TX_Desk_Office_08a_ALB.TX_Desk_Office_08a_ALB_baseColor.jpg","tint":[0.001,0.342,1]}} },
  { id: "desk-03a", name: "书桌", category: "家具", fileName: "SM_Desk_03a.glb", fileUrl: "/models/cine57/SM_Desk_03a.glb", unitScale: 1, source: CINE57_SOURCE, sizeKb: 91, materials: {"MI_Desk_03a":{"baseColor":"/models/cine57/tex/_EnvHouse_Suburbs_VOL19_Office_Textures_TX_Desk_03a_ALB.TX_Desk_03a_ALB_baseColor.jpg"}} },
  { id: "chair-desk-01a", name: "书桌椅", category: "家具", fileName: "SM_Chair_Desk_01a.glb", fileUrl: "/models/cine57/SM_Chair_Desk_01a.glb", unitScale: 1, source: CINE57_SOURCE, sizeKb: 536, materials: {"MI_Chair_Desk_01a":{"baseColor":"/models/cine57/tex/_EnvHouse_Suburbs_VOL19_Office_Textures_TX_Chair_Desk_01_ALB.TX_Chair_Desk_01_ALB_baseColor.jpg"}} },
  { id: "chair-set-05a", name: "椅子 A", category: "家具", fileName: "SM_Chair_Set_05a.glb", fileUrl: "/models/cine57/SM_Chair_Set_05a.glb", unitScale: 1, source: CINE57_SOURCE, sizeKb: 551, materials: {"MI_Chair_Set_05a":{"baseColor":"/models/cine57/tex/_EnvHouse_Suburbs_VOL19_Office_Textures_TX_Chair_Set_05a_ALB.TX_Chair_Set_05a_ALB_baseColor.jpg","tint":[0.75,0.423,0.271]}} },
  { id: "chair-set-09a", name: "椅子 B", category: "家具", fileName: "SM_Chair_Set_09a.glb", fileUrl: "/models/cine57/SM_Chair_Set_09a.glb", unitScale: 1, source: CINE57_SOURCE, sizeKb: 566, materials: {"MI_Chair_Set_09a":{"baseColor":"/models/cine57/tex/_EnvHouse_Suburbs_VOL19_Office_Textures_TX_Chair_Set_09a_ALB.TX_Chair_Set_09a_ALB_baseColor.jpg"}} },
  { id: "table", name: "餐桌", category: "家具", fileName: "SM_Table.glb", fileUrl: "/models/cine57/SM_Table.glb", unitScale: 1, source: CINE57_SOURCE, sizeKb: 343 },
  { id: "coffee-table", name: "茶几", category: "家具", fileName: "SM_Coffee_table.glb", fileUrl: "/models/cine57/SM_Coffee_table.glb", unitScale: 1, source: CINE57_SOURCE, sizeKb: 170 },
  { id: "book-set-01a", name: "书堆 A", category: "装饰", fileName: "SM_Book_Set_01a.glb", fileUrl: "/models/cine57/SM_Book_Set_01a.glb", unitScale: 1, source: CINE57_SOURCE, sizeKb: 188, materials: {"MI_Bookset_01a":{"baseColor":"/models/cine57/tex/_Props_Suburban_Household_VOL12_Decor_Textures_TX_Bookset_01a_ALB.TX_Bookset_01a_ALB_baseColor.jpg"}} },
  { id: "book-set-05a", name: "书堆 B", category: "装饰", fileName: "SM_Book_Set_05a.glb", fileUrl: "/models/cine57/SM_Book_Set_05a.glb", unitScale: 1, source: CINE57_SOURCE, sizeKb: 39, materials: {"MI_Bookset_05a":{"baseColor":"/models/cine57/tex/_Props_Suburban_Household_VOL12_Decor_Textures_TX_Book_Set_05a_ALB.TX_Book_Set_05a_ALB_baseColor.jpg"}} },
  { id: "candle-set-02a", name: "烛台组", category: "装饰", fileName: "SM_Candle_Set_02a.glb", fileUrl: "/models/cine57/SM_Candle_Set_02a.glb", unitScale: 1, source: CINE57_SOURCE, sizeKb: 135, materials: {"MI_Candle_Set_02a":{"baseColor":"/models/cine57/tex/_Props_Suburban_Household_VOL12_Decor_Textures_TX_Candle_Set_02a_ALB.TX_Candle_Set_02a_ALB_baseColor.jpg"}} },
  { id: "house-decor-11a", name: "家居摆件", category: "装饰", fileName: "SM_House_Decor_11a.glb", fileUrl: "/models/cine57/SM_House_Decor_11a.glb", unitScale: 1, source: CINE57_SOURCE, sizeKb: 72, materials: {"MI_House_Decor_11a":{"baseColor":"/models/cine57/tex/_Props_Suburban_Household_VOL12_Decor_Textures_TX_House_Decor_11a_ALB.TX_House_Decor_11a_ALB_baseColor.jpg"}} },
  { id: "pillow-set-06a", name: "抱枕组", category: "装饰", fileName: "SM_Pillow_Set_06a.glb", fileUrl: "/models/cine57/SM_Pillow_Set_06a.glb", unitScale: 1, source: CINE57_SOURCE, sizeKb: 54, materials: {"MI_Pillow_Set_06a":{"baseColor":"/models/cine57/tex/_Props_Suburban_Household_VOL12_Decor_Textures_TX_Pillow_Set_06a_ALB.TX_Pillow_Set_06a_ALB_baseColor.jpg"}} },
  { id: "chinese-vases-01a", name: "瓷瓶 A", category: "装饰", fileName: "SM_Chinese_Vases_01a.glb", fileUrl: "/models/cine57/SM_Chinese_Vases_01a.glb", unitScale: 1, source: CINE57_SOURCE, sizeKb: 329, materials: {"MI_Chinese_Vases_01a":{"baseColor":"/models/cine57/tex/_Props_Suburbs_VOL25_KnickKnacks_Textures_TX_Chinese_Vases_01a_ALB.TX_Chinese_Vases_01a_ALB_baseColor.jpg","tint":[0,1,0.088]}} },
  { id: "chinese-vases-01b", name: "瓷瓶 B", category: "装饰", fileName: "SM_Chinese_Vases_01b.glb", fileUrl: "/models/cine57/SM_Chinese_Vases_01b.glb", unitScale: 1, source: CINE57_SOURCE, sizeKb: 563, materials: {"MI_Chinese_Vases_01a":{"baseColor":"/models/cine57/tex/_Props_Suburbs_VOL25_KnickKnacks_Textures_TX_Chinese_Vases_01a_ALB.TX_Chinese_Vases_01a_ALB_baseColor.jpg","tint":[0,1,0.088]}} },
  { id: "knick-knacks-31a", name: "小摆件", category: "装饰", fileName: "SM_Knick_Knacks_31a.glb", fileUrl: "/models/cine57/SM_Knick_Knacks_31a.glb", unitScale: 1, source: CINE57_SOURCE, sizeKb: 689, materials: {"MI_Knick_Knacks_31a":{"baseColor":"/models/cine57/tex/_Props_Suburbs_VOL25_KnickKnacks_Textures_TX_Knick_Knacks_31a_ALB.TX_Knick_Knacks_31a_ALB_baseColor.jpg","tint":[0,1,0.088]}} },
  { id: "chinese-lamp-01a", name: "宫灯", category: "装饰", fileName: "SM_Chinese_Lamp_01a.glb", fileUrl: "/models/cine57/SM_Chinese_Lamp_01a.glb", unitScale: 1, source: CINE57_SOURCE, sizeKb: 176, materials: {"MI_Chinese_Lamp_01a":{"baseColor":"/models/cine57/tex/_Props_Suburbs_VOL25_KnickKnacks_Textures_TX_Chinese_Lamp_01a_ALB.TX_Chinese_Lamp_01a_ALB_baseColor.jpg","tint":[0,1,0.088]}} },
  { id: "plant-0", name: "盆栽 A", category: "植物", fileName: "SM_plant_0.glb", fileUrl: "/models/cine57/SM_plant_0.glb", unitScale: 1, source: CINE57_SOURCE, sizeKb: 933, materials: {"M_leaf_19":{"baseColor":"/models/cine57/tex/_EnvHouse_HQ_Interior_plants_Textures_T_PLANT_Aspadistra_2.T_PLANT_Aspadistra_2_baseColor.jpg"}} },
  { id: "plant-12", name: "盆栽 B", category: "植物", fileName: "SM_plant_12.glb", fileUrl: "/models/cine57/SM_plant_12.glb", unitScale: 1, source: CINE57_SOURCE, sizeKb: 254, materials: {"M_leaf_18":{"baseColor":"/models/cine57/tex/_EnvHouse_HQ_Interior_plants_Textures_T_p80_2.T_p80_2_baseColor.jpg"}} },
  { id: "palm-tree-house-01a", name: "室内棕榈", category: "植物", fileName: "SM_Palm_Tree_House_01a.glb", fileUrl: "/models/cine57/SM_Palm_Tree_House_01a.glb", unitScale: 1, source: CINE57_SOURCE, sizeKb: 450, materials: {"MI_Palm_Tree_House_01a":{"baseColor":"/models/cine57/tex/_Props_Suburban_Household_VOL12_Decor_Textures_TX_Palm_Tree_House_01a_ALB.TX_Palm_Tree_House_01a_ALB_baseColor.jpg","tint":[0.036,0.036,0.036]}} },
  { id: "big-rock-01", name: "巨石", category: "自然", fileName: "SM_Big_rock_01.glb", fileUrl: "/models/cine57/SM_Big_rock_01.glb", unitScale: 1, source: CINE57_SOURCE, sizeKb: 451, materials: {"MI_Big_rock_01":{"baseColor":"/models/cine57/tex/_Enviroments_Mountain_Environment_Set_Rocks_Textures_T_Big_rock_01_BC.T_Big_rock_01_BC_baseColor.jpg"}} },
  { id: "flat-rock-01", name: "扁石", category: "自然", fileName: "SM_flat_rock_01.glb", fileUrl: "/models/cine57/SM_flat_rock_01.glb", unitScale: 1, source: CINE57_SOURCE, sizeKb: 240, materials: {"MI_Flat_rock_01":{"baseColor":"/models/cine57/tex/_Enviroments_Mountain_Environment_Set_Rocks_Textures_T_Flat_rock_01_tiled_BC_H.T_Flat_rock_01_tiled_BC_H_baseColor.jpg"}} },
  { id: "ground-rock-01", name: "碎石 A", category: "自然", fileName: "SM_ground_rock_01.glb", fileUrl: "/models/cine57/SM_ground_rock_01.glb", unitScale: 1, source: CINE57_SOURCE, sizeKb: 280, materials: {"MI_rocks_atlas_01":{"baseColor":"/models/cine57/tex/_Enviroments_Mountain_Environment_Set_Rocks_Textures_T_rocks_atlas_01_BC.T_rocks_atlas_01_BC_baseColor.jpg"}} },
  { id: "ground-rock-02", name: "碎石 B", category: "自然", fileName: "SM_ground_rock_02.glb", fileUrl: "/models/cine57/SM_ground_rock_02.glb", unitScale: 1, source: CINE57_SOURCE, sizeKb: 146, materials: {"MI_rocks_atlas_01":{"baseColor":"/models/cine57/tex/_Enviroments_Mountain_Environment_Set_Rocks_Textures_T_rocks_atlas_01_BC.T_rocks_atlas_01_BC_baseColor.jpg"}} },
  { id: "food-shipment-01a", name: "食材组合 A", category: "厨房", fileName: "SM_FoodShipmentSet_01a.glb", fileUrl: "/models/cine57/SM_FoodShipmentSet_01a.glb", unitScale: 1, source: CINE57_SOURCE, sizeKb: 182, materials: {"MI_FoodShipment_01a":{"baseColor":"/models/cine57/tex/_Props_KitchenCombo_Kitchen_VOL2_Textures_Unique_TX_FoodShipment_01a_ALB.TX_FoodShipment_01a_ALB_baseColor.jpg"}} },
  { id: "food-shipment-01b", name: "食材组合 B", category: "厨房", fileName: "SM_FoodShipmentSet_01b.glb", fileUrl: "/models/cine57/SM_FoodShipmentSet_01b.glb", unitScale: 1, source: CINE57_SOURCE, sizeKb: 176, materials: {"MI_FoodShipment_01a":{"baseColor":"/models/cine57/tex/_Props_KitchenCombo_Kitchen_VOL2_Textures_Unique_TX_FoodShipment_01a_ALB.TX_FoodShipment_01a_ALB_baseColor.jpg"}} },
  { id: "food-shipment-01c", name: "食材组合 C", category: "厨房", fileName: "SM_FoodShipmentSet_01c.glb", fileUrl: "/models/cine57/SM_FoodShipmentSet_01c.glb", unitScale: 1, source: CINE57_SOURCE, sizeKb: 244, materials: {"MI_FoodShipment_01a":{"baseColor":"/models/cine57/tex/_Props_KitchenCombo_Kitchen_VOL2_Textures_Unique_TX_FoodShipment_01a_ALB.TX_FoodShipment_01a_ALB_baseColor.jpg"}} },
  { id: "food-shipment-01d", name: "食材组合 D", category: "厨房", fileName: "SM_FoodShipmentSet_01d.glb", fileUrl: "/models/cine57/SM_FoodShipmentSet_01d.glb", unitScale: 1, source: CINE57_SOURCE, sizeKb: 225, materials: {"MI_FoodShipment_01a":{"baseColor":"/models/cine57/tex/_Props_KitchenCombo_Kitchen_VOL2_Textures_Unique_TX_FoodShipment_01a_ALB.TX_FoodShipment_01a_ALB_baseColor.jpg"}} },
  { id: "food-shipment-01e", name: "食材组合 E", category: "厨房", fileName: "SM_FoodShipmentSet_01e.glb", fileUrl: "/models/cine57/SM_FoodShipmentSet_01e.glb", unitScale: 1, source: CINE57_SOURCE, sizeKb: 163, materials: {"MI_FoodShipment_01a":{"baseColor":"/models/cine57/tex/_Props_KitchenCombo_Kitchen_VOL2_Textures_Unique_TX_FoodShipment_01a_ALB.TX_FoodShipment_01a_ALB_baseColor.jpg"}} },
  { id: "rugs-03a", name: "地毯 03A", category: "地面", fileName: "SM_Rugs_03a.glb", fileUrl: "/models/cine57/SM_Rugs_03a.glb", unitScale: 1, source: CINE57_SOURCE, sizeKb: 62, materials: {"MI_Rug_03a":{"baseColor":"/models/cine57/tex/_Props_Suburban_Household_VOL11_Rugs_Textures_TX_Rugs_03a_ALB.TX_Rugs_03a_ALB_baseColor.jpg"}} },
  { id: "rugs-03b", name: "地毯 03B", category: "地面", fileName: "SM_Rugs_03b.glb", fileUrl: "/models/cine57/SM_Rugs_03b.glb", unitScale: 1, source: CINE57_SOURCE, sizeKb: 81, materials: {"MI_Rug_03b":{"baseColor":"/models/cine57/tex/_Props_Suburban_Household_VOL11_Rugs_Textures_TX_Rugs_03b_ALB.TX_Rugs_03b_ALB_baseColor.jpg"}} },
  { id: "rugs-03c", name: "地毯 03C", category: "地面", fileName: "SM_Rugs_03c.glb", fileUrl: "/models/cine57/SM_Rugs_03c.glb", unitScale: 1, source: CINE57_SOURCE, sizeKb: 83, materials: {"MI_Rug_03c":{"baseColor":"/models/cine57/tex/_Props_Suburban_Household_VOL11_Rugs_Textures_TX_Rugs_03c_ALB.TX_Rugs_03c_ALB_baseColor.jpg"}} },
  { id: "rug-04a", name: "花纹地毯", category: "地面", fileName: "SM_Rug_04a.glb", fileUrl: "/models/cine57/SM_Rug_04a.glb", unitScale: 1, source: CINE57_SOURCE, sizeKb: 45, materials: {"MI_Rug_04a":{"baseColor":"/models/cine57/tex/_Props_Suburban_Household_VOL11_Rugs_Textures_TX_Rug_NN_04a_ALB.TX_Rug_NN_04a_ALB_baseColor.jpg"}} },
  { id: "brick-stove-1", name: "砖砌炉灶 · 组合", category: "厨房", fileName: "SM_brick_stove_1.glb", fileUrl: "/models/cine57/SM_brick_stove_1.glb", unitScale: 1, source: CINE57_SOURCE, sizeKb: 243, materials: {"MI_brick_stove_1":{"baseColor":"/models/cine57/tex/_EnvHouse_Abandoned_house_Textures_T_grey.T_grey_baseColor.jpg"}} },
  { id: "brick-stove-2", name: "砖砌炉灶 · 主体", category: "厨房", fileName: "SM_brick_stove_2.glb", fileUrl: "/models/cine57/SM_brick_stove_2.glb", unitScale: 1, source: CINE57_SOURCE, sizeKb: 24, materials: {"MI_brick_stove_2":{"baseColor":"/models/cine57/tex/_EnvHouse_Abandoned_house_Textures_T_grey.T_grey_baseColor.jpg"}} },
  { id: "brick-stove-3", name: "砖砌炉灶 · 部件", category: "厨房", fileName: "SM_brick_stove_3.glb", fileUrl: "/models/cine57/SM_brick_stove_3.glb", unitScale: 1, source: CINE57_SOURCE, sizeKb: 24, materials: {"MI_brick_stove_2":{"baseColor":"/models/cine57/tex/_EnvHouse_Abandoned_house_Textures_T_grey.T_grey_baseColor.jpg"}} },
  { id: "decorative-1", name: "装饰构件 1", category: "装饰", fileName: "SM_decorative_elements_1.glb", fileUrl: "/models/cine57/SM_decorative_elements_1.glb", unitScale: 1, source: CINE57_SOURCE, sizeKb: 20, materials: {"MI_decorative_elements_1":{"baseColor":"/models/cine57/tex/_EnvHouse_Abandoned_house_Textures_T_grey.T_grey_baseColor.jpg"}} },
  { id: "decorative-2", name: "装饰构件 2", category: "装饰", fileName: "SM_decorative_elements_2.glb", fileUrl: "/models/cine57/SM_decorative_elements_2.glb", unitScale: 1, source: CINE57_SOURCE, sizeKb: 24, materials: {"MI_decorative_elements_1":{"baseColor":"/models/cine57/tex/_EnvHouse_Abandoned_house_Textures_T_grey.T_grey_baseColor.jpg"}} },
  { id: "z-backdrop-01a", name: "纯色背景板", category: "背景", fileName: "SM_ZBackdrop_01a.glb", fileUrl: "/models/cine57/SM_ZBackdrop_01a.glb", unitScale: 1, source: CINE57_SOURCE, sizeKb: 4, materials: {"MI_Template_BaseGray_03":{"tint":[0.302,0.302,0.31]}} },
];

export function getModelLibraryEntry(id: string | undefined): ModelLibraryEntry | null {
  if (!id) return null;
  return MODEL_LIBRARY.find((entry) => entry.id === id) ?? null;
}
