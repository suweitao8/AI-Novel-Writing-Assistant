import type { DramaShotBlockingSketchPose } from "@/api/media/drama";
import { ANIMATION_CATALOG_ENTRIES } from "../../../../../config/animationCatalogEntries.ts";

// 静态姿势按动作片段时长的比例取样：片段开头的过渡帧不稳定，默认取中段。
// 仅当片段的稳定姿势不在中段时（如 LayToIdle 的躺姿在开头）单独指定比例。
export const DEFAULT_POSE_SAMPLE_TIME_RATIO = 0.5;

export interface Blocking3dPoseClipConfig {
  names: readonly string[];
  sampleTimeRatio?: number;
}

export interface Blocking3dPosePresentation {
  /** 业务层请求的姿势；即使使用代理展示，也不能被资源能力改写。 */
  pose: DramaShotBlockingSketchPose;
  /** 实际绑定到 UAL2 AnimComponent 的片段。 */
  clipName: string;
  sampleTimeRatio: number;
  /** 模型实例的绝对局部欧拉角，包含 UAL2 的基础 180° 朝向。 */
  modelEulerAngles: [number, number, number];
  /** true 表示使用了声明过的代理展示，而非姿势专用片段。 */
  isApproximation: boolean;
}

const GROUND_POSE_PROXY_CLIP = "Slide_Loop";

const CATALOG_CLIP_NAMES = new Map<string, string>(
  ANIMATION_CATALOG_ENTRIES.map((entry) => [entry.id, entry.clipName]),
);

function catalogClipNames(ids: readonly string[]): string[] {
  return ids.flatMap((id) => {
    const clipName = CATALOG_CLIP_NAMES.get(id);
    return clipName ? [clipName] : [];
  });
}

const POSE_CLIPS: Record<
  DramaShotBlockingSketchPose,
  Blocking3dPoseClipConfig
> = {
  // 分镜优先使用通过原地位移门禁的策选片段；旧名称只作为已有布局和旧代理
  // 文件的兼容别名。映射通过目录 ID 建立，避免凭字符串猜测 GLB 片段名。
  standing: {
    names: [
      "standing",
      ...catalogClipNames([
        "unreal-daily-male-locomotion-idle-break-01",
        "unreal-daily-male-locomotion-idle-break-02",
      ]),
      "A_INP_Idle",
      "Idle_Loop",
      "Idle_No_Loop",
      "A_TPose",
    ],
  },
  talking: {
    names: [
      ...catalogClipNames([
        "unreal-daily-dialogue-dialogue-idle",
        "unreal-daily-dialogue-serious-idle",
        "unreal-daily-dialogue-serious-talk",
        "unreal-daily-dialogue-sad-talk",
      ]),
      "Idle_Rail_Call",
      "Idle_Rail_Loop",
      "Idle_TalkingPhone_Loop",
      "Idle_Talking_Loop",
      "Yes",
    ],
  },
  arms_crossed: { names: ["Idle_FoldArms_Loop", "Idle_No_Loop"] },
  sitting: {
    names: [
      "A_chair_loop01",
      "Sitting_Idle_Loop",
      "Sitting_Talking_Loop",
      "Sitting_Enter",
    ],
  },
  crouching: {
    names: [
      ...catalogClipNames([
        "unreal-daily-male-locomotion-crouch-forward",
        "unreal-misc-scared-crouching-loop",
      ]),
      "Crouch_Idle_Loop",
      "Crouch_Fwd_Loop",
      // UAL2 的通用低姿态兜底：没有人形 crouch 片段时，怪物 idle
      // 至少保持前倾的捕食姿态，不能让关系约束后的上方主体退回站立。
      "Zombie_Idle_Loop",
    ],
  },
  kneeling: {
    names: [
      ...catalogClipNames([
        "unreal-misc-scared-knees-hands-head",
        "unreal-misc-preacher-pray-ground",
      ]),
      "Fixing_Kneeling",
      "Zombie_Idle_Loop",
    ],
  },
  // LayToIdle 从躺姿过渡到站姿，躺姿只在片段开头；取中段会截到半起身动作。
  lying: { names: ["LayToIdle", "Death01"], sampleTimeRatio: 0.05 },
  // The published UAL2 compatibility aliases have no safe prone clip. Keep
  // prone explicit so it never silently becomes a crouch pose; crouching,
  // kneeling, and running prefer the catalog in-place clips above.
  prone: { names: ["Prone_Idle_Loop"] },
  walking: {
    names: [
      ...catalogClipNames([
        "unreal-misc-clazy-walk-forward",
        "unreal-daily-parkour-walk-in-place",
      ]),
      "A_INP_WalkFwd_Loop",
      "Walk_Loop",
      "Walk_Formal_Loop",
      "Walk_Carry_Loop",
      "Zombie_Walk_Fwd_Loop",
    ],
  },
  running: {
    names: [
      ...catalogClipNames([
        "unreal-misc-clazy-jog-forward",
        "unreal-daily-male-locomotion-jog-forward",
        "unreal-daily-male-locomotion-run-forward",
      ]),
      "Sprint_Loop",
      "Jog_Fwd_Loop",
    ],
  },
  // 当前原地策选清单没有可靠的手指指向片段；保留旧布局的
  // 兼容别名，但不把说话或笑声手势伪装成“指向”。
  pointing: { names: ["OverhandThrow", "Pistol_Aim_Neutral", "Spell_Simple_Shoot"] },
  holding: {
    names: [
      ...catalogClipNames(["unreal-misc-preacher-walk-book"]),
      "Walk_Carry_Loop",
      "Idle_Lantern_Loop",
      "PickUp_Table",
    ],
  },
  interacting: {
    names: [
      ...catalogClipNames([
        "unreal-interaction-activations-door-pull",
        "unreal-interaction-activations-door-push",
      ]),
      "Chest_Open",
      "Farm_Harvest",
      "Consume",
      "Farm_PlantSeed",
      "Farm_Watering",
      "Interact",
    ],
  },
  fighting: {
    names: [
      ...catalogClipNames(["unreal-hand-combat-lucy-attack"]),
      "Melee_Hook",
      "Punch_Cross",
      "Punch_Jab",
    ],
  },
  sword: {
    names: [
      ...catalogClipNames(["unreal-weapon-combat-sword-pro-weak-attack"]),
      "Sword_Idle",
      "Sword_Block",
      "Sword_Regular_A",
    ],
  },
};

