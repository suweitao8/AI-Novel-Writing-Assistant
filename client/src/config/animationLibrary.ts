import {
  ANIMATION_CATALOG_ENTRIES,
  ANIMATION_CATALOG_PACKS,
  type AnimationCatalogEntry,
} from "./animationCatalogEntries.ts";

/**
 * 动画目录的来源。legacy 是网站原有目录，unreal 是从 Cine57/UE 资产策选并
 * 重定向到 UAL2 的新目录。
 */
export type AnimationLibrarySource = "legacy" | "unreal";

export const ANIMATION_LIBRARY_FILE_URL = "/anims/cine57/UAL2_UE_Anims.glb";
/** 保留给旧的技术检查与外部调用方的 Cine57 标识。 */
export const ANIMATION_LIBRARY_SOURCE = "Cine57";

export const ANIMATION_LIBRARY_GROUPS = [
  { id: "legacy", label: "旧动画", source: "legacy" },
  { id: "unreal-daily", label: "虚幻 · 日常动作", source: "unreal" },
  { id: "unreal-interaction", label: "虚幻 · 日常互动", source: "unreal" },
  { id: "unreal-misc", label: "虚幻 · 生活与表演", source: "unreal" },
  { id: "unreal-hand-combat", label: "虚幻 · 徒手战斗", source: "unreal" },
  { id: "unreal-weapon-combat", label: "虚幻 · 武器战斗", source: "unreal" },
] as const;

export type AnimationLibraryGroupId = (typeof ANIMATION_LIBRARY_GROUPS)[number]["id"];

export const ANIMATION_LIBRARY_ACTION_TYPES = [
  { id: "idle", label: "待机" },
  { id: "move", label: "移动" },
  { id: "sit", label: "坐姿" },
  { id: "daily", label: "日常" },
  { id: "interaction", label: "互动" },
  { id: "combat", label: "徒手战斗" },
  { id: "boxing", label: "拳击" },
  { id: "sword", label: "剑术" },
  { id: "weapon", label: "武器战斗" },
  { id: "magic", label: "魔法" },
  { id: "reaction", label: "受击 / 闪避" },
  { id: "parkour", label: "翻越 / 攀爬" },
  { id: "sleep", label: "睡眠" },
  { id: "performance", label: "表演 / 手势" },
  { id: "creature", label: "生物动作" },
  { id: "stealth", label: "潜行" },
  { id: "paired", label: "配对互动" },
  { id: "other", label: "其他" },
] as const;

export type AnimationLibraryActionTypeId = (typeof ANIMATION_LIBRARY_ACTION_TYPES)[number]["id"];

export const ANIMATION_LIBRARY_CATEGORIES = ANIMATION_LIBRARY_ACTION_TYPES.map(({ label }) => label);

const ACTION_TYPE_LABELS = new Map<string, string>(
  ANIMATION_LIBRARY_ACTION_TYPES.map(({ id, label }) => [id, label]),
);

function asActionType(value: string): AnimationLibraryActionTypeId {
  if (!ACTION_TYPE_LABELS.has(value)) {
    throw new Error(`动画目录包含未知动作类型：${value}`);
  }
  return value as AnimationLibraryActionTypeId;
}

export function getAnimationActionTypeLabel(actionType: AnimationLibraryActionTypeId): string {
  return ACTION_TYPE_LABELS.get(actionType) ?? "其他";
}

/** 动画库目录条目。 */
export interface AnimationLibraryEntry {
  id: string;
  name: string;
  /** 兼容旧页面的数据字段；值与 actionTypeLabel 相同。 */
  category: string;
  /** 片段所在 GLB 的访问地址。 */
  fileUrl: string;
  /** GLB 内的动作片段名，与 glTF animations[].name 一致。 */
  clipName: string;
  /** 片段时长（秒）。 */
  durationSeconds: number;
  source: AnimationLibrarySource;
  sourceLabel: string;
  groupId: AnimationLibraryGroupId;
  groupLabel: string;
  packId: string;
  packLabel: string;
  actionType: AnimationLibraryActionTypeId;
  actionTypeLabel: string;
  /** 同一套装内的语义去重键；Idle 允许保留多个变体。 */
  dedupeKey: string;
  isIdleVariant: boolean;
  sourcePack?: string;
  sourceAssetPath?: string;
  sourceAssetName?: string;
  sourceSkeleton?: string;
}

