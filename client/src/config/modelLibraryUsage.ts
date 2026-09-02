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
  "bench-food-01a": GROUND_UPRIGHT,
  bed: GROUND_UPRIGHT,
  "bed-corner": GROUND_UPRIGHT,
  chair: GROUND_UPRIGHT,
  chair01: GROUND_UPRIGHT,
  "bookshelf-01a": GROUND_UPRIGHT,
  "bookshelf-01a-blank": GROUND_UPRIGHT,
  "coffeetable-01a": GROUND_UPRIGHT,
  "cabinetset-01b": GROUND_UPRIGHT,
  "cabinet-set-03a": GROUND_UPRIGHT,
  "cabinet-set-03b": GROUND_UPRIGHT,
  "bed-12b": GROUND_UPRIGHT,
  "bed-12c": GROUND_UPRIGHT,
  "bed-frame-04a": GROUND_UPRIGHT,
  "bed-frame-04b": GROUND_UPRIGHT,
  "bedding-set-01a": GROUND_UPRIGHT,
  "bedding-set-01b": GROUND_UPRIGHT,
  "chair-set-05b": GROUND_UPRIGHT,
  "chair-set-09b": GROUND_UPRIGHT,
  "desk-office-08b": GROUND_UPRIGHT,
  "desk-office-08c": GROUND_UPRIGHT,
  "desk-set-01b": GROUND_UPRIGHT,
  "mattress-queen-01a": GROUND_UPRIGHT,
  "mattress-twin-01a": GROUND_UPRIGHT,
  "office-chairs-09a": GROUND_UPRIGHT,
  "sofa-pullout-01b": GROUND_UPRIGHT,
  "tv-cart-01a": GROUND_UPRIGHT,
  "clothes-closet-01a": GROUND_UPRIGHT,
  "coffee-machine-commerical-01a": HORIZONTAL_SURFACE_UPRIGHT,
  "cooler-set-03a": GROUND_UPRIGHT,
  "freezer-standing-01a": GROUND_UPRIGHT,
  "barcooler-01": GROUND_UPRIGHT,
  apple01: HORIZONTAL_SURFACE_UPRIGHT,
  board01: HORIZONTAL_SURFACE_UPRIGHT,
  "castironpan-01a": HORIZONTAL_SURFACE_UPRIGHT,
  chopstick01: HORIZONTAL_SURFACE_UPRIGHT,
  cookingboard01: HORIZONTAL_SURFACE_UPRIGHT,
  cup01: HORIZONTAL_SURFACE_UPRIGHT,
  dishwasher01: GROUND_UPRIGHT,
  drainingboard01: HORIZONTAL_SURFACE_UPRIGHT,
  frypan01: HORIZONTAL_SURFACE_UPRIGHT,
  "icecreammachine-01a": GROUND_UPRIGHT,
  kitchenstuff01: HORIZONTAL_SURFACE_UPRIGHT,
  "kitchen-additions-set-01a": HORIZONTAL_SURFACE_UPRIGHT,
  "kitchen-additions-set-01b": HORIZONTAL_SURFACE_UPRIGHT,
  "kitchen-set-01a": GROUND_UPRIGHT,
  "kitchen-set-01b": GROUND_UPRIGHT,
  knife01: HORIZONTAL_SURFACE_UPRIGHT,
  "mugs-decor-01a": HORIZONTAL_SURFACE_UPRIGHT,
  "mugs-decor-01b": HORIZONTAL_SURFACE_UPRIGHT,
  napkinholder01: HORIZONTAL_SURFACE_UPRIGHT,
  "bartap-01a": HORIZONTAL_SURFACE_UPRIGHT,
  "food-heater-set-02a": GROUND_UPRIGHT,
  "food-warmer-07a": GROUND_UPRIGHT,
  "fastfood-dispenser-set-01a": GROUND_UPRIGHT,
  aircon: WALL_MOUNTED,
  "book-01a": HORIZONTAL_SURFACE_UPRIGHT,
  "bookbag-01a": HORIZONTAL_SURFACE_UPRIGHT,
  "calculator-01a": HORIZONTAL_SURFACE_UPRIGHT,
  "computer-02a-keyboard": HORIZONTAL_SURFACE_UPRIGHT,
  "computer-02a-mouse": HORIZONTAL_SURFACE_UPRIGHT,
  "computer-02a-mousepad": HORIZONTAL_SURFACE_UPRIGHT,
  "computer-02a-tower": HORIZONTAL_SURFACE_UPRIGHT,
  "corkboard-03a": WALL_MOUNTED,
  "corkboard-03b": WALL_MOUNTED,
  "electric-outlet-01": WALL_MOUNTED,
  "office-stationary-01a": HORIZONTAL_SURFACE_UPRIGHT,
  "office-stationary-01aa": HORIZONTAL_SURFACE_UPRIGHT,
  "office-stationary-01ab": HORIZONTAL_SURFACE_UPRIGHT,
  "office-stationary-01ac": HORIZONTAL_SURFACE_UPRIGHT,
  "printed-materials-01a": HORIZONTAL_SURFACE_UPRIGHT,
  "stationary-set-01a": HORIZONTAL_SURFACE_UPRIGHT,
  "stationary-set-01aa": HORIZONTAL_SURFACE_UPRIGHT,
  "stationary-set-02aa": HORIZONTAL_SURFACE_UPRIGHT,
  "stationary-set-02ab": HORIZONTAL_SURFACE_UPRIGHT,
  "stationary-set-02ac": HORIZONTAL_SURFACE_UPRIGHT,
  "tv-01": HORIZONTAL_SURFACE_DIRECTIONAL,
  "whiteboard-03a": WALL_MOUNTED,
  "pc-case-01-": HORIZONTAL_SURFACE_UPRIGHT,
  alarmclock: HORIZONTAL_SURFACE_UPRIGHT,
  "bathroom-set-01a": GROUND_UPRIGHT,
  "bathroom-set-01b": GROUND_UPRIGHT,
  "bathroom-stall-set-01a": GROUND_UPRIGHT,
  "bathroom-stall-set-01b": GROUND_UPRIGHT,
  "bathtub-01a": GROUND_UPRIGHT,
  "bathtub-12a": GROUND_UPRIGHT,
  "bathtub-iron-01a": GROUND_UPRIGHT,
  "mirror-set-02a": WALL_MOUNTED,
  "mirror-set-02b": WALL_MOUNTED,
  "shower-05a": GROUND_UPRIGHT,
  "shower-curtain-01a": WALL_MOUNTED,
  "sink-01a": GROUND_UPRIGHT,
  "sink-bathroom-05a": GROUND_UPRIGHT,
  "toilet-01a": GROUND_UPRIGHT,
  "toilet-paper-set-01a": WALL_MOUNTED,
  "towel-set-01a": WALL_MOUNTED,
  "bed-lamp": HORIZONTAL_SURFACE_UPRIGHT,
  lamp01: HORIZONTAL_SURFACE_UPRIGHT,
  "light-industrial-set-13a": CEILING_HUNG,
  "light-industrial-set-13b": CEILING_HUNG,
  "light-outdoor-industrial-set-01a": WALL_MOUNTED,
  "light-set-01a": CEILING_HUNG,
  "lights-exterior-set-01a": WALL_MOUNTED,
  "lights-set-10a": CEILING_HUNG,
  bin: GROUND_UPRIGHT,
  "bottle-01": HORIZONTAL_SURFACE_UPRIGHT,
  "bucket-01": GROUND_UPRIGHT,
  "canteen-01": HORIZONTAL_SURFACE_UPRIGHT,
  "household-bottles-01a": HORIZONTAL_SURFACE_UPRIGHT,
  "kitchen-containers-01a": HORIZONTAL_SURFACE_UPRIGHT,
  "kitchen-containers-01b": HORIZONTAL_SURFACE_UPRIGHT,
  "pot-0": HORIZONTAL_SURFACE_UPRIGHT,
  "pot-1": HORIZONTAL_SURFACE_UPRIGHT,
  "pot-10": HORIZONTAL_SURFACE_UPRIGHT,
  "battery-01": HORIZONTAL_SURFACE_UPRIGHT,
  "bugspray-01a": HORIZONTAL_SURFACE_UPRIGHT,
  "blinds-1": WALL_MOUNTED,
  "blinds-01a": WALL_MOUNTED,
  "bulb-01": HORIZONTAL_SURFACE_UPRIGHT,
  "carpetdivider-01a": WALL_MOUNTED,
  "clothes-dirty-05a": GROUND_UPRIGHT,
  "clothes-exterior-hanger-01a": WALL_MOUNTED,
  "clothes-hanging-01a": WALL_MOUNTED,
  "clothes-pile-01a": GROUND_UPRIGHT,
  "coffee-01a": HORIZONTAL_SURFACE_UPRIGHT,
  "ironing-board-01a": GROUND_UPRIGHT,
  baseball: HORIZONTAL_SURFACE_UPRIGHT,
  baseballbat: HORIZONTAL_SURFACE_DIRECTIONAL,
  "flagpole-01a": GROUND_UPRIGHT,
  "ual2-college-student": GROUND_UPRIGHT,
  "cue-rack-1a": GROUND_UPRIGHT,
  "food-shipment-stack-01a": GROUND_UPRIGHT,
  "food-shipping-crate-01a": GROUND_UPRIGHT,
  "mounted-deer-01a": WALL_MOUNTED,
  "mounted-fish-01a": WALL_MOUNTED,
  "pillow-set-06b": HORIZONTAL_SURFACE_UPRIGHT,
  "pillows-03a": HORIZONTAL_SURFACE_UPRIGHT,
  "plants-hanging-01a": CEILING_HUNG,
  "plants-plastic-set-01a": HORIZONTAL_SURFACE_UPRIGHT,
  "kitchen-carpet-01": GROUND_FLAT,
  "fire-sprinkler-01": CEILING_HUNG,
  "baseball-bat-metal": HORIZONTAL_SURFACE_UPRIGHT,
  "baseball-bat-wood": HORIZONTAL_SURFACE_UPRIGHT,
  "basketball-hoop": WALL_MOUNTED,
  "book-single": HORIZONTAL_SURFACE_UPRIGHT,
  "mountain-rock-big-01": GROUND_UPRIGHT,
  "mountain-rock-big-02": GROUND_UPRIGHT,
  "mountain-rock-small-01": GROUND_UPRIGHT,
  "candle-set-01a": HORIZONTAL_SURFACE_UPRIGHT,
  "home-decor-03a": HORIZONTAL_SURFACE_UPRIGHT,
  "mirror-set-01a": WALL_MOUNTED,
  "chinese-decor-02a": WALL_MOUNTED,
  "chinese-food-menu-01a": WALL_MOUNTED,
  "chinese-restaurant-decor-01a": WALL_MOUNTED,
  "fast-food-order-board-01a": WALL_MOUNTED,
  "food-dispenser-01a": GROUND_UPRIGHT,
  "dining-table-77a": GROUND_UPRIGHT,
  "vase-set-66a": HORIZONTAL_SURFACE_UPRIGHT,
  "axe-01": HORIZONTAL_SURFACE_UPRIGHT,
  "binocular-01": HORIZONTAL_SURFACE_UPRIGHT,
  "wooden-board-01": HORIZONTAL_SURFACE_UPRIGHT,
  "cigarette-01": HORIZONTAL_SURFACE_UPRIGHT,
  "archviz-carpet-01": GROUND_FLAT,
  "decor-piece-01": HORIZONTAL_SURFACE_UPRIGHT,
  "plant-1": HORIZONTAL_SURFACE_UPRIGHT,
  "plant-10": HORIZONTAL_SURFACE_UPRIGHT,
  "plant-11": HORIZONTAL_SURFACE_UPRIGHT,
  "plant-13": HORIZONTAL_SURFACE_UPRIGHT,
  "tv-remote-01": HORIZONTAL_SURFACE_UPRIGHT,
  "cassette-aircon-01": CEILING_HUNG,
  "retro-knickknacks-01a": HORIZONTAL_SURFACE_UPRIGHT,
  "retro-knickknacks-05b": HORIZONTAL_SURFACE_UPRIGHT,
  "wind-chime-01a": CEILING_HUNG,
  "beer-clock-01a": WALL_MOUNTED,
  "trashcan-01a": GROUND_UPRIGHT,
  "urinal-01a": WALL_MOUNTED,
  "crib-baby-01b": GROUND_UPRIGHT,
  "pillow-bed-01b": HORIZONTAL_SURFACE_UPRIGHT,
  "crt-computer-02a": HORIZONTAL_SURFACE_UPRIGHT,
  "office-stationery-01ad": HORIZONTAL_SURFACE_UPRIGHT,
  "office-stationery-01ae": HORIZONTAL_SURFACE_UPRIGHT,
  "rug-05a": GROUND_FLAT,
  "rug-set-12a": GROUND_FLAT,
