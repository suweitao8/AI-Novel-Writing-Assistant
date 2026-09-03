import assert from "node:assert/strict";
import test from "node:test";

import {
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

test("HDRI 投影着色器绑定可调全景分界，并直接采样天空等距图", () => {
  assert.match(PROJECTED_HDRI_FRAGMENT_GLSL, /uPanoramaHorizonV/);
  assert.match(PROJECTED_HDRI_FRAGMENT_GLSL, /panoramaV/);
  assert.match(PROJECTED_HDRI_FRAGMENT_GLSL, /uPanoramaHorizonV - asin/);
  assert.match(PROJECTED_HDRI_FRAGMENT_GLSL, /uHdriAzimuthOffsetDegrees/);
  assert.match(PROJECTED_HDRI_FRAGMENT_GLSL, /-uHdriAzimuthOffsetDegrees/);
  assert.match(PROJECTED_HDRI_FRAGMENT_GLSL, /texture2D\(uEnvironmentMap, vec2\(panoramaU, panoramaV\)\)/);
});

test("可见地面不再把普通透视式全景下半图展开到平面", () => {
  const surface = projectEquirectangularSurface([2, 0, 0], 2);
  const raw = projectEquirectangularDirection([2, -2, 0]);

  assert.deepEqual(surface, raw);
});

test("上半球和地面都保留方向投影数学，实际地面颜色由材质单独提供", () => {
  const upper = projectEquirectangularSurface([0, 4, 0], 2);
  const rawUpper = projectEquirectangularDirection([0, 2, 0]);
  const outerGround = projectEquirectangularSurface([7.5, 0, 0], 2);
  const rawGround = projectEquirectangularDirection([7.5, -2, 0]);

  assert.deepEqual(upper, rawUpper);
  assert.deepEqual(outerGround, rawGround);
});

test("投影着色器只让上半部按方向采样，地面使用稳定的材质色", () => {
  assert.match(PROJECTED_HDRI_FRAGMENT_GLSL, /uGroundSampleV/);
  assert.match(PROJECTED_HDRI_FRAGMENT_GLSL, /groundSurfaceProgress/);
  assert.match(PROJECTED_HDRI_FRAGMENT_GLSL, /sampleGroundMaterialColor/);
  assert.match(PROJECTED_HDRI_FRAGMENT_GLSL, /groundLinearColor/);
  assert.doesNotMatch(PROJECTED_HDRI_FRAGMENT_GLSL, /uProjectionRadiusMeters/);
  assert.doesNotMatch(PROJECTED_HDRI_FRAGMENT_GLSL, /groundPlanarBlend|groundPlanarU|groundPlanarV|sourceGroundXZ/);
  assert.match(PROJECTED_HDRI_FRAGMENT_GLSL, /texture2D\(uEnvironmentMap, vec2\(panoramaU, panoramaV\)\)/);
});

test("可见 HDRI 不把普通透视地面重投影，避免底部放射状拉伸", () => {
  assert.match(PROJECTED_HDRI_FRAGMENT_GLSL, /decodeGamma\(rawColor\)/);
  assert.doesNotMatch(PROJECTED_HDRI_FRAGMENT_GLSL, /decodeRGBP\(rawColor\)/);
});
