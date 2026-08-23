import assert from "node:assert/strict";
import test from "node:test";

import {
  PANORAMA_MAX_PITCH_DEGREES,
  PANORAMA_MAX_PITCH_RAD,
  clampPanoramaPitch,
  getCanvasPanoramaOffsetY,
  updateCanvasPanoramaOffsetX,
  updatePanoramaPitch,
  updatePanoramaYaw,
} from "../src/components/common/panoramaInteraction.ts";

test("全景图水平拖拽与画面方向一致", () => {
  assert.equal(updatePanoramaYaw(0, -20, 0.01), -0.2);
  assert.equal(updatePanoramaYaw(0, 20, 0.01), 0.2);
  assert.equal(updateCanvasPanoramaOffsetX(100, -20, 2), 60);
  assert.equal(updateCanvasPanoramaOffsetX(100, 20, 2), 140);
});

test("全景图俯仰角限制为上下 60 度", () => {
  assert.equal(PANORAMA_MAX_PITCH_DEGREES, 60);
  assert.equal(clampPanoramaPitch(PANORAMA_MAX_PITCH_RAD * 2), PANORAMA_MAX_PITCH_RAD);
  assert.equal(clampPanoramaPitch(-PANORAMA_MAX_PITCH_RAD * 2), -PANORAMA_MAX_PITCH_RAD);
  assert.equal(updatePanoramaPitch(0, -1000, 0.01), -PANORAMA_MAX_PITCH_RAD);
  assert.equal(updatePanoramaPitch(0, 1000, 0.01), PANORAMA_MAX_PITCH_RAD);
});

test("Canvas2D 回退根据俯仰角限制垂直裁剪范围", () => {
  assert.equal(getCanvasPanoramaOffsetY(0, 1024, 512), 0);
  assert.equal(getCanvasPanoramaOffsetY(PANORAMA_MAX_PITCH_RAD, 1024, 512), 256);
  assert.equal(getCanvasPanoramaOffsetY(-PANORAMA_MAX_PITCH_RAD, 1024, 512), -256);
  assert.equal(getCanvasPanoramaOffsetY(PANORAMA_MAX_PITCH_RAD * 2, 1024, 512), 256);
});
