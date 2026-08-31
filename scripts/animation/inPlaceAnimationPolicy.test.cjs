const assert = require("node:assert/strict");
const test = require("node:test");

const {
  MAX_ROOT_TRANSLATION_RANGE_METERS,
  getInPlaceSourceEvidence,
  isInPlaceSource,
  measureRootTranslation,
  isWithinRootTranslationLimit,
} = require("./inPlaceAnimationPolicy.cjs");

test("RootMotion 路径和资产名不能进入分镜原地动画目录", () => {
  for (const row of [
    {
      assetPath: "/Game/_AnimDaily/MaleLocomotionSet/Animations/RootMotion/Jog",
      assetName: "A_JogFwd_Loop",
    },
    {
      assetPath: "/Game/Compatible/Pack/Animations",
      assetName: "Walk_F_0_Loop_RM_Seq",
    },
  ]) {
    assert.equal(getInPlaceSourceEvidence(row), null, JSON.stringify(row));
    assert.equal(isInPlaceSource(row), false, JSON.stringify(row));
  }
});

test("明确的 InPlace 源优先作为原地证据", () => {
  assert.equal(
    getInPlaceSourceEvidence({
      assetPath: "/Game/_AnimDaily/MaleLocomotionSet/Animations/InPlace/Jog",
      assetName: "A_INP_JogFwd_Loop",
    }),
    "source-path",
  );
  assert.equal(
    getInPlaceSourceEvidence({
      assetPath: "/Game/Compatible/Pack/Animations",
      assetName: "A_Walk_IP",
    }),
    "asset-name",
  );
});

test("精确策选但未标记 RootMotion 的源允许进入，最终由 GLB 位移门禁兜底", () => {
  const row = {
    assetPath: "/Game/Compatible/Pack/Animations/Walk",
    assetName: "Mvm_Walk_Fwd",
  };
  assert.equal(getInPlaceSourceEvidence(row), "unmarked-non-root");
  assert.equal(isInPlaceSource(row), true);
});

test("根节点没有平移轨道时视为没有全局位移", () => {
  const metrics = measureRootTranslation([]);
  assert.deepEqual(metrics, {
    sampleCount: 0,
    min: [0, 0, 0],
    max: [0, 0, 0],
    range: [0, 0, 0],
    maxRange: 0,
    net: [0, 0, 0],
    maxNet: 0,
  });
  assert.equal(isWithinRootTranslationLimit(metrics), true);
});

test("根节点小于等于 3 厘米的数值抖动可接受，明显位移必须拒绝", () => {
  const accepted = measureRootTranslation([
    [0, 0, 0],
    [0.003, -0.002, 0.03],
    [-0.002, 0.001, 0.01],
  ]);
  assert.equal(accepted.maxRange, 0.03);
  assert.equal(isWithinRootTranslationLimit(accepted), true);

  const rejected = measureRootTranslation([
    [0, 0, 0],
    [0, 0, 2.96625],
  ]);
  assert.equal(rejected.maxRange, 2.96625);
  assert.equal(isWithinRootTranslationLimit(rejected), false);
  assert.equal(MAX_ROOT_TRANSLATION_RANGE_METERS, 0.03);
});
