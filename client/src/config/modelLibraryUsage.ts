/** 供分镜摆放和模型库 UI 共用的模型安装/摆放语义。 */
export type ModelUsageSupportSurface =
  | "ground"
  | "wall"
  | "ceiling"
  | "horizontal-surface"
  | "handheld"
  | "free";

export type ModelUsagePlacementMode =
  | "grounded"
  | "wall-mounted"
  | "ceiling-hung"
  | "surface-placed"
  | "handheld"
  | "free";

export type ModelUsageAnchor = "base" | "back" | "top" | "support-center" | "center";

export type ModelUsageOrientation =
  | "upright"
  | "horizontal"
  | "wall-facing"
  | "downward"
  | "directional"
  | "free";

export interface ModelUsageInstruction {
  /** 模型应依附的支撑面或使用方式。 */
  supportSurface: ModelUsageSupportSurface;
  /** 摆放或安装动作。 */
  placementMode: ModelUsagePlacementMode;
  /** 对齐支撑面时使用的模型基准。 */
  anchor: ModelUsageAnchor;
  /** 模型的姿态语义。 */
  orientation: ModelUsageOrientation;
  /** 后续摆放是否必须提供朝向/目标方向。 */
  requiresFacingDirection: boolean;
  /** 面向用户显示，也可作为 AI 上下文；不能被当作规则输入解析。 */
  instruction: string;
}

const GROUND_UPRIGHT = Object.freeze<ModelUsageInstruction>({
  supportSurface: "ground",
  placementMode: "grounded",
  anchor: "base",
  orientation: "upright",
  requiresFacingDirection: false,
  instruction: "将模型底部或实际接触面贴到地面后摆放，保持竖直；需要改变画面朝向时再水平旋转。",
});

const GROUND_FLAT = Object.freeze<ModelUsageInstruction>({
  supportSurface: "ground",
  placementMode: "grounded",
  anchor: "support-center",
  orientation: "horizontal",
  requiresFacingDirection: false,
  instruction: "将模型的接触面平铺在地面上并保持平整，不要把模型竖立起来。",
});

const HORIZONTAL_SURFACE_UPRIGHT = Object.freeze<ModelUsageInstruction>({
  supportSurface: "horizontal-surface",
  placementMode: "surface-placed",
  anchor: "support-center",
  orientation: "upright",
  requiresFacingDirection: false,
  instruction: "放在桌面、台面或置物架等水平支撑面上，让底部贴合支撑面；不需要贴墙或吊顶。",
});

const HORIZONTAL_SURFACE_DIRECTIONAL = Object.freeze<ModelUsageInstruction>({
  supportSurface: "horizontal-surface",
  placementMode: "surface-placed",
  anchor: "support-center",
  orientation: "directional",
  requiresFacingDirection: true,
  instruction: "放在水平支撑面上，让底部贴合支撑面；使用前后方向把观察端朝向目标。",
});

const WALL_MOUNTED = Object.freeze<ModelUsageInstruction>({
  supportSurface: "wall",
  placementMode: "wall-mounted",
  anchor: "back",
  orientation: "wall-facing",
  requiresFacingDirection: true,
  instruction: "背面贴合墙面，正面朝向房间；根据墙面法线设置方向，保持正面可见。",
});

const CEILING_HUNG = Object.freeze<ModelUsageInstruction>({
  supportSurface: "ceiling",
  placementMode: "ceiling-hung",
  anchor: "top",
  orientation: "downward",
  requiresFacingDirection: true,
  instruction: "顶部连接天花板并以吊点固定高度，灯体或主体朝下；按吊点方向调整朝向。",
});

/**
 * 每个模型库条目 ID 都必须在这里出现。共享 profile 只复用相同的安装语义，
 * 经过 attachModelUsageInstructions 后每个目录条目仍会拥有自己的 usage 字段。
 */