export interface AnimationLibraryFilters {
  groupId?: AnimationLibraryGroupId | "all";
  packId?: string | "all";
  actionType?: AnimationLibraryActionTypeId | "all";
}

export const ANIMATION_LIBRARY_PACKS = [
  { id: "legacy", groupId: "legacy", sourcePack: "LegacyAnimationLibrary", label: "旧动画" },
  ...ANIMATION_CATALOG_PACKS,
] as const;

const LEGACY_ACTION_TYPE_BY_CLIP: Readonly<Record<string, AnimationLibraryActionTypeId>> = {
  A_TPose: "other",
  Chest_Open: "daily",
  ClimbUp_1m_RM: "parkour",
  Consume: "daily",
  Farm_Harvest: "daily",
  Farm_PlantSeed: "daily",
  Farm_Watering: "daily",
  Hit_Knockback: "reaction",
  Hit_Knockback_RM: "reaction",
  Idle_FoldArms_Loop: "idle",
  Idle_Lantern_Loop: "idle",
  Idle_No_Loop: "idle",
  Idle_Rail_Call: "idle",
  Idle_Rail_Loop: "idle",
  Idle_Shield_Break: "other",
  Idle_Shield_Loop: "idle",
  Idle_TalkingPhone_Loop: "idle",
  LayToIdle: "other",
  Melee_Hook: "combat",
  Melee_Hook_Rec: "combat",
  NinjaJump_Idle_Loop: "idle",
  NinjaJump_Land: "move",
  NinjaJump_Start: "move",
  OverhandThrow: "combat",
  Shield_Dash_RM: "weapon",
  Shield_OneShot: "weapon",
  Slide_Exit: "move",
  Slide_Loop: "move",
  Slide_Start: "move",
  Sword_Block: "sword",
  Sword_Dash_RM: "sword",
  Sword_Regular_A: "sword",
  Sword_Regular_A_Rec: "sword",
  Sword_Regular_B: "sword",
  Sword_Regular_B_Rec: "sword",
  Sword_Regular_C: "sword",
  Sword_Regular_Combo: "sword",
  TreeChopping_Loop: "daily",
  Walk_Carry_Loop: "daily",
  Yes: "idle",
  Zombie_Idle_Loop: "creature",
  Zombie_Scratch: "creature",
  Zombie_Walk_Fwd_Loop: "creature",
  A_INP_Idle: "idle",
  A_INP_WalkFwd_Loop: "move",
  A_chair_loop01: "sit",
};

function makeLegacyEntry(
  id: string,
  name: string,
  _legacyCategory: string,
  clipName: string,
  durationSeconds: number,
): AnimationLibraryEntry {
  const actionType = LEGACY_ACTION_TYPE_BY_CLIP[clipName];
  if (!actionType) {
    throw new Error(`Missing static legacy animation classification for ${clipName}`);
  }
  const actionTypeLabel = getAnimationActionTypeLabel(actionType);
  return {
    id,
    name,
    category: actionTypeLabel,
    fileUrl: ANIMATION_LIBRARY_FILE_URL,
    clipName,
    durationSeconds,
    source: "legacy",
    sourceLabel: "旧动画",
    groupId: "legacy",
    groupLabel: "旧动画",
    packId: "legacy",
    packLabel: "旧动画",
    actionType,
    actionTypeLabel,
    dedupeKey: `legacy:${clipName}`,
    isIdleVariant: actionType === "idle",
    sourcePack: "LegacyAnimationLibrary",
  };
}

