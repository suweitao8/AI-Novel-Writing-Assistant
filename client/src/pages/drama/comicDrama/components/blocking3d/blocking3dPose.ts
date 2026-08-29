import type { DramaShotBlockingSketchPose } from "@/api/media/drama";

// 静态姿势按动作片段时长的比例取样：片段开头的过渡帧不稳定，默认取中段。
// 仅当片段的稳定姿势不在中段时（如 LayToIdle 的躺姿在开头）单独指定比例。
export const DEFAULT_POSE_SAMPLE_TIME_RATIO = 0.5;

export interface Blocking3dPoseClipConfig {
  names: readonly string[];
  sampleTimeRatio?: number;
}
const POSE_CLIPS: Record<DramaShotBlockingSketchPose, Blocking3dPoseClipConfig> = {
  standing: { names: ["Idle_Loop", "Idle_No_Loop", "A_INP_Idle", "A_TPose"] },
  talking: { names: ["Idle_Talking_Loop", "Idle_Rail_Call", "Yes"] },
  arms_crossed: { names: ["Idle_FoldArms_Loop", "Idle_No_Loop"] },
  sitting: { names: ["Sitting_Idle_Loop", "Sitting_Talking_Loop", "Sitting_Enter", "A_chair_loop01"] },
  crouching: { names: ["Crouch_Idle_Loop", "Crouch_Fwd_Loop"] },
  kneeling: { names: ["Fixing_Kneeling"] },
  // LayToIdle 从躺姿过渡到站姿，躺姿只在片段开头；取中段会截到半起身动作。
  lying: { names: ["LayToIdle", "Death01"], sampleTimeRatio: 0.05 },
  // Quaternius UAL1/UAL2 does not publish a separate prone clip. Falling back
  // to LayToIdle makes the actor visibly supine, so use the supported crouch
  // pose until a prone-specific rig is available.
  prone: { names: ["Prone_Idle_Loop", "Crouch_Idle_Loop", "Crouch_Fwd_Loop"] },
  walking: { names: ["Walk_Loop", "Walk_Formal_Loop", "Walk_Carry_Loop", "A_INP_WalkFwd_Loop"] },
  running: { names: ["Sprint_Loop", "Jog_Fwd_Loop"] },
  pointing: { names: ["Pistol_Aim_Neutral", "Spell_Simple_Shoot", "OverhandThrow"] },
  holding: { names: ["Walk_Carry_Loop", "Idle_Lantern_Loop", "PickUp_Table"] },
  interacting: { names: ["Interact", "Chest_Open", "Farm_Harvest"] },
  fighting: { names: ["Punch_Cross", "Punch_Jab", "Melee_Hook"] },
  sword: { names: ["Sword_Idle", "Sword_Block", "Sword_Regular_A"] },
};

export function getBlocking3dPoseClipConfig(pose: DramaShotBlockingSketchPose): Blocking3dPoseClipConfig {
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
  return { clipName, sampleTimeRatio: config.sampleTimeRatio ?? DEFAULT_POSE_SAMPLE_TIME_RATIO };
}

// 把比例换算成动作片段内的具体时间；track 缺少有效时长时回退到片段开头。
export function poseSampleTimeFromTrack(track: unknown, sampleTimeRatio: number): number {
  const duration = (track as { duration?: unknown } | null | undefined)?.duration;
  if (typeof duration !== "number" || !Number.isFinite(duration) || duration <= 0) return 0;
  const ratio = Math.max(0, Math.min(1, sampleTimeRatio));
  return ratio * duration;
}