export const MODEL_USAGE_INSTRUCTIONS: Readonly<Record<string, ModelUsageInstruction>> = Object.freeze({
  "bed-12a": GROUND_UPRIGHT,
  "bed-19a": GROUND_UPRIGHT,
  "bed-frame-01a": GROUND_UPRIGHT,
  "sofa-pullout-01a": GROUND_UPRIGHT,
  "crib-baby-01a": GROUND_UPRIGHT,
  "pillow-bed-01a": HORIZONTAL_SURFACE_UPRIGHT,
  "desk-office-08a": GROUND_UPRIGHT,
  "desk-03a": GROUND_UPRIGHT,
  "chair-desk-01a": GROUND_UPRIGHT,
  "chair-set-05a": GROUND_UPRIGHT,
  "chair-set-09a": GROUND_UPRIGHT,
  table: GROUND_UPRIGHT,
  "coffee-table": GROUND_UPRIGHT,
  "book-set-01a": HORIZONTAL_SURFACE_UPRIGHT,
  "book-set-05a": HORIZONTAL_SURFACE_UPRIGHT,
  "candle-set-02a": HORIZONTAL_SURFACE_UPRIGHT,
  "house-decor-11a": HORIZONTAL_SURFACE_UPRIGHT,
  "pillow-set-06a": HORIZONTAL_SURFACE_UPRIGHT,
  "chinese-vases-01a": HORIZONTAL_SURFACE_UPRIGHT,
  "chinese-vases-01b": HORIZONTAL_SURFACE_UPRIGHT,
  "knick-knacks-31a": HORIZONTAL_SURFACE_UPRIGHT,
  "chinese-lamp-01a": CEILING_HUNG,
  "plant-0": HORIZONTAL_SURFACE_UPRIGHT,
  "plant-12": HORIZONTAL_SURFACE_UPRIGHT,
  "palm-tree-house-01a": GROUND_UPRIGHT,
  "ground-rock-01": GROUND_UPRIGHT,
  "ground-rock-02": GROUND_UPRIGHT,
  "food-shipment-01a": GROUND_UPRIGHT,
  "rugs-03a": GROUND_FLAT,
  "rugs-03b": GROUND_FLAT,
  "rugs-03c": GROUND_FLAT,
  "rug-04a": GROUND_FLAT,
  "burger-food-set-01a": HORIZONTAL_SURFACE_UPRIGHT,
  "chair-table-set-11a": GROUND_UPRIGHT,
  "chinese-food-01a": HORIZONTAL_SURFACE_UPRIGHT,
  "coffee-machine-01a": HORIZONTAL_SURFACE_UPRIGHT,
  "cooking-tools-01a": HORIZONTAL_SURFACE_UPRIGHT,
  "dining-table-set-01a": GROUND_UPRIGHT,
  "dinner-desert-set-01a": HORIZONTAL_SURFACE_UPRIGHT,
  armchair: GROUND_UPRIGHT,
  "barrel-01": GROUND_UPRIGHT,
  "barstool-01a": GROUND_UPRIGHT,
  box01: HORIZONTAL_SURFACE_UPRIGHT,
  garbagebasket01: GROUND_UPRIGHT,
  microwave01: HORIZONTAL_SURFACE_UPRIGHT,
  "binder-01a": HORIZONTAL_SURFACE_UPRIGHT,
  "clock-01a": WALL_MOUNTED,
  "coffeecup-01a": HORIZONTAL_SURFACE_UPRIGHT,
  "bathroom-sink-01a": GROUND_UPRIGHT,
  "cabinetset-01a": GROUND_UPRIGHT,
  "desk-set-01a": GROUND_UPRIGHT,
  "file-cabinent-03a": GROUND_UPRIGHT,
  "office-supplies-set-01a": HORIZONTAL_SURFACE_UPRIGHT,
  "printer-01a": HORIZONTAL_SURFACE_UPRIGHT,
  "flat-rock-02": GROUND_UPRIGHT,
  "flat-rock-03": GROUND_UPRIGHT,
  "mountain-rock-small-01-1": GROUND_UPRIGHT,
  "stone-01": GROUND_UPRIGHT,
  "air-mattress-01": GROUND_FLAT,
  "binoculars-01": HORIZONTAL_SURFACE_DIRECTIONAL,
  "camping-grill-01": GROUND_UPRIGHT,
  "dryer-01a": GROUND_UPRIGHT,
  "laundry-basket-01a": GROUND_UPRIGHT,
  "book-set-01b": HORIZONTAL_SURFACE_UPRIGHT,
  "book-set-nn-01a": HORIZONTAL_SURFACE_UPRIGHT,
  "trophy-set-01a": HORIZONTAL_SURFACE_UPRIGHT,
  "vase-set-01a": HORIZONTAL_SURFACE_UPRIGHT,
  "figurine-01a": HORIZONTAL_SURFACE_UPRIGHT,
  "figurine-01b": HORIZONTAL_SURFACE_UPRIGHT,
  "knick-knack-84a": HORIZONTAL_SURFACE_UPRIGHT,
  "knickknacks-05a": HORIZONTAL_SURFACE_UPRIGHT,
  "shelves-01a": GROUND_UPRIGHT,
  "wooden-statues-01a": HORIZONTAL_SURFACE_UPRIGHT,
  "orange-tree-01-01": GROUND_UPRIGHT,
  "orange-tree-01-02": GROUND_UPRIGHT,
  "shrub-a": GROUND_UPRIGHT,
  "shrub-b": GROUND_UPRIGHT,
  "grass-02-a-1": GROUND_UPRIGHT,
  "flower-01-01": GROUND_UPRIGHT,
  "ual2-college-student": GROUND_UPRIGHT,
});

