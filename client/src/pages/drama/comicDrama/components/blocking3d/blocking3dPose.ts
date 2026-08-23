import type { DramaShotBlockingSketchPose } from "@/api/media/drama";

export interface Blocking3dPoseClipConfig {
  names: readonly string[];
  sampleTime: number;
}
const POSE_CLIPS: Record<DramaShotBlockingSketchPose, Blocking3dPoseClipConfig> = {
  standing: { names: ["Idle_Loop", "Idle_No_Loop", "A_TPose"], sampleTime: 0.25 },
  talking: { names: ["Idle_Talking_Loop", "Idle_Rail_Call", "Yes"], sampleTime: 0.3 },
  arms_crossed: { names: ["Idle_FoldArms_Loop", "Idle_No_Loop"], sampleTime: 0.25 },
  sitting: { names: ["Sitting_Idle_Loop", "Sitting_Talking_Loop", "Sitting_Enter"], sampleTime: 0.45 },
  crouching: { names: ["Crouch_Idle_Loop", "Crouch_Fwd_Loop"], sampleTime: 0.25 },
  kneeling: { names: ["Fixing_Kneeling"], sampleTime: 0.35 },
  lying: { names: ["LayToIdle", "Death01"], sampleTime: 0.02 },
  // Quaternius UAL1/UAL2 does not publish a separate prone clip. The same
  // LayToIdle clip is the closest stable ground pose; the semantic name is
  // kept in the snapshot so a future prone-specific rig can be swapped in.
  prone: { names: ["LayToIdle", "Death01"], sampleTime: 0.02 },
  walking: { names: ["Walk_Loop", "Walk_Formal_Loop", "Walk_Carry_Loop"], sampleTime: 0.35 },
  running: { names: ["Sprint_Loop", "Jog_Fwd_Loop"], sampleTime: 0.25 },
  pointing: { names: ["Pistol_Aim_Neutral", "Spell_Simple_Shoot", "OverhandThrow"], sampleTime: 0.35 },
  holding: { names: ["Walk_Carry_Loop", "Idle_Lantern_Loop", "PickUp_Table"], sampleTime: 0.18 },
  interacting: { names: ["Interact", "Chest_Open", "Farm_Harvest"], sampleTime: 0.55 },
  fighting: { names: ["Punch_Cross", "Punch_Jab", "Melee_Hook"], sampleTime: 0.28 },
  sword: { names: ["Sword_Idle", "Sword_Block", "Sword_Regular_A"], sampleTime: 0.25 },
};

export function getBlocking3dPoseClipConfig(pose: DramaShotBlockingSketchPose): Blocking3dPoseClipConfig {
  return POSE_CLIPS[pose];
}

export function resolveBlocking3dPoseClip(
  pose: DramaShotBlockingSketchPose,
  availableClipNames: Iterable<string>,
): { clipName: string; sampleTime: number } {
  const available = new Set(availableClipNames);
  const config = getBlocking3dPoseClipConfig(pose);
  const clipName = config.names.find((name) => available.has(name));
  if (!clipName) {
    throw new Error(`3D 姿势“${pose}”没有可用的动作片段。`);
  }
  return { clipName, sampleTime: config.sampleTime };
}
