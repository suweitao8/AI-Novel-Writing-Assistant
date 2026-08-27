import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (relativePath) => readFileSync(new URL(`../src/${relativePath}`, import.meta.url), "utf8");

test("story asset preview keeps the crop modes and fallback states", () => {
  const presentation = read("components/storyAssets/storyAssetPresentation.ts");
  const preview = read("components/storyAssets/StoryAssetPreview.tsx");

  assert.match(presentation, /character-left-square/);
  assert.match(presentation, /center-square/);
  assert.match(presentation, /label\.trim\(\) === "默认"/);
  // 角色头像窗口取状态图最左 1/3 并轻微下移：预览必须是方形头像，不带竖向人体条带。
  assert.match(preview, /w-\[300%\]/);
  assert.match(preview, /h-auto/);
  assert.match(preview, /CHARACTER_PREVIEW_CROP_TOP/);
  assert.match(preview, /-4%/);
  assert.doesNotMatch(preview, /w-\[400%\]/);
  assert.doesNotMatch(preview, /-62\.5%/);
  assert.doesNotMatch(preview, /-58\.3333%/);
  assert.doesNotMatch(preview, /top-1\/2/);
  assert.doesNotMatch(preview, /-translate-y-1\/2/);
  assert.doesNotMatch(preview, /h-\[200%\]/);
  assert.match(preview, /aspect-square/);
  assert.match(preview, /object-center/);
  assert.match(preview, /暂无预览图/);
  assert.match(preview, /onError/);
});
