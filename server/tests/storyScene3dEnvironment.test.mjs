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
    projectionCenterHeight: 1.7,
    domeRadius: 10,
    panoramaHorizonV: 0.5,
    yawDeg: 0,
    intensity: 1,
  });
  assert.deepEqual(normalizeStoryScene3dEnvironment(undefined), DEFAULT_STORY_SCENE_3D_ENVIRONMENT);
  assert.deepEqual(normalizeStoryScene3dEnvironment({
    projectionCenterHeight: 4.5,
    domeRadius: 32,
    panoramaHorizonV: 0.65,
    yawDeg: 120,
    intensity: 0.7,
  }), {
    projectionCenterHeight: 2,
    domeRadius: 20,
    panoramaHorizonV: 0.65,
    yawDeg: 0,
    intensity: 1,
  });
});

test("场景资产 HDRI 参数兼容空值和历史越界快照", () => {
  assert.deepEqual(parseStoryScene3dEnvironment(null), DEFAULT_STORY_SCENE_3D_ENVIRONMENT);
  assert.deepEqual(parseStoryScene3dEnvironment(JSON.stringify({
    projectionCenterHeight: 0.6,
    domeRadius: 96,
    panoramaHorizonV: 0.9,
  })), {
    projectionCenterHeight: 0.6,
    domeRadius: 20,
    panoramaHorizonV: 0.65,
    yawDeg: 0,
    intensity: 1,
  });
});

test("场景资产 HDRI 投射中心高度的可调范围是 0.5 到 2", () => {
  assert.equal(normalizeStoryScene3dEnvironment({ projectionCenterHeight: 0.5 }).projectionCenterHeight, 0.5);
  assert.equal(normalizeStoryScene3dEnvironment({ projectionCenterHeight: 2 }).projectionCenterHeight, 2);
  assert.equal(normalizeStoryScene3dEnvironment({ projectionCenterHeight: 2.1 }).projectionCenterHeight, 2);
});

test("场景资产 HDRI 半球直径的可调范围是 5 到 20", () => {
  assert.equal(normalizeStoryScene3dEnvironment({ domeRadius: 5 }).domeRadius, 5);
  assert.equal(normalizeStoryScene3dEnvironment({ domeRadius: 20 }).domeRadius, 20);
  assert.equal(normalizeStoryScene3dEnvironment({ domeRadius: 21 }).domeRadius, 20);
});

test("全景地面分界会被保存并按 40% 到 65% 归一化", () => {
  const value = { projectionCenterHeight: 1.5, domeRadius: 20, panoramaHorizonV: 0.58 };
  const serialized = serializeStoryScene3dEnvironment(value);
  assert.match(serialized, /panoramaHorizonV/);
  assert.deepEqual(parseStoryScene3dEnvironment(serialized), {
    projectionCenterHeight: 1.5,
    domeRadius: 20,
    panoramaHorizonV: 0.58,
    yawDeg: 0,
    intensity: 1,
  });
});

test("缺失或越界的全景地面分界使用默认值或边界值", () => {
  assert.equal(normalizeStoryScene3dEnvironment({}).panoramaHorizonV, 0.5);
  assert.equal(normalizeStoryScene3dEnvironment({ panoramaHorizonV: 0.39 }).panoramaHorizonV, 0.4);
  assert.equal(normalizeStoryScene3dEnvironment({ panoramaHorizonV: 0.4 }).panoramaHorizonV, 0.4);
  assert.equal(normalizeStoryScene3dEnvironment({ panoramaHorizonV: 0.65 }).panoramaHorizonV, 0.65);
  assert.equal(normalizeStoryScene3dEnvironment({ panoramaHorizonV: 0.9 }).panoramaHorizonV, 0.65);
});

test("场景类型决定 3D 默认高度和半球直径", () => {
  assert.deepEqual(getDefaultStoryScene3dEnvironment("interior"), {
    projectionCenterHeight: 0.8,
    domeRadius: 5,
    panoramaHorizonV: 0.5,
    yawDeg: 0,
    intensity: 1,
  });
  assert.deepEqual(getDefaultStoryScene3dEnvironment("exterior"), {
    projectionCenterHeight: 1.7,
    domeRadius: 10,
    panoramaHorizonV: 0.5,
    yawDeg: 0,
    intensity: 1,
  });
  assert.deepEqual(getDefaultStoryScene3dEnvironment("nature"), {
    projectionCenterHeight: 1,
    domeRadius: 20,
    panoramaHorizonV: 0.5,
    yawDeg: 0,
    intensity: 1,
  });
  assert.deepEqual(getDefaultStoryScene3dEnvironment("unknown"), getDefaultStoryScene3dEnvironment("exterior"));
});

test("状态类型优先于场景兼容类型，缺失时按室外兜底", () => {
  assert.equal(resolveStorySceneType("interior", "nature"), "nature");
  assert.equal(resolveStorySceneType("interior", null), "interior");
  assert.equal(resolveStorySceneType(null, "nature"), "nature");
  assert.equal(resolveStorySceneType("invalid", undefined), "exterior");
});

test("历史固定默认快照按场景类型迁移，已标记自定义值保持不变", () => {
  for (const legacy of [
    { projectionCenterHeight: 2, domeRadius: 10 },
    { projectionCenterHeight: 2, domeRadius: 15 },
    { projectionCenterHeight: 2, domeRadius: 20 },
  ]) {
    for (const sceneType of ["interior", "exterior", "nature"]) {
      assert.deepEqual(
        resolveStoryScene3dEnvironment(sceneType, JSON.stringify(legacy)),
        getDefaultStoryScene3dEnvironment(sceneType),
      );
    }
  }

  const custom = serializeStoryScene3dEnvironment(
    { projectionCenterHeight: 1.2, domeRadius: 15, panoramaHorizonV: 0.58 },
    { customized: true },
  );
  assert.deepEqual(resolveStoryScene3dEnvironment("interior", custom), {
    projectionCenterHeight: 1.2,
    domeRadius: 15,
    panoramaHorizonV: 0.58,
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
  assert.deepEqual(resolveStoryScene3dEnvironment("interior", null), {
    projectionCenterHeight: 0.8,
    domeRadius: 5,
    panoramaHorizonV: 0.5,
    yawDeg: 0,
    intensity: 1,
  });
});
