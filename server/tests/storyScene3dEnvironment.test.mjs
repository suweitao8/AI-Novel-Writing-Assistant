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

function withRadius(radiusMeters, ratio, panoramaHorizonV = 0.5) {
  return {
    projectionCenterHeight: Math.round(radiusMeters * ratio * 100) / 100,
    projectionCenterHeightRatio: ratio,
    radiusMeters,
    panoramaHorizonV,
    yawDeg: 0,
    intensity: 1,
  };
}

test("场景资产 HDRI 参数有稳定默认值并固定旋转和亮度", () => {
  assert.deepEqual(DEFAULT_STORY_SCENE_3D_ENVIRONMENT, {
    projectionCenterHeight: 2,
    projectionCenterHeightRatio: 4 / 15,
    radiusMeters: 7.5,
    panoramaHorizonV: 0.5,
    yawDeg: 0,
    intensity: 1,
  });
  assert.deepEqual(normalizeStoryScene3dEnvironment(undefined), DEFAULT_STORY_SCENE_3D_ENVIRONMENT);
  // 高度由半径 × 占比派生：隐含占比 4.5/16≈28% 落在范围内，
  // 半径裁剪到 15 后高度等比跟随 → 4.22 米。
  assert.deepEqual(normalizeStoryScene3dEnvironment({
    projectionCenterHeight: 4.5,
    radiusMeters: 16,
    panoramaHorizonV: 0.65,
    yawDeg: 120,
    intensity: 0.7,
  }), withRadius(15, 0.2813, 0.55));
});

test("场景资产 HDRI 参数兼容空值和历史越界快照", () => {
  assert.deepEqual(parseStoryScene3dEnvironment(null), DEFAULT_STORY_SCENE_3D_ENVIRONMENT);
  // 旧直径 96 先换算成半径 48，再裁剪到 15；按存量高度推导的新比例
  // 低于下限，收敛到 10% → 高度 1.5 米。
  assert.deepEqual(parseStoryScene3dEnvironment(JSON.stringify({
    projectionCenterHeight: 0.6,
    domeRadius: 96,
    panoramaHorizonV: 0.9,
  })), withRadius(15, 0.1, 0.55));
});

test("投射中心高度由半径 × 占比派生，占比可调范围是 10% 到 40%", () => {
  assert.equal(normalizeStoryScene3dEnvironment({ radiusMeters: 3, projectionCenterHeightRatio: 0.2 }).projectionCenterHeight, 0.6);
  assert.equal(normalizeStoryScene3dEnvironment({ radiusMeters: 3, projectionCenterHeightRatio: 0.1 }).projectionCenterHeight, 0.3);
  assert.equal(normalizeStoryScene3dEnvironment({ radiusMeters: 3, projectionCenterHeightRatio: 0.4 }).projectionCenterHeight, 1.2);
  assert.equal(normalizeStoryScene3dEnvironment({ radiusMeters: 3, projectionCenterHeightRatio: 0.01 }).projectionCenterHeightRatio, 0.1);
  assert.equal(normalizeStoryScene3dEnvironment({ radiusMeters: 3, projectionCenterHeightRatio: 0.9 }).projectionCenterHeightRatio, 0.4);
  // 占比相同时，半径变化后高度等比跟随。
  const small = normalizeStoryScene3dEnvironment({ radiusMeters: 3, projectionCenterHeightRatio: 0.2 });
  const large = normalizeStoryScene3dEnvironment({ radiusMeters: 6, ...small, radiusMeters: 6, projectionCenterHeightRatio: small.projectionCenterHeightRatio });
  assert.equal(large.projectionCenterHeight, 1.2);
});

test("半径达到 15 米时投射中心高度仍按占比完整派生", () => {
  const normalized = normalizeStoryScene3dEnvironment({
    radiusMeters: 15,
    projectionCenterHeightRatio: 0.4,
  });
  assert.equal(normalized.radiusMeters, 15);
  assert.equal(normalized.projectionCenterHeight, 6);
});

test("旧快照没有占比时按存量高度与旧直径推导新的半径比例", () => {
  const normalized = normalizeStoryScene3dEnvironment({ projectionCenterHeight: 1.7, domeRadius: 10 });
  assert.equal(normalized.projectionCenterHeightRatio, 0.34);
  assert.equal(normalized.projectionCenterHeight, 1.7);
});

