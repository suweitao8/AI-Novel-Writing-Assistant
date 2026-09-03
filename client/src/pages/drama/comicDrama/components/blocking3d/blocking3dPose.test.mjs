import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_POSE_SAMPLE_TIME_RATIO,
  getAvailableBlocking3dPoses,
  getBlocking3dPoseClipConfig,
  poseSampleTimeFromTrack,
  resolveBlocking3dPoseClip,
} from "./blocking3dPose.ts";

test("静态姿势默认按片段时长中段取样，避开开头过渡帧", () => {
  const available = ["Idle_Loop", "Walk_Loop", "LayToIdle"];
  for (const pose of ["standing", "walking"]) {
    const clip = resolveBlocking3dPoseClip(pose, available);
    assert.equal(clip.sampleTimeRatio, DEFAULT_POSE_SAMPLE_TIME_RATIO);
    assert.equal(clip.sampleTimeRatio, 0.5);
  }
});

test("统一 UAL2 动画文件的 Cine57 片段可用于分镜语义姿势", () => {
  const available = ["A_INP_Idle", "A_INP_WalkFwd_Loop", "A_chair_loop01"];
  assert.equal(
    resolveBlocking3dPoseClip("standing", available).clipName,
    "A_INP_Idle",
  );
  assert.equal(
    resolveBlocking3dPoseClip("walking", available).clipName,
    "A_INP_WalkFwd_Loop",
  );
  assert.equal(
    resolveBlocking3dPoseClip("sitting", available).clipName,
    "A_chair_loop01",
  );
});

test("分镜姿势优先使用原生基础待机片段，并保留旧兼容动作", () => {
  const available = [
    "standing",
    "A_INP_Idle",
    "A_INP_WalkFwd_Loop",
    "Jog_Fwd_Loop",
    "Crouch_Idle_Loop",
    "Idle_Rail_Call",
    "Chest_Open",
    "Melee_Hook",
    "Sword_Block",
  ];
  assert.equal(resolveBlocking3dPoseClip("standing", available).clipName, "standing");
  assert.equal(resolveBlocking3dPoseClip("walking", available).clipName, "A_INP_WalkFwd_Loop");
  assert.equal(resolveBlocking3dPoseClip("running", available).clipName, "Jog_Fwd_Loop");
  assert.equal(resolveBlocking3dPoseClip("crouching", available).clipName, "Crouch_Idle_Loop");
  assert.equal(resolveBlocking3dPoseClip("talking", available).clipName, "Idle_Rail_Call");
  assert.equal(resolveBlocking3dPoseClip("interacting", available).clipName, "Chest_Open");
  assert.equal(resolveBlocking3dPoseClip("fighting", available).clipName, "Melee_Hook");
  assert.equal(resolveBlocking3dPoseClip("sword", available).clipName, "Sword_Block");
  assert.deepEqual(
    getBlocking3dPoseClipConfig("pointing").names.slice(0, 3),
    ["OverhandThrow", "Pistol_Aim_Neutral", "Spell_Simple_Shoot"],
  );
});

test("躺姿片段的稳定姿势在开头，保留开头附近取样", () => {
  const clip = resolveBlocking3dPoseClip("lying", ["LayToIdle", "Idle_Loop"]);
  assert.equal(clip.clipName, "LayToIdle");
  assert.ok(clip.sampleTimeRatio < 0.1);
});

test("UAL2 没有对应动作时不会把趴姿误映射成蹲伏", () => {
  assert.throws(
    () => resolveBlocking3dPoseClip("prone", ["LayToIdle", "A_INP_Idle"]),
    /没有可用的动作片段/,
  );
});

test("分镜自动构图的上方主体使用 UAL2 可用的低姿态片段", () => {
  const clip = resolveBlocking3dPoseClip("crouching", ["Zombie_Idle_Loop", "A_INP_Idle"]);
  assert.equal(clip.clipName, "Zombie_Idle_Loop");
});

test("动画文件只向分镜姿势选择器暴露真实存在的 UAL2 片段", () => {
  const available = [
    "A_INP_Idle",
    "Idle_Rail_Call",
    "Idle_FoldArms_Loop",
    "A_chair_loop01",
    "LayToIdle",
    "A_INP_WalkFwd_Loop",
    "OverhandThrow",
    "Walk_Carry_Loop",
    "Chest_Open",
    "Melee_Hook",
    "Sword_Block",
  ];
  assert.deepEqual(getAvailableBlocking3dPoses(available), [
    "standing",
    "talking",
    "arms_crossed",
    "sitting",
    "lying",
    "walking",
    "pointing",
    "holding",
    "interacting",
    "fighting",
    "sword",
  ]);
});

test("比例按片段实际时长换算成具体时间", () => {
  assert.equal(poseSampleTimeFromTrack({ duration: 3.2 }, 0.5), 1.6);
  assert.ok(
    Math.abs(poseSampleTimeFromTrack({ duration: 1.4 }, 0.05) - 0.07) < 1e-9,
  );
  assert.ok(poseSampleTimeFromTrack({ duration: 2 }, 1.5) <= 2);
});

test("片段缺少有效时长时回退到开头，不产生 NaN", () => {
  assert.equal(poseSampleTimeFromTrack(undefined, 0.5), 0);
  assert.equal(poseSampleTimeFromTrack({}, 0.5), 0);
  assert.equal(poseSampleTimeFromTrack({ duration: 0 }, 0.5), 0);
  assert.equal(poseSampleTimeFromTrack({ duration: Number.NaN }, 0.5), 0);
});

test("每个姿势都声明了动作片段且比例在 0 到 1 之间", () => {
  const poses = [
    "standing",
    "talking",
    "arms_crossed",
    "sitting",
    "crouching",
    "kneeling",
    "lying",
    "prone",
    "walking",
    "running",
    "pointing",
    "holding",
    "interacting",
    "fighting",
    "sword",
  ];
  for (const pose of poses) {
    const config = getBlocking3dPoseClipConfig(pose);
    assert.ok(config.names.length > 0, `${pose} 应有动作片段`);
    const ratio = config.sampleTimeRatio ?? DEFAULT_POSE_SAMPLE_TIME_RATIO;
    assert.ok(ratio >= 0 && ratio <= 1, `${pose} 比例越界`);
  }
});
