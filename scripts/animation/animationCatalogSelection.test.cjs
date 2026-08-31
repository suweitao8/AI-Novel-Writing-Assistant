const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { getRootMotionEvidence } = require("./rootMotionPolicy.cjs");

const selectionPath = path.join(__dirname, "animationCatalogSelection.json");
const selection = JSON.parse(fs.readFileSync(selectionPath, "utf8"));

test("动画策选清单只包含真实 UE 路径并覆盖五个源组", () => {
  assert.equal(selection.target, "UAL2");
  assert.equal(selection.rootMotionPolicy, "strict-source-marked");
  assert.deepEqual(Object.keys(selection.groups), [
    "unreal-daily",
    "unreal-interaction",
    "unreal-misc",
    "unreal-hand-combat",
    "unreal-weapon-combat",
  ]);
  assert.ok(selection.clips.length > 0);
  assert.ok(selection.clips.length < 402, "严格 root-motion 清单应剔除非 root-motion 片段");
  assert.equal(new Set(selection.packs.map((pack) => pack.id)).size, selection.packs.length);
  assert.ok(selection.clips.every((clip) => clip.sourceAssetPath.startsWith("/Game/")));
  assert.ok(selection.clips.every((clip) => /^[a-z0-9-]+\.fbx$/.test(clip.fbxFileName)));
  assert.ok(selection.clips.every((clip) => /^[a-z0-9-]+\.glb$/.test(clip.glbFileName)));
  assert.ok(selection.groups["unreal-daily"].label === "日常动作");
  assert.ok(Object.values(selection.groups).every(({ label }) => !label.includes("虚幻")));
  assert.equal(selection.clips.length, 104, "当前发布目录应保留 104 条 root-motion 代表动作");
});

test("Cine57 清单不允许 InPlace，且每条片段都保留 root-motion 源证据", () => {
  assert.ok(selection.droppedClips.length > 0, "应记录被严格策略剔除的非 root-motion 候选");
  assert.ok(selection.clips.every((clip) => clip.rootMotion === true));
  assert.ok(selection.clips.every((clip) => getRootMotionEvidence({
    assetPath: clip.sourceAssetPath,
    assetName: clip.sourceAssetName,
  }) !== null));
  assert.ok(selection.clips.every((clip) => !/in[-_ ]?place/i.test(
    `${clip.sourceAssetPath}/${clip.sourceAssetName}`,
  )));
  assert.ok(selection.clips.every((clip) => !/原地/.test(clip.name)));
  assert.ok(selection.clips.every((clip) => ["source-path", "asset-name"].includes(clip.rootMotionEvidence)));
  assert.deepEqual(
    new Set(selection.clips.map((clip) => clip.groupId)),
    new Set(Object.keys(selection.groups)),
    "root-motion 策选仍应覆盖五个源组",
  );
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
  for (const weaponType of ["sword", "spear", "bow", "pistol", "hammer"]) {
    assert.ok(selectedWeaponTypes.has(weaponType), `缺少武器细类：${weaponType}`);
  }
  const selectedCreatureClasses = new Set(
    selection.clips
      .filter((clip) => clip.groupId === "unreal-hand-combat")
      .map((clip) => clip.classificationId),
  );
  for (const classificationId of ["monster", "ground-creature", "creature-combat"]) {
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

test("移动与待机分类能直接支持分镜筛选", () => {
  for (const id of [
    "unreal-daily-male-locomotion-idle-break-01",
    "unreal-daily-male-locomotion-idle-break-02",
    "unreal-misc-stairs-stairs-idle",
  ]) {
    assert.equal(
      selection.clips.find((clip) => clip.id === id)?.classificationId,
      "standing-idle",
      `${id} 应归入站立待机`,
    );
  }

  for (const id of [
    "unreal-daily-parkour-walk-in-place",
    "unreal-daily-parkour-run-in-place",
  ]) {
    const clip = selection.clips.find((candidate) => candidate.id === id);
    assert.equal(clip?.classificationId, "locomotion", `${id} 应归入站立移动`);
    assert.equal(clip?.posture, "standing", `${id} 应标记为站立姿态`);
  }
});
