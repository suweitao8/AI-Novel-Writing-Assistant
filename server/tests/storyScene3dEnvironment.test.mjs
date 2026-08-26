import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_STORY_SCENE_3D_ENVIRONMENT,
  normalizeStoryScene3dEnvironment,
  parseStoryScene3dEnvironment,
  serializeStoryScene3dEnvironment,
} from "../dist/modules/novel/story-settings/application/StoryScene3dEnvironment.js";

test("场景资产 HDRI 参数有稳定默认值并固定旋转和亮度", () => {
  assert.deepEqual(DEFAULT_STORY_SCENE_3D_ENVIRONMENT, {
    projectionCenterHeight: 2,
    domeRadius: 15,
    panoramaHorizonV: 0.5,
    yawDeg: 0,
    intensity: 1,
  });
  assert.deepEqual(normalizeStoryScene3dEnvironment(undefined), DEFAULT_STORY_SCENE_3D_ENVIRONMENT);
  assert.deepEqual(normalizeStoryScene3dEnvironment({
    projectionCenterHeight: 4.5,
    domeRadius: 32,
    yawDeg: 120,
    intensity: 0.7,
  }), {
    projectionCenterHeight: 4.5,
    domeRadius: 32,
    panoramaHorizonV: 0.5,
    yawDeg: 0,
    intensity: 1,
  });
});

test("场景资产 HDRI 参数兼容空值和历史越界快照", () => {
  assert.deepEqual(parseStoryScene3dEnvironment(null), DEFAULT_STORY_SCENE_3D_ENVIRONMENT);
  assert.deepEqual(parseStoryScene3dEnvironment(JSON.stringify({
    projectionCenterHeight: 0.6,
    domeRadius: 96,
  })), {
    projectionCenterHeight: 1,
    domeRadius: 50,
    panoramaHorizonV: 0.5,
    yawDeg: 0,
    intensity: 1,
  });
});

test("场景资产 HDRI 参数序列化后可恢复", () => {
  const value = { projectionCenterHeight: 2.5, domeRadius: 20, panoramaHorizonV: 0.58 };
  assert.deepEqual(parseStoryScene3dEnvironment(serializeStoryScene3dEnvironment(value)), {
    projectionCenterHeight: 2.5,
    domeRadius: 20,
    panoramaHorizonV: 0.58,
    yawDeg: 0,
    intensity: 1,
  });
});

test("场景资产 HDRI 全景地面分界按 40% 到 65% 归一化", () => {
  assert.equal(normalizeStoryScene3dEnvironment({ panoramaHorizonV: 0.39 }).panoramaHorizonV, 0.4);
  assert.equal(normalizeStoryScene3dEnvironment({ panoramaHorizonV: 0.66 }).panoramaHorizonV, 0.65);
  assert.equal(normalizeStoryScene3dEnvironment({ panoramaHorizonV: 0.58 }).panoramaHorizonV, 0.58);
});
