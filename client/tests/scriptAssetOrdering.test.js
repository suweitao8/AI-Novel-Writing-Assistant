import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { compareStoryAssetKinds } from "../src/pages/drama/comicDrama/components/assetOrdering.ts";

const asideSource = readFileSync(
  new URL("../src/pages/drama/comicDrama/components/OutlineSettingsAside.tsx", import.meta.url),
  "utf8",
);
const scriptTabSource = readFileSync(
  new URL("../src/pages/drama/comicDrama/components/ScriptTab.tsx", import.meta.url),
  "utf8",
);

test("脚本资产类型固定为角色、场景、道具", () => {
  const assets = [
    { kind: "prop", name: "信" },
    { kind: "scene", name: "客厅" },
    { kind: "character", name: "林川" },
    { kind: "scene", name: "码头" },
    { kind: "character", name: "苏叶" },
  ];

  assets.sort((left, right) => compareStoryAssetKinds(left.kind, right.kind));

  assert.deepEqual(
    assets.map((asset) => `${asset.kind}:${asset.name}`),
    ["character:林川", "character:苏叶", "scene:客厅", "scene:码头", "prop:信"],
  );
});

test("右侧资产列表在更新时间和脚本使用顺序之前应用类型排序", () => {
  assert.match(asideSource, /compareStoryAssetKinds\(left\.kind, right\.kind\)/);
  assert.match(
    asideSource,
    /compareStoryAssetKinds\(left\.kind, right\.kind\)[\s\S]*?\|\|\s*\(left\.updatedAt/,
  );
  assert.match(
    asideSource,
    /compareStoryAssetKinds\(left\.kind, right\.kind\)[\s\S]*?\|\|\s*\(order\.get\(/,
  );
  assert.match(asideSource, /compareStoryAssetKinds\(left\.type, right\.type\)/);
  assert.match(scriptTabSource, /for \(const name of mentionedCharacters\)[\s\S]*?pushUsed\(`character:/);
  assert.match(scriptTabSource, /for \(const name of mentionedScenes\)[\s\S]*?pushUsed\(`scene:/);
  assert.match(scriptTabSource, /for \(const name of mentionedProps\)[\s\S]*?pushUsed\(`prop:/);
});
