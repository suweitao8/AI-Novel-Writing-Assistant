import assert from "node:assert/strict";
import test from "node:test";

import {
  getProjectedHdriGroundStabilization,
  PROJECTED_HDRI_FRAGMENT_GLSL,
  projectEquirectangularDirection,
  projectEquirectangularSurface,
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

test("HDRI 投影着色器绑定可调全景地面分界 uniform，并直接采样原始等距图", () => {
  assert.match(PROJECTED_HDRI_FRAGMENT_GLSL, /uPanoramaHorizonV/);
  assert.match(PROJECTED_HDRI_FRAGMENT_GLSL, /panoramaV/);
  assert.match(PROJECTED_HDRI_FRAGMENT_GLSL, /uPanoramaHorizonV - asin/);
  assert.match(PROJECTED_HDRI_FRAGMENT_GLSL, /uHdriAzimuthOffsetDegrees/);
  assert.match(PROJECTED_HDRI_FRAGMENT_GLSL, /-uHdriAzimuthOffsetDegrees/);
  assert.match(PROJECTED_HDRI_FRAGMENT_GLSL, /texture2D\(uEnvironmentMap, vec2\(panoramaU, panoramaV\)\)/);
});

test("投射中心地面使用有限稳定区，不让微小位置变化跨越整条经度轴", () => {
  const center = projectEquirectangularSurface([0, 0, 0], 2, 7.5);
  const nearby = [
    projectEquirectangularSurface([0.01, 0, 0], 2, 7.5),
    projectEquirectangularSurface([-0.01, 0, 0], 2, 7.5),
    projectEquirectangularSurface([0, 0, 0.01], 2, 7.5),
  ];

  assert.equal(center.groundStabilization, 1);
  assert.ok(nearby.every((sample) => sample.groundStabilization > 0.99));
  assert.ok(nearby.every((sample) => Math.abs(sample.u - center.u) < 0.01));
  assert.ok(nearby.every((sample) => sample.v < 0.9));
});

test("稳定投影环按投射高度对齐原始投影外圈", () => {
  const defaultCenter = projectEquirectangularSurface([0, 0, 0], 2, 7.5);
  const lowerCenter = projectEquirectangularSurface([0, 0, 0], 0.75, 7.5);
  const expectedDefaultV = 0.5 + Math.atan2(2, 7.5 * 0.28) / Math.PI;

  assert.ok(Math.abs(defaultCenter.v - expectedDefaultV) < 1e-10);
  assert.ok(lowerCenter.v < defaultCenter.v);
  assert.equal(defaultCenter.u, 0.5);
});

test("稳定区按半径缩放，并在边界连续退出", () => {
  assert.equal(getProjectedHdriGroundStabilization(0, 7.5), 1);
  assert.equal(getProjectedHdriGroundStabilization(7.5 * 0.28, 7.5), 0);
  assert.ok(getProjectedHdriGroundStabilization(7.5 * 0.18, 7.5) > 0);
  assert.ok(getProjectedHdriGroundStabilization(15 * 0.18, 15) > 0);
  assert.equal(getProjectedHdriGroundStabilization(1, 0), 0);
  assert.equal(getProjectedHdriGroundStabilization(1, Number.NaN), 0);
});

test("上半球和稳定区外仍然使用原始方向投影", () => {
  const upper = projectEquirectangularSurface([0, 4, 0], 2, 7.5);
  const rawUpper = projectEquirectangularDirection([0, 2, 0]);
  const outerGround = projectEquirectangularSurface([7, 0, 0], 2, 7.5);
  const rawGround = projectEquirectangularDirection([7, -2, 0]);

  assert.equal(upper.groundStabilization, 0);
  assert.deepEqual(upper, { ...rawUpper, groundStabilization: 0 });
  assert.equal(outerGround.groundStabilization, 0);
  assert.deepEqual(outerGround, { ...rawGround, groundStabilization: 0 });
});

test("投影着色器按半球半径稳定投射中心地面，并保持原始等距图采样", () => {
  assert.match(PROJECTED_HDRI_FRAGMENT_GLSL, /uProjectionRadiusMeters/);
  assert.match(PROJECTED_HDRI_FRAGMENT_GLSL, /PROJECTED_HDRI_GROUND_STABILIZATION/);
  assert.match(PROJECTED_HDRI_FRAGMENT_GLSL, /groundCenterProgress/);
  assert.match(PROJECTED_HDRI_FRAGMENT_GLSL, /stableAzimuthProgress/);
  assert.match(PROJECTED_HDRI_FRAGMENT_GLSL, /stableGroundHeight/);
  assert.match(PROJECTED_HDRI_FRAGMENT_GLSL, /atan\(stableGroundHeight, stableGroundRadius\)/);
  assert.match(PROJECTED_HDRI_FRAGMENT_GLSL, /stablePanoramaU/);
  assert.match(PROJECTED_HDRI_FRAGMENT_GLSL, /stablePanoramaV/);
  assert.match(PROJECTED_HDRI_FRAGMENT_GLSL, /fract\(/);
  assert.match(PROJECTED_HDRI_FRAGMENT_GLSL, /texture2D\(uEnvironmentMap, vec2\(panoramaU, panoramaV\)\)/);
  assert.doesNotMatch(PROJECTED_HDRI_FRAGMENT_GLSL, /samplerCube|textureCube/);
});

test("可见 HDRI 保留原始地面像素，避免立方体底部重投影造成放射状拉伸", () => {
  assert.match(PROJECTED_HDRI_FRAGMENT_GLSL, /decodeGamma\(rawColor\)/);
  assert.doesNotMatch(PROJECTED_HDRI_FRAGMENT_GLSL, /decodeRGBP\(rawColor\)/);
});
