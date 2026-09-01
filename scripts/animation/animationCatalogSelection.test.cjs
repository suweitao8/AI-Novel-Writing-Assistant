const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { getInPlaceSourceEvidence } = require("./inPlaceAnimationPolicy.cjs");

const selectionPath = path.join(__dirname, "animationCatalogSelection.json");
const selection = JSON.parse(fs.readFileSync(selectionPath, "utf8"));

test("动画策选清单只包含真实 UE 路径并覆盖五个源组", () => {
  assert.equal(selection.target, "UAL2");
  assert.equal(selection.inPlacePolicy, "strict-source-in-place");
  assert.equal(selection.rootTranslationMaxRangeMeters, 0.03);
  assert.deepEqual(Object.keys(selection.groups), [
    "unreal-daily",
    "unreal-interaction",
    "unreal-misc",
    "unreal-hand-combat",
    "unreal-weapon-combat",
  ]);
  assert.ok(selection.clips.length > 0);
  assert.ok(selection.clips.length < 402, "原地清单应剔除位移过大的片段");
  assert.equal(new Set(selection.packs.map((pack) => pack.id)).size, selection.packs.length);
  assert.ok(selection.clips.every((clip) => clip.sourceAssetPath.startsWith("/Game/")));
  assert.ok(selection.clips.every((clip) => /^[a-z0-9-]+\.fbx$/.test(clip.fbxFileName)));
  assert.ok(selection.clips.every((clip) => /^[a-z0-9-]+\.glb$/.test(clip.glbFileName)));
  assert.ok(selection.groups["unreal-daily"].label === "日常动作");
  assert.ok(Object.values(selection.groups).every(({ label }) => !label.includes("虚幻")));
  assert.equal(
    selection.clips.length,
    277,
    "策选清单保留全部通过位移审计的原地动作；发布范围由 published 标记控制",
  );
  assert.equal(
    selection.clips.filter((clip) => clip.published !== false).length,
    78,
    "当前只发布运动（移动）与生活表演类，其余分类待管线跑通后再上架",
  );
});

test("Cine57 清单优先 InPlace，并为每条片段保留原地源与数值审计证据", () => {
  assert.ok(selection.droppedClips.length > 0, "应记录被策略剔除的候选");
  assert.ok(selection.clips.every((clip) => clip.inPlace === true));
  assert.ok(selection.clips.every((clip) => getInPlaceSourceEvidence({
    assetPath: clip.sourceAssetPath,
    assetName: clip.sourceAssetName,
  }) !== null));
  assert.ok(selection.clips.every((clip) => ["source-path", "asset-name", "unmarked-non-root"].includes(clip.inPlaceEvidence)));
  assert.ok(selection.clips.every((clip) => clip.rootTranslationMaxRangeMeters <= 0.030001));
  assert.ok(selection.clips.every((clip) => clip.rootTranslationMaxNetMeters <= 0.030001));
  assert.equal(selection.rootTranslationAudit.auditedClipCount, 379);
  assert.equal(selection.rootTranslationAudit.rejectedClipCount, 102);
  assert.deepEqual(
    new Set(selection.clips.map((clip) => clip.groupId)),
    new Set(Object.keys(selection.groups)),
    "原地策选仍应覆盖五个源组",
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
  ]) {
    assert.equal(
      selection.clips.find((clip) => clip.id === id)?.classificationId,
      "standing-idle",
      `${id} 应归入站立待机`,
    );
  }

  const stairsIdle = selection.clips.find(
    (clip) => clip.id === "unreal-misc-stairs-stairs-idle",
  );
  assert.ok(
    stairsIdle == null || stairsIdle.classificationId === "standing-idle",
    "楼梯待机若有原地源应归入站立待机",
  );

  for (const id of [
    "unreal-daily-parkour-walk-in-place",
    "unreal-daily-parkour-run-in-place",
  ]) {
    const clip = selection.clips.find((candidate) => candidate.id === id);
    assert.equal(clip?.classificationId, "locomotion", `${id} 应归入站立移动`);
    assert.equal(clip?.posture, "standing", `${id} 应标记为站立姿态`);
  }
});
