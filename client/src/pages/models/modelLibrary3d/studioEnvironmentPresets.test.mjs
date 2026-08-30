import assert from "node:assert/strict";
import test from "node:test";

import {
  getStudioEnvironmentPreset,
  getStudioEnvironmentProjectionCenterHeightMeters,
  getStudioEnvironmentProjectionCenterHeightRatio,
} from "./studioEnvironmentPresets.ts";

test("通用 HDRI 预设默认把投射中心放在半球圆半径的 10%", () => {
  const preset = getStudioEnvironmentPreset("exterior");

  assert.equal(preset.projectionCenterHeightRatio, 0.1);
  assert.equal(getStudioEnvironmentProjectionCenterHeightRatio(undefined), 0.1);
  assert.equal(getStudioEnvironmentProjectionCenterHeightMeters("exterior", 15), 0.75);
});

test("通用 HDRI 的投射中心比例不随半球直径变化而漂移", () => {
  assert.equal(getStudioEnvironmentProjectionCenterHeightMeters("exterior", 5), 0.25);
  assert.equal(getStudioEnvironmentProjectionCenterHeightMeters("exterior", 30), 1.5);
  assert.equal(getStudioEnvironmentProjectionCenterHeightRatio(0.05), 0.1);
  assert.equal(getStudioEnvironmentProjectionCenterHeightRatio(0.45), 0.4);
});
