import assert from "node:assert/strict";
import test from "node:test";
import {
  DRAMA_FOCUS_MODE,
  isDramaFocusFeatureVisible,
  isNavRouteVisible,
} from "../src/config/dramaFocusNav.ts";

test("漫剧专注模式隐藏小说生产导航并保留漫剧设置入口", () => {
  assert.equal(DRAMA_FOCUS_MODE, true);
  assert.equal(isNavRouteVisible("/"), false);
  assert.equal(isNavRouteVisible("/novels"), false);
  assert.equal(isNavRouteVisible("/creative-hub"), false);
  assert.equal(isNavRouteVisible("/drama"), true);
  assert.equal(isNavRouteVisible("/models"), true);
  assert.equal(isNavRouteVisible("/animations"), true);
  assert.equal(isNavRouteVisible("/settings"), true);
  assert.equal(isNavRouteVisible("/settings/models"), true);
  assert.equal(isNavRouteVisible("/settings/narrator-voice"), true);
  assert.equal(isNavRouteVisible("/settings/records"), true);
  assert.equal(isNavRouteVisible("/settings/art-style"), true);
});

test("漫剧专注模式隐藏小说创作可用性检查，关闭模式后恢复", () => {
  assert.equal(isDramaFocusFeatureVisible("novel-readiness"), false);
  assert.equal(isDramaFocusFeatureVisible("novel-readiness", false), true);
});
