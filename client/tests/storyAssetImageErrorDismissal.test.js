import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (relativePath) => readFileSync(new URL(`../src/${relativePath}`, import.meta.url), "utf8");
const apiSource = read("api/story/storySettings.ts");
const editorSource = read("pages/novels/components/storySettings/assetForms.tsx");
const cardSource = read("components/storyAssets/StoryAssetCard.tsx");

test("客户端提供状态图失败提示的关闭 API", () => {
  assert.match(apiSource, /export async function dismissStoryAssetStateImageError\(/);
  assert.match(apiSource, /dismiss-image-error/);
  assert.match(apiSource, /expectedError: string/);
  assert.match(apiSource, /\{ error: expectedError \}/);
});

test("状态编辑器的关闭动作只针对失败提示，且有键盘可达的可访问名称", () => {
  assert.match(editorSource, /dismissStoryAssetStateImageError/);
  assert.match(editorSource, /aria-label=["`]关闭状态图失败提示["`]/);
  assert.match(editorSource, /selectedImageError/);
  assert.match(editorSource, /expectedError/);
});

test("资产卡片只在仍有错误文案时显示生成失败徽标", () => {
  assert.match(cardSource, /imageStatus === "error"\s*&&\s*Boolean\(defaultState\?\.imageError\)/);
  assert.match(cardSource, /const imageStatus = [\s\S]*defaultState\?\.imageError/);
});