const POSE_NAMES = Object.keys(POSE_CLIPS) as DramaShotBlockingSketchPose[];

export function getBlocking3dPoseClipConfig(
  pose: DramaShotBlockingSketchPose,
): Blocking3dPoseClipConfig {
  return POSE_CLIPS[pose];
}

export function resolveBlocking3dPoseClip(
  pose: DramaShotBlockingSketchPose,
  availableClipNames: Iterable<string>,
): { clipName: string; sampleTimeRatio: number } {
  const available = new Set(availableClipNames);
  const config = getBlocking3dPoseClipConfig(pose);
  const clipName = config.names.find((name) => available.has(name));
  if (!clipName) {
    throw new Error(`3D 姿势“${pose}”没有可用的动作片段。`);
  }
  return {
    clipName,
    sampleTimeRatio: config.sampleTimeRatio ?? DEFAULT_POSE_SAMPLE_TIME_RATIO,
  };
}

/**
 * 解析业务姿势到实际可渲染的 UAL2 展示。
 *
 * UAL2 提供 LayToIdle 躺姿片段，但没有安全的专用趴姿片段；“躺/趴”都是
 * 自动构图的重要空间语义，不能因为资源缺失就静默改成站立。缺少专用片段
 * 时明确使用可见的滑铲循环作为贴地代理；如果代理也不存在则报资源能力错
 * 误，避免用根节点旋转把站立模型送出取景范围。其它姿势仍要求对应动作片段存在。
 */
export function resolveBlocking3dPosePresentation(
  pose: DramaShotBlockingSketchPose,
  availableClipNames: Iterable<string>,
): Blocking3dPosePresentation {
  const available = new Set(availableClipNames);
  try {
    const clip = resolveBlocking3dPoseClip(pose, available);
    return {
      pose,
      ...clip,
      modelEulerAngles: [0, 180, 0],
      isApproximation: false,
    };
  } catch (error) {
    if (pose !== "lying" && pose !== "prone") throw error;
    if (!available.has(GROUND_POSE_PROXY_CLIP)) {
      throw new Error(`3D 姿势“${pose}”没有可用的贴地动作片段。`);
    }
    return {
      pose,
      clipName: GROUND_POSE_PROXY_CLIP,
      sampleTimeRatio: DEFAULT_POSE_SAMPLE_TIME_RATIO,
      // 滑铲片段本身已把骨骼放到地面附近；只保留 UAL2 的基础 180° 朝向，
      // 不再旋转外层模型实体，避免模型因根骨骼坐标系被推到镜头外。
      modelEulerAngles: [0, 180, 0],
      isApproximation: true,
    };
  }
}

/** 返回统一动画文件支持的真实姿势及已声明的贴地代理姿势。 */
export function getAvailableBlocking3dPoses(
  availableClipNames: Iterable<string>,
): DramaShotBlockingSketchPose[] {
  const available = new Set(availableClipNames);
  return POSE_NAMES.filter((pose) => {
    try {
      resolveBlocking3dPosePresentation(pose, available);
      return true;
    } catch {
      return false;
    }
  });
}

// 把比例换算成动作片段内的具体时间；track 缺少有效时长时回退到片段开头。
export function poseSampleTimeFromTrack(
  track: unknown,
  sampleTimeRatio: number,
): number {
  const duration = (track as { duration?: unknown } | null | undefined)
    ?.duration;
  if (
    typeof duration !== "number" ||
    !Number.isFinite(duration) ||
    duration <= 0
  )
    return 0;
  const ratio = Math.max(0, Math.min(1, sampleTimeRatio));
  return ratio * duration;
}
