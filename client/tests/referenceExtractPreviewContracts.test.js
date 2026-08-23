import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), "utf8");

test("提取资产卡使用共享方形预览并让世界观保持纯文字", () => {
  const source = read("pages/drama/comicDrama/components/ReferenceExtractTab.tsx");

  assert.match(source, /StoryAssetPreview/);
  assert.match(source, /buildStoryAssetPresentation/);
  assert.match(source, /const existingPreviewFor = \(group: ExtractGroup, name: string\) =>/);
  assert.match(source, /const source = existingSourceFor\(group, name\);/);
  assert.match(source, /kind: "character", asset: source as StorySettingsCharacter/);
  assert.match(source, /kind: "scene", asset: source as StorySettingsScene/);
  assert.match(source, /kind: "prop", asset: source as StorySettingsProp/);
  assert.match(source, /const existingPreview = existing \? existingPreviewFor\(group, item\.name\) : null/);
  assert.match(source, /<StoryAssetPreview preview=\{existingPreview\} className="w-20 shrink-0 sm:w-24" \/>/);
  assert.match(source, /onClick=\{\(\) => setTarget\(\{ group, index \}\)\}/);
  assert.match(source, /\{item\.name\}/);
  assert.match(source, /\{body\}/);
  assert.match(source, /group !== "worldview"/);
  assert.doesNotMatch(source, /GROUP_ICONS/);
  assert.doesNotMatch(source, /group === "worldview"/);
  assert.doesNotMatch(source, /aria-hidden="true".*text-base/);
  assert.doesNotMatch(source, /buildStateImageSrc/);
  assert.doesNotMatch(source, /h-8 w-8/);
});
