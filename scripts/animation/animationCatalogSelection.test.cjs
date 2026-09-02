const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { getInPlaceSourceEvidence } = require("./inPlaceAnimationPolicy.cjs");

const selectionPath = path.join(__dirname, "animationCatalogSelection.json");
const selection = JSON.parse(fs.readFileSync(selectionPath, "utf8"));
const ATTACK_ROOT = "/Game/Characters/Mannequins/Anims/Unarmed/Attack";

test("动画策选清单只包含指定的 Anim57 四条徒手攻击资源", () => {
  assert.equal(selection.target, "UAL2");
  assert.equal(selection.sourceProject, "Anim57");
  assert.equal(selection.sourceAssetRoot, ATTACK_ROOT);
  assert.equal(selection.motionPolicy, "explicit-per-clip");
  assert.deepEqual(
    selection.clips.map((clip) => clip.sourceAssetName),
    ["MM_Attack_01", "MM_Attack_02", "MM_Attack_03", "MM_ChargedAttack"],
  );
  assert.equal(selection.clips.length, 4);
  assert.equal(selection.clips.filter((clip) => clip.published !== false).length, 4);
  assert.ok(selection.clips.every((clip) => clip.sourceAssetPath.startsWith(`${ATTACK_ROOT}/`)));
  assert.ok(selection.clips.every((clip) => getInPlaceSourceEvidence({
    assetPath: clip.sourceAssetPath,
    assetName: clip.sourceAssetName,
  }) === "unmarked-non-root"));
  assert.ok(selection.clips.every((clip) => clip.motionMode === "root-motion"));
  assert.ok(selection.clips.every((clip) => clip.inPlace === false));
});

test("四条资源共享同一套装并使用唯一的输出命名", () => {
  assert.deepEqual(new Set(selection.clips.map((clip) => clip.packId)), new Set(["anim57-unarmed-attack"]));
  assert.equal(new Set(selection.clips.map((clip) => clip.id)).size, 4);
  assert.equal(new Set(selection.clips.map((clip) => clip.clipName)).size, 4);
  assert.ok(selection.clips.every((clip) => /^C57_[a-z0-9_]+$/.test(clip.clipName)));
  assert.ok(selection.clips.every((clip) =>
    /^[a-z0-9-]+\.fbx$/.test(clip.fbxFileName) &&
    /^[a-z0-9-]+\.glb$/.test(clip.glbFileName),
  ));
});
