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
  assert.match(pageSource, /className="[^"]*sm:ml-auto[^"]*"[\s\S]*data-model-search/);
  assert.doesNotMatch(pageSource, /window\.setTimeout\(\(\) => setSearch\(searchInput\.trim\(\)\), 250\)/);
  assert.doesNotMatch(pageSource, /entries\.length\s*}\s*\/\s*\{visibleEntries\.length/);
});
