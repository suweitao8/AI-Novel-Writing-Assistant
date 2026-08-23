import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseScriptItems } from "../../shared/utils/scriptDocument.ts";
import { compareStoryAssetKinds } from "../src/pages/drama/comicDrama/components/assetOrdering.ts";
import { collectScriptAssetUsage } from "../src/pages/drama/comicDrama/components/scriptAssetUsage.ts";

const asideSource = readFileSync(
  new URL("../src/pages/drama/comicDrama/components/OutlineSettingsAside.tsx", import.meta.url),
  "utf8",
);
const scriptTabSource = readFileSync(
  new URL("../src/pages/drama/comicDrama/components/ScriptTab.tsx", import.meta.url),
  "utf8",
);
const usageSource = readFileSync(
  new URL("../src/pages/drama/comicDrama/components/scriptAssetUsage.ts", import.meta.url),
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

test("脚本资产使用顺序覆盖混合引用和单字符资产", () => {
  const usage = collectScriptAssetUsage({
    items: parseScriptItems([
      "分镜：中景，「苏叶」拿着「信」并看向「门口」，旁边有「钥」",
      "林川：别动",
      "【场景：门口】",
    ].join("\n")),
    characters: [{ name: "林川" }, { name: "苏叶" }],
    scenes: [{ name: "门口" }],
    props: [{ name: "信" }, { name: "钥" }],
  });

  assert.deepEqual(usage.usedOrderKeys, [
    "character:苏叶",
    "prop:信",
    "scene:门口",
    "prop:钥",
    "character:林川",
  ]);
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
  assert.match(scriptTabSource, /collectScriptAssetUsage\(\{ items, characters, scenes, props: propList \}\)/);
  assert.match(usageSource, /for \(const item of input\.items\)[\s\S]*?pushMentionedAssets\(sourceText\);/);
  assert.match(usageSource, /const mentionNames = \[\.\.\.assetKindsByName\.keys\(\)\]/);
});
