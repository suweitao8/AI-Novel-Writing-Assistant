import assert from "node:assert/strict";
import test from "node:test";

import {
  ANIMATION_LIBRARY,
  ANIMATION_LIBRARY_ACTION_TYPES,
  ANIMATION_LIBRARY_GROUPS,
  ANIMATION_LIBRARY_PACKS,
  filterAnimationLibraryEntries,
} from "./animationLibrary.ts";

test("动画目录明确区分旧动画、UE 源组和独立套装", () => {
  assert.deepEqual(
    ANIMATION_LIBRARY_GROUPS.map(({ id }) => id),
    [
      "legacy",
      "unreal-daily",
      "unreal-interaction",
      "unreal-misc",
      "unreal-hand-combat",
      "unreal-weapon-combat",
    ],
  );
  assert.ok(ANIMATION_LIBRARY.some((entry) => entry.source === "legacy"));
  assert.ok(ANIMATION_LIBRARY.some((entry) => entry.source === "unreal"));
  assert.ok(ANIMATION_LIBRARY_PACKS.length >= 20);
  assert.ok(ANIMATION_LIBRARY_GROUPS.every(({ label }) => !label.includes("虚幻")));
  for (const pack of ANIMATION_LIBRARY_PACKS) {
    assert.ok(
      ANIMATION_LIBRARY.some((entry) => entry.packId === pack.id),
      `套装 ${pack.id} 必须至少有一条可预览动画`,
    );
  }
});

test("动画目录的动作语义和去重键完整，Idle 允许保留多个变体", () => {
  const actionIds = new Set(ANIMATION_LIBRARY_ACTION_TYPES.map(({ id }) => id));
  const nonIdleKeys = new Map();
  let idleVariantCount = 0;
  for (const entry of ANIMATION_LIBRARY) {
    assert.ok(actionIds.has(entry.actionType), `未知动作类型：${entry.actionType}`);
    assert.ok(entry.dedupeKey.length > 0, `${entry.id} 缺少去重键`);
    if (entry.actionType === "idle") {
      idleVariantCount += 1;
      continue;
    }
    const key = `${entry.packId}:${entry.dedupeKey}`;
    assert.equal(nonIdleKeys.has(key), false, `非 Idle 动作重复：${key}`);
    nonIdleKeys.set(key, entry.id);
  }
  assert.ok(idleVariantCount >= 10, "目录应保留各套装的多个待机变体");
});

test("动画库筛选同时支持源组、套装和动作类型", () => {
  const boxing = filterAnimationLibraryEntries(ANIMATION_LIBRARY, {
    groupId: "unreal-hand-combat",
    actionType: "boxing",
  });
  assert.ok(boxing.length > 0, "徒手战斗组应有拳击动画");
  assert.ok(boxing.every((entry) => entry.actionType === "boxing"));
  assert.ok(boxing.every((entry) => entry.groupId === "unreal-hand-combat"));

  const old = filterAnimationLibraryEntries(ANIMATION_LIBRARY, { groupId: "legacy" });
  assert.ok(old.length > 0);
  assert.ok(old.every((entry) => entry.source === "legacy"));
});

test("动画库按规范化细分类筛选，并保留武器、姿态和生物证据", () => {
  const bow = filterAnimationLibraryEntries(ANIMATION_LIBRARY, {
    groupId: "unreal-weapon-combat",
    classificationId: "bow",
  });
  assert.ok(bow.length > 0, "武器战斗组应有弓箭细类");
  assert.ok(bow.every((entry) => entry.classificationId === "bow"));
  assert.ok(bow.every((entry) => entry.weaponType === "bow"));

  const groundCreature = filterAnimationLibraryEntries(ANIMATION_LIBRARY, {
    classificationId: "ground-creature",
  });
  assert.ok(groundCreature.length > 0, "目录应有生物地面动作");
  assert.ok(groundCreature.some((entry) => entry.posture === "crawling"));
  assert.ok(
    groundCreature.some((entry) => entry.actorKind === "monster" || entry.actorKind === "humanoid-creature"),
  );

  const lying = filterAnimationLibraryEntries(ANIMATION_LIBRARY, { posture: "lying" });
  assert.ok(lying.length > 0, "目录应有躺卧动作");
  assert.ok(lying.every((entry) => entry.posture === "lying"));
});

test("动画目录支持按片段、套装和动作类型搜索，并与来源组筛选取交集", () => {
  const target = ANIMATION_LIBRARY.find((entry) => entry.source === "unreal" && entry.sourceAssetName);
  assert.ok(target);

  const byClip = filterAnimationLibraryEntries(ANIMATION_LIBRARY, { query: target.clipName });
  assert.deepEqual(byClip.map((entry) => entry.id), [target.id]);

  const byPack = filterAnimationLibraryEntries(ANIMATION_LIBRARY, { query: target.packLabel });
  assert.ok(byPack.length > 0);
  assert.ok(byPack.every((entry) => entry.packId === target.packId));

  const byAction = filterAnimationLibraryEntries(ANIMATION_LIBRARY, { query: target.actionTypeLabel });
  assert.ok(byAction.length > 0);
  const normalizedActionQuery = target.actionTypeLabel.toLocaleLowerCase();
  assert.ok(
    byAction.every((entry) =>
      [
        entry.name,
        entry.clipName,
        entry.id,
        entry.packLabel,
        entry.actionTypeLabel,
        entry.classificationLabel,
        entry.actorKindLabel,
        entry.postureLabel,
        entry.weaponTypeLabel,
        entry.sourceAssetName,
        entry.sourcePack,
        entry.sourceAssetPath,
      ].some((value) => value?.toLocaleLowerCase().includes(normalizedActionQuery)),
    ),
  );
  assert.ok(byAction.some((entry) => entry.actionType === target.actionType));

  const scoped = filterAnimationLibraryEntries(ANIMATION_LIBRARY, {
    groupId: target.groupId,
    query: target.clipName,
  });
  assert.deepEqual(scoped.map((entry) => entry.id), [target.id]);
});
