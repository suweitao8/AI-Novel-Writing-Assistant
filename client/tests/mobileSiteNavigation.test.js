import test from "node:test";
import assert from "node:assert/strict";
import {
  MOBILE_ROUTE_PATTERNS,
  getMobileNavGroupForPath,
  getMobilePageTitle,
  getMobilePrimaryNavItems,
  getMobileMoreNavGroups,
  getMobileRouteClassName,
} from "../src/components/layout/mobile/mobileSiteNavigation.ts";

const routedPaths = [
  "/",
  "/novels",
  "/novels/create",
  "/novels/demo/preview",
  "/novels/demo/edit",
  "/novels/demo/chapters/chapter-1",
  "/drama",
  "/models",
  "/creative-hub",
  "/chat-legacy",
  "/book-analysis",
  "/tasks",
  "/auto-director/follow-ups",
  "/knowledge",
  "/genres",
  "/story-modes",
  "/titles",
  "/prompt-workbench",
  "/art-style",
  "/settings/models",
  "/settings/director",
  "/settings/knowledge",
  "/settings/narrator-voice",
  "/settings/appearance",
  "/settings/records",
  "/settings/art-style",
  "/settings",
  "/worlds",
  "/worlds/generator",
  "/worlds/world-1/workspace",
  "/style-engine",
  "/anti-ai-rules",
  "/base-characters",
];

test("mobile route metadata covers every registered page", () => {
  assert.equal(MOBILE_ROUTE_PATTERNS.length, routedPaths.length);

  for (const path of routedPaths) {
    assert.notEqual(getMobilePageTitle(path), "更多功能");
    assert.match(getMobileNavGroupForPath(path), /^(home|novels|creation|tasks|more)$/);
    assert.match(getMobileRouteClassName(path), /^mobile-route-[a-z0-9-]+$/);
  }
});

test("mobile primary nav keeps the drama focus actions visible", () => {
  assert.deepEqual(
    getMobilePrimaryNavItems().map((item) => [item.key, item.to, item.label]),
    [
      ["creation", "/drama", "漫剧"],
      ["tasks", "/tasks", "任务"],
      ["more", "", "更多"],
    ],
  );
});

test("mobile more menu only contains focus-mode support entries", () => {
  const morePaths = getMobileMoreNavGroups().flatMap((group) => group.items.map((item) => item.to));

  assert.deepEqual(
    morePaths,
    [
      "/models",
      "/animations",
      "/tasks",
      "/art-style",
      "/settings",
    ],
  );
  assert.equal(getMobilePageTitle("/drama"), "漫剧");
  assert.equal(getMobilePageTitle("/settings/narrator-voice"), "通用资产");
});
