import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_STORY_SCENE_3D_ENVIRONMENT,
  normalizeStoryScene3dEnvironment,
  parseStoryScene3dEnvironment,
  serializeStoryScene3dEnvironment,
} from "../dist/modules/novel/story-settings/application/StoryScene3dEnvironment.js";

test("场景资产 HDRI 参数有稳定默认值并固定旋转和亮度", () => {
  assert.deepEqual(normalizeStoryScene3dEnvironment(undefined), DEFAULT_STORY_SCENE_3D_ENVIRONMENT);
  assert.deepEqual(normalizeStoryScene3dEnvironment({
    projectionCenterHeight: 4.5,
    domeRadius: 32,
    yawDeg: 120,
    intensity: 0.7,
  }), {
    projectionCenterHeight: 4.5,
    domeRadius: 32,
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
    yawDeg: 0,
    intensity: 1,
  });
});

test("场景资产 HDRI 参数序列化后可恢复", () => {
  const value = { projectionCenterHeight: 2.5, domeRadius: 20 };
  assert.deepEqual(parseStoryScene3dEnvironment(serializeStoryScene3dEnvironment(value)), {
    projectionCenterHeight: 2.5,
    domeRadius: 20,
    yawDeg: 0,
    intensity: 1,
  });
});
