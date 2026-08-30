/**
 * 动画库目录：内置角色动画的静态清单。
 *
 * 与模型库同一套「静态目录 + 前端静态文件」约定：目录只是数据，不做任何
 * 运行时探测；GLB 放 client/public/anims/ 由前端静态服务。文件来自 Cine57
 * （UE 5.7）动画经 FBX 导出、按绑定姿态差离线重定向到 UAL2 骨架后合并生成，
 * 一个 GLB 内含 UAL2 角色与全部动作片段，目录条目用 clipName 指向其中的动画。
 */

/** 动画库目录条目。 */
export interface AnimationLibraryEntry {
  id: string;
  name: string;
  category: string;
  /** 片段所在 GLB 的访问地址。 */
  fileUrl: string;
  /** GLB 内的动作片段名，与 glTF animations[].name 一致。 */
  clipName: string;
  /** 片段时长（秒）。 */
  durationSeconds: number;
  source: string;
}

export const ANIMATION_LIBRARY_FILE_URL = "/anims/cine57/UAL2_UE_Anims.glb";
export const ANIMATION_LIBRARY_SOURCE = "Cine57";
const UAL2_SOURCE = "UAL2";

/** 动画分类页签（与目录条目的 category 对应）。 */
export const ANIMATION_LIBRARY_CATEGORIES = ["待机", "移动", "坐姿", "其他动作"] as const;

function makeUal2Entry(
  id: string,
  name: string,
  category: string,
  clipName: string,
  durationSeconds: number,
): AnimationLibraryEntry {
  return {
    id,
    name,
    category,
    fileUrl: ANIMATION_LIBRARY_FILE_URL,
    clipName,
    durationSeconds,
    source: UAL2_SOURCE,
  };
}

