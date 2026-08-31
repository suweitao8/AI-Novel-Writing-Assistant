const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const selectionPath = path.join(__dirname, "animationCatalogSelection.json");
const selection = JSON.parse(fs.readFileSync(selectionPath, "utf8"));

test("动画策选清单只包含真实 UE 路径并覆盖五个源组", () => {
  assert.equal(selection.target, "UAL2");
  assert.deepEqual(Object.keys(selection.groups), [
    "unreal-daily",
    "unreal-interaction",
    "unreal-misc",
    "unreal-hand-combat",
    "unreal-weapon-combat",
  ]);
  assert.equal(selection.clips.length, 402);
  assert.equal(new Set(selection.packs.map((pack) => pack.id)).size, 64);
  assert.ok(selection.clips.every((clip) => clip.sourceAssetPath.startsWith("/Game/")));
  assert.ok(selection.clips.every((clip) => /^[a-z0-9-]+\.fbx$/.test(clip.fbxFileName)));
  assert.ok(selection.clips.every((clip) => /^[a-z0-9-]+\.glb$/.test(clip.glbFileName)));
  assert.ok(selection.groups["unreal-daily"].label === "日常动作");
  assert.ok(Object.values(selection.groups).every(({ label }) => !label.includes("虚幻")));
});

test("非 Idle 动作在各套装内按语义去重，Idle 保留变体", () => {
  const seen = new Set();
  let idleCount = 0;
  for (const clip of selection.clips) {
    assert.ok(clip.name.length > 0);
    assert.ok(clip.clipName.startsWith("C57_"));
    if (clip.isIdleVariant) {
      idleCount += 1;
      continue;
    }
    const key = `${clip.packId}:${clip.dedupeKey}`;
    assert.equal(seen.has(key), false, `重复策选动作：${key}`);
    seen.add(key);
  }
  assert.ok(idleCount >= 10);
});

test("动画策选清单为每条片段固化细分类、演员、姿态和武器证据", () => {
  const actorKinds = new Set(["human", "humanoid-creature", "monster", "paired"]);
  const postures = new Set([
    "standing",
    "crouching",
    "sitting",
    "kneeling",
    "lying",
    "crawling",
    "airborne",
    "mixed",
  ]);
  const weaponTypes = new Set([
    "none",
    "barehand",
    "sword",
    "katana",
    "rapier",
    "spear",
    "dual-blade",
    "bow",
    "pistol",
    "hammer",
    "scythe",
    "dagger",
    "magic",
    "mixed",
  ]);
  for (const clip of selection.clips) {
    assert.match(clip.classificationId, /^[a-z0-9-]+$/);
    assert.ok(clip.classificationLabel.length > 0);
    assert.ok(actorKinds.has(clip.actorKind), `${clip.id} 演员类型无效`);
    assert.ok(postures.has(clip.posture), `${clip.id} 姿态无效`);
    assert.ok(weaponTypes.has(clip.weaponType), `${clip.id} 武器类型无效`);
  }

  const selectedWeaponTypes = new Set(
    selection.clips
      .filter((clip) => clip.groupId === "unreal-weapon-combat")
      .map((clip) => clip.weaponType),
  );
  for (const weaponType of ["sword", "katana", "rapier", "spear", "dual-blade", "bow", "pistol", "hammer", "scythe", "dagger"]) {
    assert.ok(selectedWeaponTypes.has(weaponType), `缺少武器细类：${weaponType}`);
  }
  const selectedCreatureClasses = new Set(
    selection.clips
      .filter((clip) => clip.groupId === "unreal-hand-combat")
      .map((clip) => clip.classificationId),
  );
  for (const classificationId of ["demon", "zombie", "ghost", "classic-ghost", "ground-creature"]) {
    assert.ok(selectedCreatureClasses.has(classificationId), `缺少生物细类：${classificationId}`);
  }
  assert.ok(
    selection.clips.some((clip) => clip.actorKind === "monster"),
    "应保留可复用人形骨骼的怪物动作",
  );
  assert.ok(
    selection.clips.some((clip) => clip.classificationId === "ground-creature" && clip.posture === "crawling"),
    "应保留生物地面/爬行动作",
  );
  assert.ok(
    selection.clips.some((clip) => clip.posture === "lying"),
    "应覆盖躺卧姿态",
  );
});
