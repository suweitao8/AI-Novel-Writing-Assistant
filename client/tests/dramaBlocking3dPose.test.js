import assert from "node:assert/strict";
import test from "node:test";

import {
  getBlocking3dPoseClipConfig,
  resolveBlocking3dPoseClip,
} from "../src/pages/drama/comicDrama/components/blocking3d/blocking3dPose.ts";

test("3D 姿势映射到参考项目的 Quaternius 动作片段", () => {
  assert.deepEqual(resolveBlocking3dPoseClip("sitting", ["Idle_Loop", "Sitting_Idle_Loop"]), {
    clipName: "Sitting_Idle_Loop",
    sampleTimeRatio: 0.5,
  });
  assert.equal(getBlocking3dPoseClipConfig("prone").names[0], "Prone_Idle_Loop");
});
test("没有可用动作片段时明确报错，避免静默回到站立", () => {
  assert.throws(
    () => resolveBlocking3dPoseClip("lying", ["Idle_Loop"]),
    /没有可用的动作片段/,
  );
});
