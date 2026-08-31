import type { DramaShotBlockingSketchPose } from "@/api/media/drama";
import { ANIMATION_CATALOG_ENTRIES } from "../../../../../config/animationCatalogEntries.ts";

// 静态姿势按动作片段时长的比例取样：片段开头的过渡帧不稳定，默认取中段。
// 仅当片段的稳定姿势不在中段时（如 LayToIdle 的躺姿在开头）单独指定比例。
export const DEFAULT_POSE_SAMPLE_TIME_RATIO = 0.5;

export interface Blocking3dPoseClipConfig {
  names: readonly string[];
  sampleTimeRatio?: number;
}

const CATALOG_CLIP_NAMES = new Map<string, string>(
  ANIMATION_CATALOG_ENTRIES.map((entry) => [entry.id, entry.clipName]),
);

function rootMotionClipNames(ids: readonly string[]): string[] {
  return ids.map((id) => {
    const clipName = CATALOG_CLIP_NAMES.get(id);
    if (!clipName) throw new Error(`分镜姿势映射缺少动画目录条目：${id}`);
    return clipName;
  });
}

const POSE_CLIPS: Record<
  DramaShotBlockingSketchPose,
  Blocking3dPoseClipConfig
> = {
  // 分镜优先使用策选清单中的 root-motion 片段；旧名称只作为已有布局和旧代理
  // 文件的兼容别名。映射通过目录 ID 建立，避免凭字符串猜测 GLB 片段名。
  standing: {
    names: [
      ...rootMotionClipNames([
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
      ...rootMotionClipNames([
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
      ...rootMotionClipNames([
        "unreal-daily-male-locomotion-crouch-forward",
        "unreal-misc-scared-crouching-loop",
      ]),
      "Crouch_Idle_Loop",
      "Crouch_Fwd_Loop",
    ],
  },
  kneeling: {
    names: [
      ...rootMotionClipNames([
        "unreal-misc-scared-knees-hands-head",
        "unreal-misc-preacher-pray-ground",
      ]),
      "Fixing_Kneeling",
    ],
  },
  // LayToIdle 从躺姿过渡到站姿，躺姿只在片段开头；取中段会截到半起身动作。
  lying: { names: ["LayToIdle", "Death01"], sampleTimeRatio: 0.05 },
  // The published UAL2 compatibility aliases have no safe prone clip. Keep
  // prone explicit so it never silently becomes a crouch pose; crouching,
  // kneeling, and running prefer the catalog root-motion clips above.
  prone: { names: ["Prone_Idle_Loop"] },
  walking: {
    names: [
      ...rootMotionClipNames([
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
      ...rootMotionClipNames([
        "unreal-misc-clazy-jog-forward",
        "unreal-daily-male-locomotion-jog-forward",
        "unreal-daily-male-locomotion-run-forward",
      ]),
      "Sprint_Loop",
      "Jog_Fwd_Loop",
    ],
  },
  // 当前 root-motion 策选清单没有可靠的手指指向片段；保留旧布局的
  // 兼容别名，但不把说话或笑声手势伪装成“指向”。
  pointing: { names: ["OverhandThrow", "Pistol_Aim_Neutral", "Spell_Simple_Shoot"] },
  holding: {
    names: [
      ...rootMotionClipNames(["unreal-misc-preacher-walk-book"]),
      "Walk_Carry_Loop",
      "Idle_Lantern_Loop",
      "PickUp_Table",
    ],
  },
  interacting: {
    names: [
      ...rootMotionClipNames([
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
      ...rootMotionClipNames(["unreal-hand-combat-lucy-attack"]),
      "Melee_Hook",
      "Punch_Cross",
      "Punch_Jab",
    ],
  },
  sword: {
    names: [
      ...rootMotionClipNames(["unreal-weapon-combat-sword-pro-weak-attack"]),
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

/** 返回统一动画文件实际支持的姿势，避免 UI 暴露会抛错的旧选项。 */
export function getAvailableBlocking3dPoses(
  availableClipNames: Iterable<string>,
): DramaShotBlockingSketchPose[] {
  const available = new Set(availableClipNames);
  return POSE_NAMES.filter((pose) => {
    try {
      resolveBlocking3dPoseClip(pose, available);
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
