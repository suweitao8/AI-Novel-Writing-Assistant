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

test("等距全景投影忽略历史可调参数并始终固定在图像垂直中心", () => {
  assert.equal(projectEquirectangularDirection([1, 0, 0], 0.58).v, 0.5);
  assert.equal(projectEquirectangularDirection([1, 0, 0], 0.4).v, 0.5);
  assert.equal(projectEquirectangularDirection([1, 0, 0], 0.65).v, 0.5);
});

test("HDRI 投影着色器固定使用 50% 分界，不再绑定可调 horizon uniform", () => {
  assert.doesNotMatch(PROJECTED_HDRI_FRAGMENT_GLSL, /uPanoramaHorizonV/);
  assert.match(PROJECTED_HDRI_FRAGMENT_GLSL, /sourceLatitude/);
  assert.doesNotMatch(PROJECTED_HDRI_FRAGMENT_GLSL, /0\.5 - uPanoramaHorizonV/);
  assert.match(PROJECTED_HDRI_FRAGMENT_GLSL, /textureCube\(uEnvironmentMap, projectedDirection\)/);
});
