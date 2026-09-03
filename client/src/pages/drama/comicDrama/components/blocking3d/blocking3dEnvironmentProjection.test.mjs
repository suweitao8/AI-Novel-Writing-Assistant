import assert from "node:assert/strict";
import test from "node:test";

import {
  PROJECTED_HDRI_FRAGMENT_GLSL,
  projectEquirectangularGroundPlane,
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

test("地面平面采样按世界 XZ 铺开，不让地面纹理围绕投射中心汇聚", () => {
  const center = projectEquirectangularGroundPlane([0, 0, 0], 10);
  const left = projectEquirectangularGroundPlane([-2, 0, 0], 10);
  const right = projectEquirectangularGroundPlane([2, 0, 0], 10);
  const forward = projectEquirectangularGroundPlane([0, 0, 2], 10);
  const diagonal = projectEquirectangularGroundPlane([2, 0, 2], 10);

  assert.equal(center.u, 0.5);
  assert.ok(Math.abs(right.u - left.u - 0.2) < 1e-10);
  assert.ok(Math.abs(diagonal.u - right.u) < 1e-10);
  assert.notEqual(forward.v, center.v);
  assert.ok(forward.v >= 0.52 && forward.v <= 0.98);
});

test("平面地面从中心铺到平坦边界，并在外圈连续退出", () => {
  const center = projectEquirectangularSurface([0, 0, 0], 2, 7.5);
  const inner = projectEquirectangularSurface([7.5 * 0.85, 0, 0], 2, 7.5);
  const outer = projectEquirectangularSurface([7.5, 0, 0], 2, 7.5);

  assert.equal(center.groundPlanarBlend, 1);
  assert.ok(inner.groundPlanarBlend > 0 && inner.groundPlanarBlend < 1);
  assert.equal(outer.groundPlanarBlend, 0);
  assert.ok(center.v >= 0.52 && center.v <= 0.98);
});

test("上半球和稳定区外仍然使用原始方向投影", () => {
  const upper = projectEquirectangularSurface([0, 4, 0], 2, 7.5);
  const rawUpper = projectEquirectangularDirection([0, 2, 0]);
  const outerGround = projectEquirectangularSurface([7.5, 0, 0], 2, 7.5);
  const rawGround = projectEquirectangularDirection([7.5, -2, 0]);

  assert.equal(upper.groundPlanarBlend, 0);
  assert.deepEqual(upper, { ...rawUpper, groundPlanarBlend: 0 });
  assert.equal(outerGround.groundPlanarBlend, 0);
  assert.deepEqual(outerGround, { ...rawGround, groundPlanarBlend: 0 });
});

test("投影着色器只让平坦地面使用平面采样，并保持外圈原始方向采样", () => {
  assert.match(PROJECTED_HDRI_FRAGMENT_GLSL, /uProjectionRadiusMeters/);
  assert.match(PROJECTED_HDRI_FRAGMENT_GLSL, /flatGroundProgress/);
  assert.match(PROJECTED_HDRI_FRAGMENT_GLSL, /groundPlanarBlend/);
  assert.match(PROJECTED_HDRI_FRAGMENT_GLSL, /sourceGroundXZ/);
  assert.match(PROJECTED_HDRI_FRAGMENT_GLSL, /groundPlanarU/);
  assert.match(PROJECTED_HDRI_FRAGMENT_GLSL, /groundPlanarV/);
  assert.doesNotMatch(PROJECTED_HDRI_FRAGMENT_GLSL, /groundCenterProgress|stablePanoramaU|stablePanoramaV/);
  assert.match(PROJECTED_HDRI_FRAGMENT_GLSL, /fract\(/);
  assert.match(PROJECTED_HDRI_FRAGMENT_GLSL, /texture2D\(uEnvironmentMap, vec2\(panoramaU, panoramaV\)\)/);
  assert.doesNotMatch(PROJECTED_HDRI_FRAGMENT_GLSL, /samplerCube|textureCube/);
});

test("可见 HDRI 保留原始地面像素，避免立方体底部重投影造成放射状拉伸", () => {
  assert.match(PROJECTED_HDRI_FRAGMENT_GLSL, /decodeGamma\(rawColor\)/);
  assert.doesNotMatch(PROJECTED_HDRI_FRAGMENT_GLSL, /decodeRGBP\(rawColor\)/);
});
