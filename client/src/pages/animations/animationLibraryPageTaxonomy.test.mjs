import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const pageSource = readFileSync(
  path.join(import.meta.dirname, "AnimationLibraryPage.tsx"),
  "utf8",
);

test("动画入口页使用两行细分类筛选，不再把套装作为第三层主导航", () => {
  assert.match(pageSource, /PAGE_SIZE\s*=\s*24/);
  assert.match(pageSource, /classificationId/);
  assert.match(pageSource, /data-animation-classification-filter/);
  assert.match(pageSource, /flex-nowrap/);
  assert.match(pageSource, /overflow-x-auto/);
  assert.doesNotMatch(pageSource, /data-animation-pack-filter/);
  assert.doesNotMatch(pageSource, /<Select/);
  assert.doesNotMatch(pageSource, /availablePacks/);
});

test("动画入口页只挂载当前页卡片并提供可访问分页", () => {
  assert.match(pageSource, /entries\.slice\(/);
  assert.match(pageSource, /data-animation-pagination/);
  assert.match(pageSource, /aria-label=\"上一页\"/);
  assert.match(pageSource, /aria-label=\"下一页\"/);
  assert.match(pageSource, /page.*totalPages|totalPages.*page/);
  assert.match(pageSource, /setPage\(1\)/);
});
