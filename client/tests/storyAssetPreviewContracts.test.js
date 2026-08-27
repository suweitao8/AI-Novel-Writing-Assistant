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
  // 角色头像窗口以左上格正面面部视图为固定取景点：560px 方形、下移 160px 框住眉眼到下巴，
  // 百分比由常量推导，禁止再出现旧的四分条带窗口。
  assert.match(preview, /CHARACTER_SHEET_NATURAL_WIDTH = 1536/);
  assert.match(preview, /CHARACTER_AVATAR_FACE_WINDOW/);
  assert.match(preview, /size: 560,/);
  assert.match(preview, /offsetX: 0,/);
  assert.match(preview, /offsetY: 160,/);
  assert.match(preview, /\$\{\(CHARACTER_SHEET_NATURAL_WIDTH \/ size\) \* 100\}%/);
  assert.match(preview, /h-auto/);
  assert.doesNotMatch(preview, /w-\[300%\]/);
  assert.doesNotMatch(preview, /w-\[400%\]/);
  assert.doesNotMatch(preview, /CHARACTER_PREVIEW_CROP_TOP/);
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