const LEGACY_ANIMATION_LIBRARY: AnimationLibraryEntry[] = [
  makeLegacyEntry("ual2-a-tpose", "T 形姿势", "其他动作", "A_TPose", 2.5),
  makeLegacyEntry("ual2-chest-open", "打开胸口", "其他动作", "Chest_Open", 1.37),
  makeLegacyEntry("ual2-climb-up", "攀爬上升", "移动", "ClimbUp_1m_RM", 0.67),
  makeLegacyEntry("ual2-consume", "进食", "其他动作", "Consume", 1.33),
  makeLegacyEntry("ual2-farm-harvest", "收获作物", "其他动作", "Farm_Harvest", 2.5),
  makeLegacyEntry("ual2-farm-plant-seed", "播种", "其他动作", "Farm_PlantSeed", 2.77),
  makeLegacyEntry("ual2-farm-watering", "浇水", "其他动作", "Farm_Watering", 3.8),
  makeLegacyEntry("ual2-hit-knockback", "受击后退", "其他动作", "Hit_Knockback", 0.83),
  makeLegacyEntry(
    "ual2-hit-knockback-root-motion",
    "受击后退（位移）",
    "移动",
    "Hit_Knockback_RM",
    0.83,
  ),
  makeLegacyEntry("ual2-idle-fold-arms", "抱臂待机", "待机", "Idle_FoldArms_Loop", 2.5),
  makeLegacyEntry("ual2-idle-lantern", "提灯待机", "待机", "Idle_Lantern_Loop", 2.5),
  makeLegacyEntry("ual2-idle-no-loop", "自然待机", "待机", "Idle_No_Loop", 2.5),
  makeLegacyEntry("ual2-idle-rail-call", "呼叫待机", "待机", "Idle_Rail_Call", 2.5),
  makeLegacyEntry("ual2-idle-rail-loop", "扶栏待机", "待机", "Idle_Rail_Loop", 2.5),
  makeLegacyEntry("ual2-idle-shield-break", "盾牌破坏", "其他动作", "Idle_Shield_Break", 1.07),
  makeLegacyEntry("ual2-idle-shield-loop", "持盾待机", "待机", "Idle_Shield_Loop", 2.5),
  makeLegacyEntry(
    "ual2-idle-talking-phone",
    "打电话待机",
    "待机",
    "Idle_TalkingPhone_Loop",
    2.93,
  ),
  makeLegacyEntry("ual2-lay-to-idle", "躺姿起身", "其他动作", "LayToIdle", 1.53),
  makeLegacyEntry("ual2-melee-hook", "近战钩击", "其他动作", "Melee_Hook", 0.47),
  makeLegacyEntry("ual2-melee-hook-recovery", "近战钩击收招", "其他动作", "Melee_Hook_Rec", 0.6),
  makeLegacyEntry("ual2-ninja-jump-idle", "跳跃待机", "待机", "NinjaJump_Idle_Loop", 2.0),
  makeLegacyEntry("ual2-ninja-jump-land", "跳跃落地", "移动", "NinjaJump_Land", 1.27),
  makeLegacyEntry("ual2-ninja-jump-start", "起跳", "移动", "NinjaJump_Start", 0.97),
  makeLegacyEntry("ual2-overhand-throw", "过肩投掷", "其他动作", "OverhandThrow", 1.33),
  makeLegacyEntry("ual2-shield-dash", "持盾冲刺", "移动", "Shield_Dash_RM", 1.1),
  makeLegacyEntry("ual2-shield-one-shot", "持盾动作", "其他动作", "Shield_OneShot", 0.83),
  makeLegacyEntry("ual2-slide-exit", "滑铲结束", "移动", "Slide_Exit", 0.5),
  makeLegacyEntry("ual2-slide-loop", "滑铲循环", "移动", "Slide_Loop", 2.0),
  makeLegacyEntry("ual2-slide-start", "滑铲开始", "移动", "Slide_Start", 0.83),
  makeLegacyEntry("ual2-sword-block", "持剑格挡", "其他动作", "Sword_Block", 1.23),
  makeLegacyEntry("ual2-sword-dash", "持剑冲刺", "移动", "Sword_Dash_RM", 1.57),
  makeLegacyEntry("ual2-sword-a", "剑击 A", "其他动作", "Sword_Regular_A", 0.43),
  makeLegacyEntry("ual2-sword-a-recovery", "剑击 A 收招", "其他动作", "Sword_Regular_A_Rec", 0.97),
  makeLegacyEntry("ual2-sword-b", "剑击 B", "其他动作", "Sword_Regular_B", 0.53),
  makeLegacyEntry("ual2-sword-b-recovery", "剑击 B 收招", "其他动作", "Sword_Regular_B_Rec", 1.03),
  makeLegacyEntry("ual2-sword-c", "剑击 C", "其他动作", "Sword_Regular_C", 2.0),
  makeLegacyEntry("ual2-sword-combo", "连续剑击", "其他动作", "Sword_Regular_Combo", 3.0),
  makeLegacyEntry("ual2-tree-chopping", "砍树", "其他动作", "TreeChopping_Loop", 0.97),
  makeLegacyEntry("ual2-walk-carry", "搬运行走", "移动", "Walk_Carry_Loop", 2.0),
  makeLegacyEntry("ual2-yes", "点头回应", "待机", "Yes", 2.5),
  makeLegacyEntry("ual2-zombie-idle", "僵尸待机", "待机", "Zombie_Idle_Loop", 1.33),
  makeLegacyEntry("ual2-zombie-scratch", "僵尸抓挠", "其他动作", "Zombie_Scratch", 1.8),
  makeLegacyEntry("ual2-zombie-walk-forward", "僵尸行走", "移动", "Zombie_Walk_Fwd_Loop", 1.33),
  makeLegacyEntry("idle-stand", "站立待机", "待机", "A_INP_Idle", 2.71),
  makeLegacyEntry("walk-forward", "行走循环", "移动", "A_INP_WalkFwd_Loop", 1.08),
  makeLegacyEntry("chair-loop", "坐姿循环", "坐姿", "A_chair_loop01", 4.0),
];

