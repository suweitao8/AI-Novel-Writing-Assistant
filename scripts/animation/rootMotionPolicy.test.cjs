const assert = require("node:assert/strict");
const test = require("node:test");

const {
  getRootMotionEvidence,
  getRootMotionNameCandidates,
  isRootMotionSource,
} = require("./rootMotionPolicy.cjs");

test("UE RootMotion 路径是有效的源证据", () => {
  assert.equal(
    getRootMotionEvidence({
      assetPath: "/Game/_AnimDaily/MaleLocomotionSet/Animations/RootMotion/Idle/A_WalkFwd_Loop.uasset",
      assetName: "A_WalkFwd_Loop",
    }),
    "source-path",
  );
  assert.equal(
    isRootMotionSource({
      assetPath: "/Game/AnimDaily/Scared_01/Animation/Root_Motion/SCR_Runaway_Run_Loop.uasset",
      assetName: "SCR_Runaway_Run_Loop",
    }),
    true,
  );
});

test("资产名中的明确 RM/Root 标记是有效的源证据", () => {
  for (const assetName of [
    "ANIM_RM_preacher_walk_book_F",
    "Walk_F_0_Loop_RM_Seq",
    "Anim_Monster_Run_Root",
    "GhostSamurai_Bow_Idle_Root",
    "A_Jump_01-Root_Motion",
  ]) {
    assert.equal(
      getRootMotionEvidence({ assetPath: "/Game/Compatible/Pack/Animations", assetName }),
      "asset-name",
      assetName,
    );
  }
});

test("InPlace 和模糊的 root 文本不能冒充 root motion", () => {
  for (const row of [
    {
      assetPath: "/Game/_AnimDaily/MaleLocomotionSet/Animations/InPlace/Idle",
      assetName: "A_INP_Idle",
    },
    {
      assetPath: "/Game/_AnimDaily/ParkourAnimations/Animations",
      assetName: "A_Walk_IP",
    },
    {
      assetPath: "/Game/Compatible/Pack/RootedAnimations",
      assetName: "A_WalkFwd_Loop",
    },
    {
      assetPath: "/Game/Compatible/Pack/Animations",
      assetName: "A_RootedMonster_Run",
    },
  ]) {
    assert.equal(getRootMotionEvidence(row), null, JSON.stringify(row));
    assert.equal(isRootMotionSource(row), false, JSON.stringify(row));
  }
});

test("InPlace 优先级高于同一条记录上的 root 文本", () => {
  assert.equal(
    getRootMotionEvidence({
      assetPath: "/Game/Pack/RootMotion/InPlace",
      assetName: "A_Walk_Root",
    }),
    null,
  );
});

test("常见 InPlace 命名可以生成有限的 root-motion 对应候选名", () => {
  assert.deepEqual(getRootMotionNameCandidates("A_INP_WalkFwd_Loop"), [
    "A_INP_WalkFwd_Loop",
    "A_WalkFwd_Loop",
  ]);
  assert.deepEqual(getRootMotionNameCandidates("A_Walk_IP"), [
    "A_Walk_IP",
    "A_Walk_RM",
    "A_Walk",
  ]);
  assert.deepEqual(getRootMotionNameCandidates("Lucy_Kick01_Inplace"), [
    "Lucy_Kick01_Inplace",
    "Lucy_Kick01_Root",
  ]);
  assert.deepEqual(getRootMotionNameCandidates("Mvm_Jog_Fwd"), [
    "Mvm_Jog_Fwd",
    "Mvm_Jog_Fwd_Root",
  ]);
});
