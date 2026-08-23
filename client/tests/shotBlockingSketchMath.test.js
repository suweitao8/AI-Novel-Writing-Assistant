import assert from "node:assert/strict";
import test from "node:test";

import {
  BLOCKING_SKETCH_CANVAS,
  clampBlockingSketchFov,
  clampBlockingSketchPitch,
  moveBlockingSketchActor,
  updateBlockingSketchYaw,
} from "../src/pages/drama/comicDrama/components/shotBlockingSketchMath.ts";

test("摆位草图固定为横屏 16:9，并限制全景俯仰与视场", () => {
  assert.deepEqual(BLOCKING_SKETCH_CANVAS, { width: 1280, height: 720 });
  assert.equal(clampBlockingSketchPitch(70), 60);
  assert.equal(clampBlockingSketchPitch(-70), -60);
  assert.equal(clampBlockingSketchFov(15), 40);
  assert.equal(clampBlockingSketchFov(130), 100);
});

test("全景向左拖动时视角向左环绕，跨越边界时仍保持连续", () => {
  assert.equal(updateBlockingSketchYaw(0, -30, 1), -30);
  assert.equal(updateBlockingSketchYaw(175, 20, 1), -165);
});

test("角色拖动保存为归一化坐标，并限制在画布内", () => {
  const actor = { characterName: "沈烬", x: 0.5, y: 0.5, scale: 0.5, flipX: false, zIndex: 0 };
  assert.deepEqual(moveBlockingSketchActor(actor, 0.2, -0.1), { ...actor, x: 0.7, y: 0.4 });
  assert.deepEqual(moveBlockingSketchActor(actor, 2, -2), { ...actor, x: 1, y: 0 });
});
