import assert from "node:assert/strict";
import test from "node:test";
import * as pc from "playcanvas";

import {
  DEFAULT_BLOCKING_3D_LIGHTING_PROFILE,
  MODEL_PREVIEW_LIGHTING_PROFILE,
  createHdriEnvironmentRotation,
  resolveBlocking3dLightingProfile,
} from "./blocking3dEnvironmentLightingProfile.ts";

test("模型预览 profile 保持 HDRI 环境填充并与可见背景分离", () => {
  const defaultProfile = resolveBlocking3dLightingProfile(DEFAULT_BLOCKING_3D_LIGHTING_PROFILE);
  const modelProfile = resolveBlocking3dLightingProfile(MODEL_PREVIEW_LIGHTING_PROFILE);

  assert.equal(defaultProfile.skyboxIntensity, 1);
  assert.equal(modelProfile.skyboxIntensity, 1);
  assert.equal(modelProfile.shadowIntensity, 0.62);
  assert.equal(modelProfile.hdriAzimuthOffsetDegrees, 180);
  assert.equal(defaultProfile.hdriAzimuthOffsetDegrees, 0);
  assert.ok(Number.isFinite(modelProfile.skyboxIntensity));
  assert.ok(modelProfile.skyboxIntensity >= 0);
});

test("PlayCanvas 环境旋转使用主光方位偏移的逆旋转", () => {
  const sourceDirection = new pc.Vec3(1, 0, 0);
  const worldDirection = new pc.Quat().setFromEulerAngles(0, 90, 0).transformVector(sourceDirection);
  const sampledSourceDirection = createHdriEnvironmentRotation(90).transformVector(worldDirection);

  assert.ok(Math.abs(sampledSourceDirection.x - sourceDirection.x) < 1e-10);
  assert.ok(Math.abs(sampledSourceDirection.y - sourceDirection.y) < 1e-10);
  assert.ok(Math.abs(sampledSourceDirection.z - sourceDirection.z) < 1e-10);
});
