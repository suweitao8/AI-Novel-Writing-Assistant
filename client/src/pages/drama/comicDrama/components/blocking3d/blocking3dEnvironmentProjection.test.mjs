import assert from "node:assert/strict";
import test from "node:test";

import {
  PROJECTED_HDRI_FRAGMENT_GLSL,
  projectEquirectangularDirection,
} from "./blocking3dEnvironmentProjection.ts";

test("等距全景默认使用图像垂直中心作为地面分界", () => {
  const horizon = projectEquirectangularDirection([1, 0, 0]);
  const top = projectEquirectangularDirection([0, 1, 0]);
  const bottom = projectEquirectangularDirection([0, -1, 0]);

  assert.equal(horizon.v, 0.5);
  assert.equal(top.v, 0);
  assert.equal(bottom.v, 1);
});

test("等距全景投影支持把可调地面分界传入 V 坐标", () => {
  assert.equal(projectEquirectangularDirection([1, 0, 0], 0.58).v, 0.58);
  assert.equal(projectEquirectangularDirection([1, 0, 0], 0.4).v, 0.4);
  assert.equal(projectEquirectangularDirection([1, 0, 0], 0.65).v, 0.65);
});

test("等距全景投影将自定义分界限制在有效纹理范围", () => {
  assert.equal(projectEquirectangularDirection([1, 0, 0], -1).v, 0);
  assert.equal(projectEquirectangularDirection([1, 0, 0], 2).v, 1);
});

test("HDRI 投影着色器使用全景地面分界 uniform，而不是写死 50%", () => {
  assert.match(PROJECTED_HDRI_FRAGMENT_GLSL, /uniform float uPanoramaHorizonV/);
  assert.match(PROJECTED_HDRI_FRAGMENT_GLSL, /sourceLatitude/);
  assert.match(PROJECTED_HDRI_FRAGMENT_GLSL, /0\.5 - uPanoramaHorizonV/);
  assert.match(PROJECTED_HDRI_FRAGMENT_GLSL, /textureCube\(uEnvironmentMap, projectedDirection\)/);
});