function makeUnrealEntry(entry: AnimationCatalogEntry): AnimationLibraryEntry {
  const actionType = asActionType(entry.actionType);
  const actionTypeLabel = getAnimationActionTypeLabel(actionType);
  return {
    id: entry.id,
    name: entry.name,
    category: actionTypeLabel,
    fileUrl: ANIMATION_LIBRARY_FILE_URL,
    clipName: entry.clipName,
    durationSeconds: entry.durationSeconds,
    source: "unreal",
    sourceLabel: "虚幻导入",
    groupId: entry.groupId as AnimationLibraryGroupId,
    groupLabel: entry.groupLabel,
    packId: entry.packId,
    packLabel: entry.packLabel,
    actionType,
    actionTypeLabel,
    dedupeKey: entry.dedupeKey,
    isIdleVariant: entry.isIdleVariant,
    sourcePack: entry.sourcePack,
    sourceAssetPath: entry.sourceAssetPath,
    sourceAssetName: entry.sourceAssetName,
    sourceSkeleton: entry.sourceSkeleton,
  };
}

export const ANIMATION_LIBRARY: AnimationLibraryEntry[] = [
  ...LEGACY_ANIMATION_LIBRARY,
  ...ANIMATION_CATALOG_ENTRIES.map(makeUnrealEntry),
];

export function filterAnimationLibraryEntries(
  entries: readonly AnimationLibraryEntry[],
  filters: AnimationLibraryFilters = {},
): AnimationLibraryEntry[] {
  const { groupId = "all", packId = "all", actionType = "all" } = filters;
  return entries.filter(
    (entry) =>
      (groupId === "all" || entry.groupId === groupId) &&
      (packId === "all" || entry.packId === packId) &&
      (actionType === "all" || entry.actionType === actionType),
  );
}

export function getAnimationLibraryEntry(id: string | undefined): AnimationLibraryEntry | undefined {
  return ANIMATION_LIBRARY.find((entry) => entry.id === id);
}
