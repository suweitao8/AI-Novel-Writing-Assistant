import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const modelPageSource = readFileSync(new URL("../src/pages/models/ModelLibraryPage.tsx", import.meta.url), "utf8");
const animationPageSource = readFileSync(new URL("../src/pages/animations/AnimationLibraryPage.tsx", import.meta.url), "utf8");

test("模型库页面提供搜索、角色隐藏后的空状态和清除入口", () => {
  assert.match(modelPageSource, /filterModelLibraryEntries\(MODEL_LIBRARY/);
  assert.match(modelPageSource, /data-model-search/);
  assert.match(modelPageSource, /aria-label="搜索模型"/);
  assert.match(modelPageSource, /data-model-empty/);
  assert.match(modelPageSource, /清除筛选/);
});

test("动画库页面提供搜索、最终结果空状态并把 query 传给筛选器", () => {
  assert.match(animationPageSource, /data-animation-search/);
  assert.match(animationPageSource, /aria-label="搜索动画"/);
  assert.match(animationPageSource, /data-animation-empty/);
  assert.match(animationPageSource, /query: search/);
  assert.match(animationPageSource, /setSearchInput\(""\)/);
});
