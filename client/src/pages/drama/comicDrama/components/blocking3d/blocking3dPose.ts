import type { DramaShotBlockingSketchPose } from "@/api/media/drama";

// 静态姿势按动作片段时长的比例取样：片段开头的过渡帧不稳定，默认取中段。
// 仅当片段的稳定姿势不在中段时（如 LayToIdle 的躺姿在开头）单独指定比例。
export const DEFAULT_POSE_SAMPLE_TIME_RATIO = 0.5;

export interface Blocking3dPoseClipConfig {
  names: readonly string[];
  sampleTimeRatio?: number;
}
const POSE_CLIPS: Record<
  DramaShotBlockingSketchPose,
  Blocking3dPoseClipConfig
> = {
  // UAL2/Cine57 names come first. The legacy names stay as compatibility
  // aliases for already-authored layouts and older proxy files.
  standing: { names: ["A_INP_Idle", "Idle_Loop", "Idle_No_Loop", "A_TPose"] },
  talking: {
    names: [
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
  crouching: { names: ["Crouch_Idle_Loop", "Crouch_Fwd_Loop"] },
  kneeling: { names: ["Fixing_Kneeling"] },
  // LayToIdle 从躺姿过渡到站姿，躺姿只在片段开头；取中段会截到半起身动作。
  lying: { names: ["LayToIdle", "Death01"], sampleTimeRatio: 0.05 },
  // The published UAL2 file has no prone/crouch/kneeling/running clip. Keep
  // the old names only so an older proxy can still resolve them; the current
  // UAL2 viewer filters these options out and old layouts normalize safely.
  prone: { names: ["Prone_Idle_Loop"] },
  walking: {
    names: [
      "A_INP_WalkFwd_Loop",
      "Walk_Loop",
      "Walk_Formal_Loop",
      "Walk_Carry_Loop",
      "Zombie_Walk_Fwd_Loop",
    ],
  },
  running: { names: ["Sprint_Loop", "Jog_Fwd_Loop"] },
  pointing: {
    names: ["OverhandThrow", "Pistol_Aim_Neutral", "Spell_Simple_Shoot"],
  },
  holding: { names: ["Walk_Carry_Loop", "Idle_Lantern_Loop", "PickUp_Table"] },
  interacting: {
    names: [
      "Chest_Open",
      "Farm_Harvest",
      "Consume",
      "Farm_PlantSeed",
      "Farm_Watering",
      "Interact",
    ],
  },
  fighting: { names: ["Melee_Hook", "Punch_Cross", "Punch_Jab"] },
  sword: { names: ["Sword_Idle", "Sword_Block", "Sword_Regular_A"] },
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
