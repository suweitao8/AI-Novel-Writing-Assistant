import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const pageSource = readFileSync(
  path.join(import.meta.dirname, "AnimationLibraryPage.tsx"),
  "utf8",
);

test("动画入口页保留用途和中等粒度动作分类，并提供搜索筛选", () => {
  assert.match(pageSource, /PAGE_SIZE\s*=\s*24/);
  assert.match(pageSource, /useState<AnimationLibraryScopeId>\("storyboard"\)/);
  assert.match(pageSource, /storyboard/);
  assert.match(pageSource, /data-animation-scope-filter/);
  assert.match(pageSource, /ANIMATION_LIBRARY_SCOPES/);
  assert.match(pageSource, /scopeOption\.id === "storyboard"/);
  assert.match(pageSource, /scopeOption\.id === "compatibility"/);
  assert.match(pageSource, /data-animation-category-filter/);
  assert.match(pageSource, /按动作分类筛选/);
  assert.match(pageSource, /全部动作/);
  assert.match(pageSource, /ANIMATION_LIBRARY_ACTION_TYPES/);
  assert.match(pageSource, /AnimationLibraryActionTypeId/);
  assert.match(pageSource, /actionTypeCounts/);
  assert.match(pageSource, /SelectControl/);
  assert.match(pageSource, /data-animation-search/);
  assert.match(pageSource, /data-animation-reset-filters/);
  assert.doesNotMatch(pageSource, /ANIMATION_LIBRARY_GROUPS/);
  assert.doesNotMatch(pageSource, /data-animation-group-filter-row/);
  assert.doesNotMatch(pageSource, /data-animation-classification-filter/);
  assert.doesNotMatch(pageSource, /data-animation-detail-filters/);
  assert.doesNotMatch(pageSource, /data-animation-pack-filter/);
  assert.doesNotMatch(pageSource, /data-animation-action-filter/);
  assert.doesNotMatch(pageSource, /data-animation-posture-filter/);
  assert.doesNotMatch(pageSource, /data-animation-weapon-filter/);
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
  assert.doesNotMatch(pageSource, /entries\.length\s*}\s*\/\s*\{scopedEntries\.length/);
  assert.doesNotMatch(pageSource, /setTimeout\(\(\) => setSearch\(searchInput\.trim\(\)\), 250\)/);
});
