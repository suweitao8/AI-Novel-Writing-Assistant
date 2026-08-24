const assert = require("node:assert/strict");
const { test } = require("node:test");
const { shouldSkipDramaKeyframe } = require("../dist/services/drama/production/DramaBatchOrchestrator.js");

const doneShot = {
  keyframeData: JSON.stringify({ status: "done", url: "/api/drama/shot-images/shot-1/keyframe" }),
  blockingSketchData: null,
};

test("统一风格重生成会处理已有首帧，但仍阻止未确认的摆位草图", () => {
  assert.equal(shouldSkipDramaKeyframe(doneShot, false), true);
  assert.equal(shouldSkipDramaKeyframe(doneShot, true), false);
  assert.equal(
    shouldSkipDramaKeyframe({
      ...doneShot,
      blockingSketchData: JSON.stringify({
        status: "draft",
        version: 1,
        url: "/draft.png",
        scene: { assetId: "scene-1", stateId: "state-1", imageUrl: "/scene.png", yawDeg: 0, pitchDeg: 0, fovDeg: 60 },
        actors: [],
      }),
    }, true),
    true,
  );
});