test("场景资产 HDRI 圆半径的可调范围是 2.5 到 15", () => {
  assert.equal(normalizeStoryScene3dEnvironment({ radiusMeters: 2.5 }).radiusMeters, 2.5);
  assert.equal(normalizeStoryScene3dEnvironment({ radiusMeters: 15 }).radiusMeters, 15);
  assert.equal(normalizeStoryScene3dEnvironment({ radiusMeters: 16 }).radiusMeters, 15);
  // 历史直径仍可读取，但输出统一为真实半径。
  assert.equal(normalizeStoryScene3dEnvironment({ domeRadius: 30 }).radiusMeters, 15);
});

test("全景地面分界会被保存并按 45% 到 55% 归一化", () => {
  const value = { projectionCenterHeightRatio: 0.15, radiusMeters: 10, panoramaHorizonV: 0.52 };
  const serialized = serializeStoryScene3dEnvironment(value);
  assert.match(serialized, /panoramaHorizonV/);
  assert.match(serialized, /projectionCenterHeightRatio/);
  assert.match(serialized, /radiusMeters/);
  assert.doesNotMatch(serialized, /domeRadius/);
  assert.deepEqual(parseStoryScene3dEnvironment(serialized), withRadius(10, 0.15, 0.52));
});

test("缺失或越界的全景地面分界使用默认值或边界值", () => {
  assert.equal(normalizeStoryScene3dEnvironment({}).panoramaHorizonV, 0.5);
  assert.equal(normalizeStoryScene3dEnvironment({ panoramaHorizonV: 0.44 }).panoramaHorizonV, 0.45);
  assert.equal(normalizeStoryScene3dEnvironment({ panoramaHorizonV: 0.4 }).panoramaHorizonV, 0.45);
  assert.equal(normalizeStoryScene3dEnvironment({ panoramaHorizonV: 0.45 }).panoramaHorizonV, 0.45);
  assert.equal(normalizeStoryScene3dEnvironment({ panoramaHorizonV: 0.55 }).panoramaHorizonV, 0.55);
  assert.equal(normalizeStoryScene3dEnvironment({ panoramaHorizonV: 0.65 }).panoramaHorizonV, 0.55);
  assert.equal(normalizeStoryScene3dEnvironment({ panoramaHorizonV: 0.9 }).panoramaHorizonV, 0.55);
});

test("场景类型不再改变 3D 默认高度和圆半径", () => {
  const fallback = getDefaultStoryScene3dEnvironment();
  assert.deepEqual(getDefaultStoryScene3dEnvironment("interior"), fallback);
  assert.deepEqual(getDefaultStoryScene3dEnvironment("exterior"), fallback);
  assert.deepEqual(getDefaultStoryScene3dEnvironment("nature"), fallback);
  assert.deepEqual(getDefaultStoryScene3dEnvironment("unknown"), fallback);
});

test("状态类型优先于场景兼容类型，缺失时按室外兜底", () => {
  assert.equal(resolveStorySceneType("interior", "nature"), "nature");
  assert.equal(resolveStorySceneType("interior", null), "interior");
  assert.equal(resolveStorySceneType(null, "nature"), "nature");
  assert.equal(resolveStorySceneType("invalid", undefined), "exterior");
});

test("历史固定默认快照不再按场景类型迁移，已标记自定义值保持不变", () => {
  for (const legacy of [
    { projectionCenterHeight: 2, domeRadius: 10 },
    { projectionCenterHeight: 2, domeRadius: 15 },
    { projectionCenterHeight: 2, domeRadius: 20 },
    { projectionCenterHeight: 0.5, domeRadius: 5 },
  ]) {
    for (const sceneType of ["interior", "exterior", "nature"]) {
      assert.deepEqual(
        resolveStoryScene3dEnvironment(sceneType, JSON.stringify(legacy)),
        { ...getDefaultStoryScene3dEnvironment(), customized: false },
      );
    }
  }

  const custom = serializeStoryScene3dEnvironment(
    { projectionCenterHeightRatio: 0.15, radiusMeters: 7.5, panoramaHorizonV: 0.52 },
    { customized: true },
  );
  assert.deepEqual(resolveStoryScene3dEnvironment("interior", custom), {
    ...withRadius(7.5, 0.15, 0.52),
    customized: true,
  });
});

test("未配置序列化记录使用中性默认值，显式 null 仍然代表未配置", () => {
  const storedDefault = serializeStoryScene3dEnvironment(
    getDefaultStoryScene3dEnvironment(),
    { customized: false },
  );
  assert.equal(resolveStoryScene3dEnvironment("nature", storedDefault).radiusMeters, 7.5);
  assert.deepEqual(resolveStoryScene3dEnvironment("interior", null), {
    projectionCenterHeight: 2,
    projectionCenterHeightRatio: 4 / 15,
    radiusMeters: 7.5,
    panoramaHorizonV: 0.5,
    yawDeg: 0,
    intensity: 1,
    customized: false,
  });
});