export function attachModelUsageInstructions<T extends { id: string }>(
  entries: readonly T[],
): Array<T & { usage: ModelUsageInstruction }> {
  const entryIds = new Set(entries.map((entry) => entry.id));
  const missingIds = entries
    .filter((entry) => !MODEL_USAGE_INSTRUCTIONS[entry.id])
    .map((entry) => entry.id);
  const orphanIds = Object.keys(MODEL_USAGE_INSTRUCTIONS).filter((id) => !entryIds.has(id));
  if (missingIds.length > 0) {
    throw new Error(`missing model usage instructions: ${missingIds.join(", ")}`);
  }
  if (orphanIds.length > 0) {
    throw new Error(`orphan model usage instructions: ${orphanIds.join(", ")}`);
  }
  return entries.map((entry) => ({ ...entry, usage: MODEL_USAGE_INSTRUCTIONS[entry.id] }));
}

export function getModelUsageInstruction(id: string | undefined): ModelUsageInstruction | null {
  if (!id) return null;
  return MODEL_USAGE_INSTRUCTIONS[id] ?? null;
}

const SUPPORT_SURFACE_LABELS: Record<ModelUsageSupportSurface, string> = {
  ground: "地面",
  wall: "墙面",
  ceiling: "天花板",
  "horizontal-surface": "水平支撑面",
  handheld: "手持使用",
  free: "自由摆放",
};

const PLACEMENT_MODE_LABELS: Record<ModelUsagePlacementMode, string> = {
  grounded: "落地摆放",
  "wall-mounted": "墙面挂装",
  "ceiling-hung": "天花板悬挂",
  "surface-placed": "水平面摆放",
  handheld: "手持使用",
  free: "自由摆放",
};

const ORIENTATION_LABELS: Record<ModelUsageOrientation, string> = {
  upright: "保持竖直",
  horizontal: "保持水平",
  "wall-facing": "正面朝向房间",
  downward: "主体朝下",
  directional: "朝向目标",
  free: "无固定朝向",
};

const ANCHOR_LABELS: Record<ModelUsageAnchor, string> = {
  base: "底部/接触面",
  back: "背面",
  top: "顶部吊点",
  "support-center": "支撑中心",
  center: "中心",
};

export function getModelUsageSurfaceLabel(surface: ModelUsageSupportSurface): string {
  return SUPPORT_SURFACE_LABELS[surface];
}

export function getModelUsagePlacementLabel(mode: ModelUsagePlacementMode): string {
  return PLACEMENT_MODE_LABELS[mode];
}

export function getModelUsageOrientationLabel(orientation: ModelUsageOrientation): string {
  return ORIENTATION_LABELS[orientation];
}

export function getModelUsageAnchorLabel(anchor: ModelUsageAnchor): string {
  return ANCHOR_LABELS[anchor];
}
