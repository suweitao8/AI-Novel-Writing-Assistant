import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (relativePath) => readFileSync(new URL(`../src/${relativePath}`, import.meta.url), "utf8");

test("自动补图协调器覆盖三类资产并复用状态图片接口", () => {
  const source = read("pages/novels/components/storySettings/AutoStoryAssetImageGeneration.tsx");

  assert.match(source, /storySettingsCharacters/);
  assert.match(source, /storySettingsScenes/);
  assert.match(source, /storySettingsProps/);
  assert.match(source, /generateStoryAssetStateImage/);
  assert.match(source, /AUTO_STORY_ASSET_IMAGE_CONCURRENCY/);
  assert.match(source, /isFetching/);
  assert.match(source, /setStateImageStatus\(queryClient, group, task, "generating"\)/);
});

test("资产设置页和漫剧工作室都挂载自动补图协调器", () => {
  const settingsTabs = read("pages/novels/components/storySettings/StorySettingsTabs.tsx");
  const dramaStudio = read("pages/drama/comicDrama/ComicDramaStudioPage.tsx");

  assert.match(settingsTabs, /<AutoStoryAssetImageGeneration novelId=\{novelId\} \/>/);
  assert.match(dramaStudio, /<AutoStoryAssetImageGeneration novelId=\{novelId\} \/>/);
});

test("资产预览和卡片会突出显示生成中与失败状态", () => {
  const presentation = read("components/storyAssets/storyAssetPresentation.ts");
  const preview = read("components/storyAssets/StoryAssetPreview.tsx");
  const card = read("components/storyAssets/StoryAssetCard.tsx");

  assert.match(presentation, /imageStatus: state\.image\?\.status/);
  assert.match(presentation, /imageError: clean\(state\.image\?\.error\)/);
  assert.match(preview, /生成中/);
  assert.match(preview, /animate-spin/);
  assert.match(card, /imageStatus === "error"/);
  assert.match(card, /生成失败/);
});
