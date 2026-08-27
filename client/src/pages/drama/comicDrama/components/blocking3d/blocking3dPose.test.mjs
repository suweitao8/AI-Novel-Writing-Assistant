import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_POSE_SAMPLE_TIME_RATIO,
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

test("躺姿片段的稳定姿势在开头，保留开头附近取样", () => {
  const clip = resolveBlocking3dPoseClip("lying", ["LayToIdle", "Idle_Loop"]);
  assert.equal(clip.clipName, "LayToIdle");
  assert.ok(clip.sampleTimeRatio < 0.1);
});

test("比例按片段实际时长换算成具体时间", () => {
  assert.equal(poseSampleTimeFromTrack({ duration: 3.2 }, 0.5), 1.6);
  assert.ok(Math.abs(poseSampleTimeFromTrack({ duration: 1.4 }, 0.05) - 0.07) < 1e-9);
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
    "standing", "talking", "arms_crossed", "sitting", "crouching", "kneeling",
    "lying", "prone", "walking", "running", "pointing", "holding",
    "interacting", "fighting", "sword",
  ];
  for (const pose of poses) {
    const config = getBlocking3dPoseClipConfig(pose);
    assert.ok(config.names.length > 0, `${pose} 应有动作片段`);
    const ratio = config.sampleTimeRatio ?? DEFAULT_POSE_SAMPLE_TIME_RATIO;
    assert.ok(ratio >= 0 && ratio <= 1, `${pose} 比例越界`);
  }
});