"door-exterior-a02": GROUND_UPRIGHT,
  "door-exterior-b02": GROUND_UPRIGHT,
  "door-exterior-c02": GROUND_UPRIGHT,
  "door-exterior-d02": GROUND_UPRIGHT,
  "door-exterior-e02": GROUND_UPRIGHT,
  "door-exterior-f02": GROUND_UPRIGHT,
  "door-exterior-g02": GROUND_UPRIGHT,
  "door-exterior-h02": GROUND_UPRIGHT,
  "door-exterior-a03": GROUND_UPRIGHT,
  "door-exterior-b03": GROUND_UPRIGHT,
  "door-exterior-c03": GROUND_UPRIGHT,
  "door-exterior-a04": GROUND_UPRIGHT,
  "door-exterior-b04": GROUND_UPRIGHT,
  "door-exterior-c04": GROUND_UPRIGHT,
  "door-exterior-d04": GROUND_UPRIGHT,
  "door-exterior-e04": GROUND_UPRIGHT,
  "door-exterior-f04": GROUND_UPRIGHT,
  "door-exterior-g04": GROUND_UPRIGHT,
  "door-exterior-h04": GROUND_UPRIGHT,
  "door-exterior-a05": GROUND_UPRIGHT,
  "door-exterior-b05": GROUND_UPRIGHT,
  "door-exterior-c05": GROUND_UPRIGHT,
  "door-exterior-d05": GROUND_UPRIGHT,
  "door-exterior-e05": GROUND_UPRIGHT,
  "door-exterior-f05": GROUND_UPRIGHT,
  "door-exterior-g05": GROUND_UPRIGHT,
  "door-exterior-h05": GROUND_UPRIGHT,
  "door-exterior-a06": GROUND_UPRIGHT,
  "door-exterior-b06": GROUND_UPRIGHT,
  "door-exterior-c06": GROUND_UPRIGHT,
  "door-exterior-d06": GROUND_UPRIGHT,
  "door-exterior-e06": GROUND_UPRIGHT,
  "door-commercial-a01": GROUND_UPRIGHT,
  "door-commercial-b01": GROUND_UPRIGHT,
  "door-commercial-c01": GROUND_UPRIGHT,
  "door-commercial-d01": GROUND_UPRIGHT,
  "door-commercial-e01": GROUND_UPRIGHT,
  "door-commercial-f01": GROUND_UPRIGHT,
  "door-commercial-g01": GROUND_UPRIGHT,
  "door-commercial-h01": GROUND_UPRIGHT,
  "door-commercial-i01": GROUND_UPRIGHT,
  "door-commercial-a02": GROUND_UPRIGHT,
  "door-commercial-b02": GROUND_UPRIGHT,
  "door-commercial-c02": GROUND_UPRIGHT,
  "door-commercial-d02": GROUND_UPRIGHT,
  "door-commercial-e02": GROUND_UPRIGHT,
  "door-commercial-f02": GROUND_UPRIGHT,
  "door-commercial-g02": GROUND_UPRIGHT,
  "door-commercial-h02": GROUND_UPRIGHT,
  "door-commercial-i02": GROUND_UPRIGHT,
  "door-commercial-a03": GROUND_UPRIGHT,
  "door-commercial-b03": GROUND_UPRIGHT,
  "door-commercial-c03": GROUND_UPRIGHT,
  "door-commercial-d03": GROUND_UPRIGHT,
  "door-commercial-e03": GROUND_UPRIGHT,
  "door-commercial-a04": GROUND_UPRIGHT,
  "door-commercial-b04": GROUND_UPRIGHT,
  "door-commercial-c04": GROUND_UPRIGHT,
  "blinds-01-undefineda": WALL_MOUNTED,
  "blinds-01-undefinedb": WALL_MOUNTED,
  "blinds-01-undefinedc": WALL_MOUNTED,
  "blinds-01-undefinedd": WALL_MOUNTED,
  "blinds-01-undefinede": WALL_MOUNTED,
  "blinds-01-undefinedf": WALL_MOUNTED,
  "blinds-01-undefinedg": WALL_MOUNTED,
  "blinds-01-undefinedh": WALL_MOUNTED,
  "fire-hydrant-01a": GROUND_UPRIGHT,
  "fire-hydrant-01b": GROUND_UPRIGHT,
  "mailbox-01a": GROUND_UPRIGHT,
  "mailbox-01c": GROUND_UPRIGHT,
  "mailbox-01e": GROUND_UPRIGHT,
  "mailbox-02a": GROUND_UPRIGHT,
  "power-unit-01a": GROUND_UPRIGHT,
  "power-unit-01b": GROUND_UPRIGHT,
  "power-unit-01c": GROUND_UPRIGHT,
  "power-unit-01d": GROUND_UPRIGHT,
  "power-unit-01e": GROUND_UPRIGHT,
  "power-unit-01f": GROUND_UPRIGHT,
  "ceiling-vent-01a": CEILING_HUNG,
  "ceiling-vent-01c": CEILING_HUNG,
  "ceiling-vent-01e": CEILING_HUNG,
  "ceiling-vent-01g": CEILING_HUNG,
  "ceiling-vent-01h": CEILING_HUNG,
  "ceiling-vent-01j": CEILING_HUNG,
  "hospital-bottle-01a": HORIZONTAL_SURFACE_UPRIGHT,
  "hospital-bottle-01c": HORIZONTAL_SURFACE_UPRIGHT,
  "needle-deposit-01a": HORIZONTAL_SURFACE_UPRIGHT,
  "needle-deposit-01c": HORIZONTAL_SURFACE_UPRIGHT,
  "needle-deposit-01e": HORIZONTAL_SURFACE_UPRIGHT,
  "pill-bottle-set-01a": HORIZONTAL_SURFACE_UPRIGHT,
  "pill-bottle-set-01c": HORIZONTAL_SURFACE_UPRIGHT,
  "pill-bottle-01a": HORIZONTAL_SURFACE_UPRIGHT,
  "pill-bottle-01c": HORIZONTAL_SURFACE_UPRIGHT,
  "medical-computer-01a": HORIZONTAL_SURFACE_UPRIGHT,
  "defibrillator-01a": HORIZONTAL_SURFACE_UPRIGHT,
  "defibrillator-01b": HORIZONTAL_SURFACE_UPRIGHT,
  "defib-01a": HORIZONTAL_SURFACE_UPRIGHT,
  "defib-case-01a": HORIZONTAL_SURFACE_UPRIGHT,
  "defib-case-01c": HORIZONTAL_SURFACE_UPRIGHT,
  "bedside-table-01a": GROUND_UPRIGHT,
  "bedside-table-01c": GROUND_UPRIGHT,
  "blanket-set-01a": HORIZONTAL_SURFACE_UPRIGHT,
  "blanket-set-01b": HORIZONTAL_SURFACE_UPRIGHT,
  "medical-cart-08a": GROUND_UPRIGHT,
  "medical-cart-08c": GROUND_UPRIGHT,
  "medical-cart-08e": GROUND_UPRIGHT,
  "school-desk-01a": GROUND_UPRIGHT,
  "school-desk-01b": GROUND_UPRIGHT,
  "school-gate-01a": GROUND_UPRIGHT,
  "school-gate-01c": GROUND_UPRIGHT,
  "school-gate-01f": GROUND_UPRIGHT,
  "school-lockers-01a": GROUND_UPRIGHT,
  "school-lockers-01c": GROUND_UPRIGHT,
  "school-lockers-01f": GROUND_UPRIGHT,
  "school-lockers-01j": GROUND_UPRIGHT,
  "outdoor-bench-01a": GROUND_UPRIGHT,
  "outdoor-table-01a": GROUND_UPRIGHT,
  "outdoor-trashcan-01a": GROUND_UPRIGHT,
  "concrete-stairs-01": GROUND_UPRIGHT,
  "loading-bay-tarp-01": WALL_MOUNTED,
  "drainage-pipe-01": WALL_MOUNTED,
  "warehouse-logo-01": WALL_MOUNTED,
  "wooden-canoe-01": GROUND_UPRIGHT,
  "asian-pottery-01": HORIZONTAL_SURFACE_UPRIGHT,
  "asian-sack-01a": GROUND_FLAT,
  "asian-sack-01b": GROUND_FLAT,
  "asian-bread-01": HORIZONTAL_SURFACE_UPRIGHT,
  "grass-bunch-01": GROUND_FLAT,
  "asian-flag-01": WALL_MOUNTED,
  "flower-cluster-01": GROUND_FLAT,
  "crop-arugula-01a": GROUND_FLAT,
  "crop-arugula-01b": GROUND_FLAT,
  "crop-beans-01": GROUND_FLAT,
  "crop-beet-01a": GROUND_FLAT,
  "crop-beet-01b": GROUND_FLAT,
  "bamboo-01": GROUND_UPRIGHT,
  "bamboo-basket-01a": GROUND_UPRIGHT,
  "bamboo-basket-01b": GROUND_UPRIGHT,
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
