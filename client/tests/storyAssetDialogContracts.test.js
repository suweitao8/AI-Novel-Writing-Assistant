import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), "utf8");

test("四个故事资产入口复用共用卡片和详情弹窗", () => {
  const entrypoints = [
    "pages/drama/comicDrama/components/OutlineSettingsAside.tsx",
    "pages/novels/components/storySettings/SettingsCharactersTab.tsx",
    "pages/novels/components/storySettings/SettingsScenesTab.tsx",
    "pages/novels/components/storySettings/SettingsPropsTab.tsx",
  ].map(read);
  for (const source of entrypoints) {
    assert.match(source, /StoryAssetCard/);
    assert.match(source, /StoryAssetDetailDialog/);
  }
  assert.doesNotMatch(entrypoints[0], /function AssetDetailDialog/);
  assert.doesNotMatch(entrypoints[0], /function DetailStates/);
});

test("共用详情弹窗使用 AppDialogContent 并提供统一关闭入口", () => {
  const source = read("components/storyAssets/StoryAssetDetailDialog.tsx");
  assert.match(source, /AppDialogContent/);
  assert.match(source, /onOpenChange/);
  assert.match(source, /关闭/);
});
