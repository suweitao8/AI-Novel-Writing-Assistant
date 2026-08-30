const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const selectionPath = path.join(__dirname, "animationCatalogSelection.json");
const selection = JSON.parse(fs.readFileSync(selectionPath, "utf8"));

test("虚幻动画策选清单只包含真实 UE 路径并覆盖五个源组", () => {
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
