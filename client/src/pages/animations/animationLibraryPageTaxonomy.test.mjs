import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const pageSource = readFileSync(
  path.join(import.meta.dirname, "AnimationLibraryPage.tsx"),
  "utf8",
);

test("动画入口页只保留用途、单一分类和搜索筛选", () => {
  assert.match(pageSource, /PAGE_SIZE\s*=\s*24/);
  assert.match(pageSource, /useState<AnimationLibraryScopeId>\("storyboard"\)/);
  assert.match(pageSource, /storyboard/);
  assert.match(pageSource, /data-animation-scope-filter/);
  assert.match(pageSource, /分镜可用/);
  assert.match(pageSource, /兼容动画/);
  assert.match(pageSource, /data-animation-category-filter/);
  assert.match(pageSource, /按分类筛选/);
  assert.match(pageSource, /全部分类/);
  assert.match(pageSource, /ANIMATION_LIBRARY_GROUPS/);
  assert.match(pageSource, /SelectControl/);
  assert.match(pageSource, /data-animation-search/);
  assert.match(pageSource, /data-animation-reset-filters/);
  assert.doesNotMatch(pageSource, /data-animation-group-filter-row/);
  assert.doesNotMatch(pageSource, /data-animation-classification-filter/);
  assert.doesNotMatch(pageSource, /data-animation-detail-filters/);
  assert.doesNotMatch(pageSource, /data-animation-pack-filter/);
  assert.doesNotMatch(pageSource, /data-animation-action-filter/);
  assert.doesNotMatch(pageSource, /data-animation-posture-filter/);
  assert.doesNotMatch(pageSource, /data-animation-weapon-filter/);
});

test("动画入口页只挂载当前页卡片并提供可访问分页", () => {
  assert.match(pageSource, /entries\.slice\(/);
  assert.match(pageSource, /data-animation-pagination/);
  assert.match(pageSource, /aria-label=\"上一页\"/);
  assert.match(pageSource, /aria-label=\"下一页\"/);
  assert.match(pageSource, /page.*totalPages|totalPages.*page/);
  assert.match(pageSource, /setPage\(1\)/);
});

test("动画搜索通过按钮或回车提交，并与分类筛选同排", () => {
  assert.match(pageSource, /<form[\s\S]*onSubmit/);
  assert.match(pageSource, /type="submit"/);
  assert.match(pageSource, /搜索/);
  assert.match(pageSource, /data-animation-filter-controls[\s\S]*data-animation-search/);
  assert.doesNotMatch(pageSource, /entries\.length\s*}\s*\/\s*\{scopedEntries\.length/);
  assert.doesNotMatch(pageSource, /setTimeout\(\(\) => setSearch\(searchInput\.trim\(\)\), 250\)/);
});
