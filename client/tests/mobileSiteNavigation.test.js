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
  "/drama",
  "/drama/studio/demo",
  "/models",
  "/models/demo",
  "/animations",
  "/animations/demo",
  "/tasks",
  "/knowledge",
  "/art-style",
  "/settings/models",
  "/settings/knowledge",
  "/settings/narrator-voice",
  "/settings/narrator-voice/hdri/demo",
  "/settings/records",
  "/settings/art-style",
  "/settings",
];

test("mobile route metadata covers every registered page", () => {
  assert.ok(MOBILE_ROUTE_PATTERNS.length > 0);

  for (const path of routedPaths) {
    assert.notEqual(getMobilePageTitle(path), "更多功能");
    assert.match(getMobileNavGroupForPath(path), /^(drama|models|animations|tasks|more)$/);
    assert.match(getMobileRouteClassName(path), /^mobile-route-[a-z0-9-]+$/);
  }
});

test("mobile primary nav keeps the drama focus actions visible", () => {
  assert.deepEqual(
    getMobilePrimaryNavItems().map((item) => [item.key, item.to, item.label]),
    [
      ["drama", "/drama", "漫剧"],
      ["models", "/models", "模型"],
      ["animations", "/animations", "动画"],
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
      "/knowledge",
      "/settings/models",
      "/settings/knowledge",
      "/settings/narrator-voice",
      "/settings/art-style",
      "/settings/records",
      "/settings",
    ],
  );
  assert.equal(getMobilePageTitle("/drama"), "漫剧");
  assert.equal(getMobilePageTitle("/settings/narrator-voice"), "通用资产");
});
