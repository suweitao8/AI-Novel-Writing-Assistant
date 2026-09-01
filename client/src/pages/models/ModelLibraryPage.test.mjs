import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const pageSource = readFileSync(
  path.join(import.meta.dirname, "ModelLibraryPage.tsx"),
  "utf8",
);

test("模型入口页把分类放左侧、提交式搜索放右侧", () => {
  assert.match(pageSource, /type FormEvent/);
  assert.match(pageSource, /data-model-filter-controls/);
  assert.match(pageSource, /data-model-category-filter/);
  assert.match(pageSource, /data-model-category-filter[\s\S]*data-model-search/);
  assert.match(pageSource, /<form[\s\S]*onSubmit=\{submitSearch\}/);
  assert.match(pageSource, /type="submit"/);
  assert.match(
    pageSource,
    /onKeyDown=\{\(event\) => \{[\s\S]*event\.key === "Enter"[\s\S]*applySearch\(event\.currentTarget\.value\)/,
  );
  assert.match(
    pageSource,
    /className="[^"]*sm:absolute[^\"]*sm:right-2[^\"]*sm:w-80[^"]*"[\s\S]*data-model-search/,
  );
  assert.doesNotMatch(pageSource, /window\.setTimeout\(\(\) => setSearch\(searchInput\.trim\(\)\), 250\)/);
  assert.doesNotMatch(pageSource, /entries\.length\s*}\s*\/\s*\{visibleEntries\.length/);
});

test("模型分类去掉标题、允许换行并让后续行铺满搜索区", () => {
  assert.match(pageSource, /MODEL_LIBRARY_FIRST_ROW_CATEGORY_COUNT/);
  assert.match(pageSource, /data-model-category-first-row/);
  assert.match(pageSource, /data-model-category-secondary-row/);
  assert.match(pageSource, /data-model-category-first-row[\s\S]*flex-wrap/);
  assert.match(pageSource, /data-model-category-secondary-row[\s\S]*flex-wrap/);
  assert.doesNotMatch(pageSource, />\s*分类\s*<\/span>/);
  assert.doesNotMatch(pageSource, /overflow-x-auto/);
  assert.match(pageSource, /sm:pr-84/);
});
