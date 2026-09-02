import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const pageSource = readFileSync(
  path.join(import.meta.dirname, "AnimationLibraryPage.tsx"),
  "utf8",
);

test("动画入口页用单一分类胶囊铺满筛选卡，不再有动作分类下拉", () => {
  assert.match(pageSource, /PAGE_SIZE\s*=\s*50/);
  assert.match(pageSource, /useState<AnimationLibraryCategoryFilterId>\("all"\)/);
  assert.match(pageSource, /ANIMATION_LIBRARY_CATEGORY_FILTERS/);
  assert.match(pageSource, /AnimationLibraryCategoryFilterId/);
  assert.match(pageSource, /data-animation-category-filter/);
  assert.match(pageSource, /data-animation-category-row/);
  assert.match(pageSource, /role="tablist"/);
  assert.match(pageSource, /data-animation-category=\{id\}/);
  assert.match(pageSource, /categoryCounts/);
  assert.match(pageSource, /renderCategoryButton/);
  // 分类铺成多行：动作类型分类在搜索范围内没有内容时自动隐藏。
  assert.match(pageSource, /visibleActionTypes\.some/);
  // 旧的动作分类下拉与来源/用途筛选一律不得回归。
  assert.doesNotMatch(pageSource, /SelectControl/);
  assert.doesNotMatch(pageSource, /按动作分类筛选/);
  assert.doesNotMatch(pageSource, /全部动作/);
  assert.doesNotMatch(pageSource, /data-animation-action-filter/);
  assert.doesNotMatch(pageSource, /ANIMATION_LIBRARY_SOURCES/);
  assert.doesNotMatch(pageSource, /ANIMATION_LIBRARY_SCOPES/);
  assert.doesNotMatch(pageSource, /data-animation-source-filter/);
  assert.doesNotMatch(pageSource, /data-animation-scope-filter/);
  assert.doesNotMatch(pageSource, /来源/);
  assert.doesNotMatch(pageSource, /用途/);
  assert.doesNotMatch(pageSource, /分镜可用/);
  assert.doesNotMatch(pageSource, /兼容动画/);
});

test("动画入口页桌面端每行显示 10 张卡片并按 5 行分页", () => {
  assert.match(
    pageSource,
    /grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-10/,
  );
  assert.doesNotMatch(pageSource, /xl:grid-cols-6/);
  assert.match(pageSource, /const pageStart = \(page - 1\) \* PAGE_SIZE/);
});

test("搜索框和搜索按钮在桌面端进入顶部导航 AI 实况左侧，移动端留在筛选卡内", () => {
  assert.match(pageSource, /usePageNavActionsSlot/);
  assert.match(pageSource, /useIsMobileViewport/);
  assert.match(pageSource, /createPortal/);
  assert.match(
    pageSource,
    /!isMobileViewport && navActionsSlot\s*\n\s*\? createPortal\(/,
  );
  assert.match(pageSource, /data-animation-search/);
  assert.match(pageSource, /type="submit"/);
  assert.match(pageSource, /aria-label="搜索动画"/);
  assert.match(pageSource, /data-animation-search-row/);
  assert.match(pageSource, /data-animation-reset-filters/);
  assert.match(pageSource, /setCategory\("all"\)/);
  // portal 的 JSX 与移动端卡内复用同一份搜索表单。
  assert.match(pageSource, /\{searchForm\}/);
  assert.doesNotMatch(pageSource, /sm:ml-auto/);
  assert.doesNotMatch(pageSource, /data-animation-filter-controls/);
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

test("动画搜索通过按钮或回车提交", () => {
  assert.match(pageSource, /<form[\s\S]*onSubmit/);
  assert.match(pageSource, /搜索/);
  assert.match(
    pageSource,
    /onKeyDown=\{\(event\) => \{[\s\S]*event\.key === "Enter"[\s\S]*applySearch\(event\.currentTarget\.value\)/,
  );
  assert.doesNotMatch(pageSource, /setTimeout\(\(\) => setSearch\(searchInput\.trim\(\)\), 250\)/);
});
