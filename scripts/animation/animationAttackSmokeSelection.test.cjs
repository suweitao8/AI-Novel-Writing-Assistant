const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const selectionPath = path.join(__dirname, "animationCatalogSelection.json");
const selection = JSON.parse(fs.readFileSync(selectionPath, "utf8"));

const ATTACK_ROOT = "/Game/Characters/Mannequins/Anims/Unarmed/Attack";
const EXPECTED_ASSETS = [
  "MM_Attack_01",
  "MM_Attack_02",
  "MM_Attack_03",
  "MM_ChargedAttack",
];

test("活动动画清单只保留指定的 Anim57 徒手攻击四条资源", () => {
  assert.equal(selection.sourceProject, "Anim57");
  assert.equal(selection.sourceAssetRoot, ATTACK_ROOT);
  assert.equal(selection.motionPolicy, "explicit-per-clip");
  assert.equal(selection.nativeBasePose?.sourceAssetPath, "/Game/Characters/Mannequins/Anims/Unarmed/MM_Idle");
  assert.equal(selection.nativeBasePose?.clipName, "standing");
  assert.deepEqual(
    selection.clips.map((clip) => clip.sourceAssetName),
    EXPECTED_ASSETS,
  );
  assert.equal(selection.clips.length, EXPECTED_ASSETS.length);
  assert.ok(selection.clips.every((clip) =>
    clip.sourceAssetPath.startsWith(`${ATTACK_ROOT}/`),
  ));
  assert.ok(selection.clips.every((clip) => clip.motionMode === "root-motion"));
  assert.ok(selection.clips.every((clip) => clip.inPlace === false));
  assert.ok(selection.clips.every((clip) => clip.published === true));
  assert.equal(new Set(selection.clips.map((clip) => clip.clipName)).size, 4);
});
