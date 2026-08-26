import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_STORY_SCENE_3D_ENVIRONMENT,
  getDefaultStoryScene3dEnvironment,
  normalizeStoryScene3dEnvironment,
  parseStoryScene3dEnvironment,
  resolveStoryScene3dEnvironment,
  resolveStorySceneType,
  serializeStoryScene3dEnvironment,
} from "../dist/modules/novel/story-settings/application/StoryScene3dEnvironment.js";

test("场景资产 HDRI 参数有稳定默认值并固定旋转和亮度", () => {
  assert.deepEqual(DEFAULT_STORY_SCENE_3D_ENVIRONMENT, {
    projectionCenterHeight: 2,
    domeRadius: 15,
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
    domeRadius: 30,
    yawDeg: 0,
    intensity: 1,
  });
});

test("场景资产 HDRI 参数兼容空值和历史越界快照", () => {
  assert.deepEqual(parseStoryScene3dEnvironment(null), DEFAULT_STORY_SCENE_3D_ENVIRONMENT);
  assert.deepEqual(parseStoryScene3dEnvironment(JSON.stringify({
    projectionCenterHeight: 0.6,
    domeRadius: 96,
    panoramaHorizonV: 0.65,
  })), {
    projectionCenterHeight: 1,
    domeRadius: 30,
    yawDeg: 0,
    intensity: 1,
  });
});

test("场景资产 HDRI 半球直径的可调范围是 5 到 30", () => {
  assert.equal(normalizeStoryScene3dEnvironment({ domeRadius: 5 }).domeRadius, 5);
  assert.equal(normalizeStoryScene3dEnvironment({ domeRadius: 30 }).domeRadius, 30);
  assert.equal(normalizeStoryScene3dEnvironment({ domeRadius: 31 }).domeRadius, 30);
});

test("旧全景地面分界只兼容读取，归一化固定为 50% 且新 JSON 不再写出该字段", () => {
  const value = { projectionCenterHeight: 2.5, domeRadius: 20, panoramaHorizonV: 0.58 };
  const serialized = serializeStoryScene3dEnvironment(value);
  assert.doesNotMatch(serialized, /panoramaHorizonV/);
  assert.deepEqual(parseStoryScene3dEnvironment(serialized), {
    projectionCenterHeight: 2.5,
    domeRadius: 20,
    yawDeg: 0,
    intensity: 1,
  });
});

test("任意历史全景地面分界都被忽略，运行时统一使用固定 50% 合同", () => {
  for (const panoramaHorizonV of [0.39, 0.4, 0.58, 0.65, 0.9]) {
    const normalized = normalizeStoryScene3dEnvironment({ panoramaHorizonV });
    assert.equal("panoramaHorizonV" in normalized, false);
  }
});

test("场景类型决定 3D 默认高度和半球直径", () => {
  assert.deepEqual(getDefaultStoryScene3dEnvironment("interior"), {
    projectionCenterHeight: 2,
    domeRadius: 10,
    yawDeg: 0,
    intensity: 1,
  });
  assert.equal(getDefaultStoryScene3dEnvironment("exterior").domeRadius, 15);
  assert.equal(getDefaultStoryScene3dEnvironment("nature").domeRadius, 20);
  assert.equal(getDefaultStoryScene3dEnvironment("unknown").domeRadius, 15);
});

test("状态类型优先于场景兼容类型，缺失时按室外兜底", () => {
  assert.equal(resolveStorySceneType("interior", "nature"), "nature");
  assert.equal(resolveStorySceneType("interior", null), "interior");
  assert.equal(resolveStorySceneType(null, "nature"), "nature");
  assert.equal(resolveStorySceneType("invalid", undefined), "exterior");
});

test("历史固定默认快照按场景类型迁移，已标记自定义值保持不变", () => {
  const legacy = JSON.stringify(DEFAULT_STORY_SCENE_3D_ENVIRONMENT);
  assert.equal(resolveStoryScene3dEnvironment("interior", legacy).domeRadius, 10);
  assert.equal(resolveStoryScene3dEnvironment("nature", legacy).domeRadius, 20);

  const custom = serializeStoryScene3dEnvironment(
    { projectionCenterHeight: 4.5, domeRadius: 15, panoramaHorizonV: 0.58 },
    { customized: true },
  );
  assert.deepEqual(resolveStoryScene3dEnvironment("interior", custom), {
    projectionCenterHeight: 4.5,
    domeRadius: 15,
    yawDeg: 0,
    intensity: 1,
  });
});

test("未配置序列化记录会随类型解析，显式 null 仍然代表未配置", () => {
  const storedDefault = serializeStoryScene3dEnvironment(
    getDefaultStoryScene3dEnvironment("nature"),
    { customized: false },
  );
  assert.equal(resolveStoryScene3dEnvironment("nature", storedDefault).domeRadius, 20);
  assert.equal(resolveStoryScene3dEnvironment("interior", null).domeRadius, 10);
});
