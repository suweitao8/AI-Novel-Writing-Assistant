import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), "utf8");

test("提取资产卡使用共享方形预览并保留世界观图标", () => {
  const source = read("pages/drama/comicDrama/components/ReferenceExtractTab.tsx");

  assert.match(source, /StoryAssetPreview/);
  assert.match(source, /buildStoryAssetPresentation/);
  assert.match(source, /existingPreviewFor/);
  assert.match(source, /<StoryAssetPreview/);
  assert.match(source, /w-20/);
  assert.match(source, /shrink-0/);
  assert.match(source, /GROUP_ICONS\[group\]/);
  assert.doesNotMatch(source, /buildStateImageSrc/);
  assert.doesNotMatch(source, /h-8 w-8/);
});
