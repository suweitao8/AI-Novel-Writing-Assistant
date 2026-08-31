import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const pageSource = readFileSync(
  path.join(import.meta.dirname, "AnimationLibraryPage.tsx"),
  "utf8",
);

test("动画入口页使用分镜用途、来源与细分类筛选", () => {
  assert.match(pageSource, /PAGE_SIZE\s*=\s*24/);
  assert.match(pageSource, /useState<AnimationLibraryScopeId>\("storyboard"\)/);
  assert.match(pageSource, /storyboard/);
  assert.match(pageSource, /data-animation-scope-filter/);
  assert.match(pageSource, /ANIMATION_LIBRARY_SCOPES/);
  assert.match(pageSource, /scopeOption\.id === "storyboard"/);
  assert.match(pageSource, /scopeOption\.id === "compatibility"/);
  assert.match(pageSource, /classificationId/);
  assert.match(pageSource, /data-animation-classification-filter/);
  assert.match(pageSource, /flex-nowrap/);
  assert.match(pageSource, /overflow-x-auto/);
  assert.match(pageSource, /SelectControl/);
  assert.match(pageSource, /data-animation-pack-filter/);
  assert.match(pageSource, /data-animation-action-filter/);
  assert.match(pageSource, /data-animation-posture-filter/);
  assert.match(pageSource, /data-animation-weapon-filter/);
  const packOptionsSource = pageSource.match(
    /const availablePackEntries = useMemo\([\s\S]*?\n  \);/,
  )?.[0];
  assert.ok(packOptionsSource, "套装选项应有独立的可用项计算");
  assert.match(packOptionsSource, /classificationId/);
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

test("动画搜索通过按钮或回车提交，并与来源筛选同排", () => {
  assert.match(pageSource, /<form[\s\S]*onSubmit/);
  assert.match(pageSource, /type="submit"/);
  assert.match(pageSource, /搜索/);
  assert.match(pageSource, /data-animation-group-filter-row[\s\S]*data-animation-search/);
  assert.doesNotMatch(pageSource, /entries\.length\s*}\s*\/\s*\{scopedEntries\.length/);
  assert.doesNotMatch(pageSource, /setTimeout\(\(\) => setSearch\(searchInput\.trim\(\)\), 250\)/);
});
