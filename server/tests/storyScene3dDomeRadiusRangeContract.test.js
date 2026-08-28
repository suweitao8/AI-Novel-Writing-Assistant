const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const read = (relativePath) => fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");

test("场景资产和分镜接口统一接受 5 到 30 的半球直径", () => {
  const sharedTypes = read("../shared/types/comicDrama.ts");
  const storySettingsRoutes = read("src/modules/novel/story-settings/http/storySettingsRoutes.ts");
  const dramaRoutes = read("src/modules/drama/http/dramaRoutes.ts");

  assert.match(sharedTypes, /domeRadius: \{ min: 5, max: 30 \}/);
  assert.equal((storySettingsRoutes.match(/STORY_SCENE_3D_ENVIRONMENT_LIMITS\.domeRadius\.max/g) ?? []).length, 3);
  assert.match(dramaRoutes, /domeRadius: z\.number\(\)\.min\(5\)\.max\(100\)/);
  assert.match(dramaRoutes, /normalizeBlockingSketchData/);
  assert.match(dramaRoutes, /projectionCenterHeightRatio: z\.number\(\)\.min\(0\.05\)\.max\(0\.2\)\.optional\(\)/);
  assert.match(dramaRoutes, /projectionCenterHeight: z\.number\(\)\.min\(0\.25\)\.max\(6\)/);
});
