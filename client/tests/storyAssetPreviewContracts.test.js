import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (relativePath) => readFileSync(new URL(`../src/${relativePath}`, import.meta.url), "utf8");

test("story asset preview keeps the three crop modes and fallback states", () => {
  const presentation = read("components/storyAssets/storyAssetPresentation.ts");
  const preview = read("components/storyAssets/StoryAssetPreview.tsx");

  assert.match(presentation, /character-top-left-grid/);
  assert.match(presentation, /center-square/);
  assert.match(presentation, /label\.trim\(\) === "默认"/);
  assert.match(preview, /w-\[400%\]/);
  assert.match(preview, /h-auto/);
  assert.match(preview, /top-1\/2/);
  assert.match(preview, /-translate-y-1\/2/);
  assert.doesNotMatch(preview, /h-\[200%\]/);
  assert.match(preview, /aspect-square/);
  assert.match(preview, /object-center/);
  assert.match(preview, /暂无预览图/);
  assert.match(preview, /onError/);
});
