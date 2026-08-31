import assert from "node:assert/strict";
import test from "node:test";

import {
  PROJECTED_HDRI_FRAGMENT_GLSL,
  projectEquirectangularDirection,
} from "./blocking3dEnvironmentProjection.ts";
import { rotateHdriLightDirectionAzimuth } from "./blocking3dEnvironmentLighting.ts";

test("等距全景默认使用图像垂直中心作为地面分界", () => {
  const horizon = projectEquirectangularDirection([1, 0, 0]);
  const top = projectEquirectangularDirection([0, 1, 0]);
  const bottom = projectEquirectangularDirection([0, -1, 0]);

  assert.equal(horizon.v, 0.5);
  assert.equal(top.v, 0);
  assert.equal(bottom.v, 1);
});

test("等距全景投影使用场景分界参数，并把缺省值设为图像垂直中心", () => {
  assert.equal(projectEquirectangularDirection([1, 0, 0], 0.58).v, 0.58);
  assert.equal(projectEquirectangularDirection([1, 0, 0], 0.4).v, 0.4);
  assert.equal(projectEquirectangularDirection([1, 0, 0], 0.65).v, 0.65);
});

test("HDRI 方位偏移把旋转后的世界方向反向采样回同一原图方向", () => {
  const sourceDirection = [1, 0, 0];
  const worldDirection = rotateHdriLightDirectionAzimuth(sourceDirection, 90);
  const source = projectEquirectangularDirection(sourceDirection, 0.5, 0);
  const rotated = projectEquirectangularDirection(worldDirection, 0.5, 90);

  assert.ok(Math.abs(rotated.u - source.u) < 1e-10, "可见 HDRI 应与旋转后的主光保持同一经度");
  assert.equal(rotated.v, source.v, "水平旋转不能改变 HDRI 纬度");
});

test("HDRI 投影着色器绑定可调全景地面分界 uniform", () => {
  assert.match(PROJECTED_HDRI_FRAGMENT_GLSL, /uPanoramaHorizonV/);
  assert.match(PROJECTED_HDRI_FRAGMENT_GLSL, /sourceLatitude/);
  assert.match(PROJECTED_HDRI_FRAGMENT_GLSL, /0\.5 - uPanoramaHorizonV/);
  assert.match(PROJECTED_HDRI_FRAGMENT_GLSL, /uHdriAzimuthOffsetDegrees/);
  assert.match(PROJECTED_HDRI_FRAGMENT_GLSL, /-uHdriAzimuthOffsetDegrees/);
  assert.match(PROJECTED_HDRI_FRAGMENT_GLSL, /textureCube\(uEnvironmentMap, projectedDirection\)/);
});

test("可见 HDRI cubemap 使用 RGBP 解码，避免 RGBA8 暗部变黑", () => {
  assert.match(PROJECTED_HDRI_FRAGMENT_GLSL, /decodeRGBP\(rawColor\)/);
});
