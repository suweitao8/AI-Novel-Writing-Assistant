import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_BLOCKING_3D_LIGHTING_PROFILE,
  MODEL_PREVIEW_LIGHTING_PROFILE,
  resolveBlocking3dLightingProfile,
} from "./blocking3dEnvironmentLightingProfile.ts";

test("模型预览 profile 保持 HDRI 环境填充并与可见背景分离", () => {
  const defaultProfile = resolveBlocking3dLightingProfile(DEFAULT_BLOCKING_3D_LIGHTING_PROFILE);
  const modelProfile = resolveBlocking3dLightingProfile(MODEL_PREVIEW_LIGHTING_PROFILE);

  assert.equal(defaultProfile.skyboxIntensity, 1);
  assert.equal(modelProfile.skyboxIntensity, 1);
  assert.equal(modelProfile.shadowIntensity, 0.62);
  assert.equal(modelProfile.keyLightAzimuthOffsetDegrees, 180);
  assert.equal(defaultProfile.keyLightAzimuthOffsetDegrees, 0);
  assert.ok(Number.isFinite(modelProfile.skyboxIntensity));
  assert.ok(modelProfile.skyboxIntensity >= 0);
});
