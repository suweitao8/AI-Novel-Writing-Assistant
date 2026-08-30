const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const read = (relativePath) => fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");

test("场景资产和分镜接口统一接受 2.5 到 15 的圆半径，并兼容旧直径", () => {
  const sharedTypes = read("../shared/types/comicDrama.ts");
  const storySettingsRoutes = read("src/modules/novel/story-settings/http/storySettingsRoutes.ts");
  const dramaRoutes = read("src/modules/drama/http/dramaRoutes.ts");
  const blockingContracts = read("src/services/drama/visual/DramaShotBlockingSketchContracts.ts");

  assert.match(sharedTypes, /radiusMeters: \{ min: 2\.5, max: 15 \}/);
  assert.equal((storySettingsRoutes.match(/radiusMeters/g) ?? []).length >= 3, true);
  assert.match(storySettingsRoutes, /domeRadius/);
  assert.match(dramaRoutes, /radiusMeters/);
  assert.match(dramaRoutes, /domeRadius/);
  assert.match(blockingContracts, /normalizeBlockingSketchData/);
  assert.match(dramaRoutes, /heightMeters/);
  assert.match(dramaRoutes, /projectionCenterHeightRatio: z\.number\(\)\.min\(0\.05\)\.max\(0\.4\)\.optional\(\)/);
  assert.match(dramaRoutes, /projectionCenterHeight: z\.number\(\)\.min\(0\.25\)\.max\(6\)/);
});
