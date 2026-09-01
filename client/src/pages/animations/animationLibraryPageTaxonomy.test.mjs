import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const pageSource = readFileSync(
  path.join(import.meta.dirname, "AnimationLibraryPage.tsx"),
  "utf8",
);

test("动画入口页提供统一分类筛选，并保留动作分类下拉", () => {
  assert.match(pageSource, /PAGE_SIZE\s*=\s*24/);
  assert.match(pageSource, /useState<AnimationLibraryCategoryFilterId>\("all"\)/);
  assert.match(pageSource, /ANIMATION_LIBRARY_CATEGORY_FILTERS/);
  assert.match(pageSource, /AnimationLibraryCategoryFilterId/);
  assert.match(pageSource, /data-animation-category-filter/);
  assert.match(pageSource, /categoryOption\.id/);
  assert.match(pageSource, /categoryCounts/);
  assert.match(pageSource, /data-animation-action-filter/);
  assert.match(pageSource, /按动作分类筛选/);
  assert.match(pageSource, /全部动作/);
  assert.match(pageSource, /ANIMATION_LIBRARY_ACTION_TYPES/);
  assert.match(pageSource, /AnimationLibraryActionTypeId/);
  assert.match(pageSource, /actionTypeCounts/);
  assert.match(pageSource, /SelectControl/);
  assert.match(pageSource, /data-animation-search/);
  assert.match(pageSource, /data-animation-reset-filters/);
  // 来源与用途两行筛选已合并为单一分类：页面不得再出现来源/用途筛选入口。
  assert.doesNotMatch(pageSource, /ANIMATION_LIBRARY_SOURCES/);
  assert.doesNotMatch(pageSource, /ANIMATION_LIBRARY_SCOPES/);
  assert.doesNotMatch(pageSource, /data-animation-source-filter/);
  assert.doesNotMatch(pageSource, /data-animation-scope-filter/);
  assert.doesNotMatch(pageSource, /来源/);
  assert.doesNotMatch(pageSource, /用途/);
  assert.doesNotMatch(pageSource, /分镜可用/);
  assert.doesNotMatch(pageSource, /兼容动画/);
  assert.doesNotMatch(pageSource, /data-animation-group-filter-row/);
  assert.doesNotMatch(pageSource, /data-animation-classification-filter/);
  assert.doesNotMatch(pageSource, /data-animation-pack-filter/);
  assert.doesNotMatch(pageSource, /data-animation-posture-filter/);
  assert.doesNotMatch(pageSource, /data-animation-weapon-filter/);
});

test("分类与搜索占据首行，动作分类位于后续筛选行", () => {
  assert.match(pageSource, /data-animation-filter-controls/);
  assert.match(pageSource, /data-animation-category-filter/);
  assert.match(pageSource, /data-animation-search/);
  assert.match(pageSource, /sm:ml-auto/);
  assert.match(pageSource, /data-animation-detail-filters/);
  assert.match(pageSource, /data-animation-action-filter/);
  assert.match(pageSource, /setCategory\("all"\)/);
  assert.match(pageSource, /data-animation-category-filter[\s\S]*?TabsList className="[^"]*flex-wrap/);
});

test("动画卡片只保留有用信息，不重复显示播放和用途装饰", () => {
  const cardSource = pageSource.match(
    /function AnimationCard\([\s\S]*?\r?\n}\r?\n\r?\nfunction countBy/,
  )?.[0];
  assert.ok(cardSource, "动画卡片应有独立的渲染边界");
  assert.match(cardSource, /to=\{`\/animations\/\$\{entry\.id\}`\}/);
  assert.match(cardSource, /focus-visible:ring-2/);
  assert.match(cardSource, /entry\.name/);
  assert.match(cardSource, /entry\.packLabel/);
  assert.match(cardSource, /entry\.classificationLabel/);
  assert.match(cardSource, /entry\.postureLabel/);
  assert.match(cardSource, /getAnimationFrameCount/);
  assert.doesNotMatch(cardSource, /<Play\b/);
  assert.doesNotMatch(cardSource, /分镜可用/);
  assert.doesNotMatch(cardSource, /兼容动画/);
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
  assert.match(pageSource, /onKeyDown=\{\(event\) => \{[\s\S]*event\.key === "Enter"[\s\S]*applySearch\(event\.currentTarget\.value\)/);
  assert.match(pageSource, /data-animation-filter-controls[\s\S]*data-animation-search/);
  assert.match(pageSource, /className="[^\"]*sm:ml-auto[^\"]*"[\s\S]*data-animation-search/);
  assert.doesNotMatch(pageSource, /entries\.length\s*}\s*\/\s*\{searchedEntries\.length/);
  assert.doesNotMatch(pageSource, /setTimeout\(\(\) => setSearch\(searchInput\.trim\(\)\), 250\)/);
});
