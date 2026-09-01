import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const pageSource = readFileSync(
  path.join(import.meta.dirname, "ModelLibraryPage.tsx"),
  "utf8",
);

test("模型入口页把提交式搜索 portal 进顶部导航栏", () => {
  assert.match(pageSource, /type FormEvent/);
  assert.match(pageSource, /usePageNavActionsSlot/);
  assert.match(pageSource, /useIsMobileViewport/);
  assert.match(pageSource, /createPortal/);
  assert.match(
    pageSource,
    /const searchPortal = !isMobileViewport && navActionsSlot[\s\S]*?createPortal\([\s\S]*?\{searchForm\}[\s\S]*?navActionsSlot,/,
  );
  assert.match(pageSource, /data-model-search/);
  assert.match(pageSource, /<form[\s\S]*onSubmit=\{submitSearch\}/);
  assert.match(pageSource, /type="submit"/);
  assert.match(
    pageSource,
    /onKeyDown=\{\(event\) => \{[\s\S]*event\.key === "Enter"[\s\S]*applySearch\(event\.currentTarget\.value\)/,
  );
  // 搜索框不再常驻筛选卡右上角，分类行也不再有为其预留的右侧空位。
  assert.doesNotMatch(pageSource, /sm:absolute/);
  assert.doesNotMatch(pageSource, /sm:pr-84/);
  assert.doesNotMatch(pageSource, /window\.setTimeout\(\(\) => setSearch\(searchInput\.trim\(\)\), 250\)/);
  assert.doesNotMatch(pageSource, /entries\.length\s*}\s*\/\s*\{visibleEntries\.length/);
});

test("模型分类合并为单一分类行，随宽度动态换行", () => {
  assert.match(pageSource, /data-model-category-filter/);
  assert.match(
    pageSource,
    /className="flex min-w-0 flex-wrap items-center gap-1"\s+data-model-category-row/,
  );
  assert.match(pageSource, /categoryItems\.map\(renderCategoryButton\)/);
  // 不再按固定数量硬拆首行与次行。
  assert.doesNotMatch(pageSource, /MODEL_LIBRARY_FIRST_ROW_CATEGORY_COUNT/);
  assert.doesNotMatch(pageSource, /data-model-category-first-row/);
  assert.doesNotMatch(pageSource, /data-model-category-secondary-row/);
  assert.doesNotMatch(pageSource, />\s*分类\s*<\/span>/);
  assert.doesNotMatch(pageSource, /overflow-x-auto/);
});

test("移动端顶栏放不下时搜索保留在筛选卡内", () => {
  assert.match(
    pageSource,
    /\{isMobileViewport \? \([\s\S]*?data-model-search-row[\s\S]*?\{searchForm\}[\s\S]*?\) : null\}/,
  );
});
