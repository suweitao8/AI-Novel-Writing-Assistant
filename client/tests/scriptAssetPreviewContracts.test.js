import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (relativePath) => readFileSync(new URL(`../src/${relativePath}`, import.meta.url), "utf8");

test("script asset aside uses large default-state image previews", () => {
  const asideSource = read("pages/drama/comicDrama/components/OutlineSettingsAside.tsx");
  const scriptSource = read("pages/drama/comicDrama/components/ScriptTab.tsx");
  const cardSource = read("components/storyAssets/StoryAssetCard.tsx");

  assert.match(asideSource, /showDefaultStateImage/);
  assert.match(scriptSource, /lg:grid-cols-\[minmax\(0,1fr\)_360px\]/);
  assert.match(cardSource, /asset\.states\[0\]\?\.imageUrl/);
  assert.match(cardSource, /showDefaultStateImage \? null : asset\.summary/);
});