export const ANIMATION_LIBRARY: AnimationLibraryEntry[] = [
  makeUal2Entry("ual2-a-tpose", "T 形姿势", "其他动作", "A_TPose", 2.5),
  makeUal2Entry("ual2-chest-open", "打开胸口", "其他动作", "Chest_Open", 1.37),
  makeUal2Entry("ual2-climb-up", "攀爬上升", "移动", "ClimbUp_1m_RM", 0.67),
  makeUal2Entry("ual2-consume", "进食", "其他动作", "Consume", 1.33),
  makeUal2Entry("ual2-farm-harvest", "收获作物", "其他动作", "Farm_Harvest", 2.5),
  makeUal2Entry("ual2-farm-plant-seed", "播种", "其他动作", "Farm_PlantSeed", 2.77),
  makeUal2Entry("ual2-farm-watering", "浇水", "其他动作", "Farm_Watering", 3.8),
  makeUal2Entry("ual2-hit-knockback", "受击后退", "其他动作", "Hit_Knockback", 0.83),
  makeUal2Entry(
    "ual2-hit-knockback-root-motion",
    "受击后退（位移）",
    "移动",
    "Hit_Knockback_RM",
    0.83,
  ),
  makeUal2Entry("ual2-idle-fold-arms", "抱臂待机", "待机", "Idle_FoldArms_Loop", 2.5),
  makeUal2Entry("ual2-idle-lantern", "提灯待机", "待机", "Idle_Lantern_Loop", 2.5),
  makeUal2Entry("ual2-idle-no-loop", "自然待机", "待机", "Idle_No_Loop", 2.5),
  makeUal2Entry("ual2-idle-rail-call", "呼叫待机", "待机", "Idle_Rail_Call", 2.5),
  makeUal2Entry("ual2-idle-rail-loop", "扶栏待机", "待机", "Idle_Rail_Loop", 2.5),
  makeUal2Entry("ual2-idle-shield-break", "盾牌破坏", "其他动作", "Idle_Shield_Break", 1.07),
  makeUal2Entry("ual2-idle-shield-loop", "持盾待机", "待机", "Idle_Shield_Loop", 2.5),
  makeUal2Entry(
    "ual2-idle-talking-phone",
    "打电话待机",
    "待机",
    "Idle_TalkingPhone_Loop",
    2.93,
  ),
  makeUal2Entry("ual2-lay-to-idle", "躺姿起身", "其他动作", "LayToIdle", 1.53),
  makeUal2Entry("ual2-melee-hook", "近战钩击", "其他动作", "Melee_Hook", 0.47),
  makeUal2Entry("ual2-melee-hook-recovery", "近战钩击收招", "其他动作", "Melee_Hook_Rec", 0.6),
  makeUal2Entry("ual2-ninja-jump-idle", "跳跃待机", "待机", "NinjaJump_Idle_Loop", 2.0),
  makeUal2Entry("ual2-ninja-jump-land", "跳跃落地", "移动", "NinjaJump_Land", 1.27),
  makeUal2Entry("ual2-ninja-jump-start", "起跳", "移动", "NinjaJump_Start", 0.97),
  makeUal2Entry("ual2-overhand-throw", "过肩投掷", "其他动作", "OverhandThrow", 1.33),
  makeUal2Entry("ual2-shield-dash", "持盾冲刺", "移动", "Shield_Dash_RM", 1.1),
  makeUal2Entry("ual2-shield-one-shot", "持盾动作", "其他动作", "Shield_OneShot", 0.83),
  makeUal2Entry("ual2-slide-exit", "滑铲结束", "移动", "Slide_Exit", 0.5),
  makeUal2Entry("ual2-slide-loop", "滑铲循环", "移动", "Slide_Loop", 2.0),
  makeUal2Entry("ual2-slide-start", "滑铲开始", "移动", "Slide_Start", 0.83),
  makeUal2Entry("ual2-sword-block", "持剑格挡", "其他动作", "Sword_Block", 1.23),
  makeUal2Entry("ual2-sword-dash", "持剑冲刺", "移动", "Sword_Dash_RM", 1.57),
  makeUal2Entry("ual2-sword-a", "剑击 A", "其他动作", "Sword_Regular_A", 0.43),
  makeUal2Entry("ual2-sword-a-recovery", "剑击 A 收招", "其他动作", "Sword_Regular_A_Rec", 0.97),
  makeUal2Entry("ual2-sword-b", "剑击 B", "其他动作", "Sword_Regular_B", 0.53),
  makeUal2Entry("ual2-sword-b-recovery", "剑击 B 收招", "其他动作", "Sword_Regular_B_Rec", 1.03),
  makeUal2Entry("ual2-sword-c", "剑击 C", "其他动作", "Sword_Regular_C", 2.0),
  makeUal2Entry("ual2-sword-combo", "连续剑击", "其他动作", "Sword_Regular_Combo", 3.0),
  makeUal2Entry("ual2-tree-chopping", "砍树", "其他动作", "TreeChopping_Loop", 0.97),
  makeUal2Entry("ual2-walk-carry", "搬运行走", "移动", "Walk_Carry_Loop", 2.0),
  makeUal2Entry("ual2-yes", "点头回应", "待机", "Yes", 2.5),
  makeUal2Entry("ual2-zombie-idle", "僵尸待机", "待机", "Zombie_Idle_Loop", 1.33),
  makeUal2Entry("ual2-zombie-scratch", "僵尸抓挠", "其他动作", "Zombie_Scratch", 1.8),
  makeUal2Entry("ual2-zombie-walk-forward", "僵尸行走", "移动", "Zombie_Walk_Fwd_Loop", 1.33),
  { id: "idle-stand", name: "站立待机", category: "待机", fileUrl: ANIMATION_LIBRARY_FILE_URL, clipName: "A_INP_Idle", durationSeconds: 2.71, source: ANIMATION_LIBRARY_SOURCE },
  { id: "walk-forward", name: "行走循环", category: "移动", fileUrl: ANIMATION_LIBRARY_FILE_URL, clipName: "A_INP_WalkFwd_Loop", durationSeconds: 1.08, source: ANIMATION_LIBRARY_SOURCE },
  { id: "chair-loop", name: "坐姿循环", category: "坐姿", fileUrl: ANIMATION_LIBRARY_FILE_URL, clipName: "A_chair_loop01", durationSeconds: 4.0, source: ANIMATION_LIBRARY_SOURCE },
];

export function getAnimationLibraryEntry(id: string | undefined): AnimationLibraryEntry | undefined {
  return ANIMATION_LIBRARY.find((entry) => entry.id === id);
}
