const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const source = fs.readFileSync(
  path.join(__dirname, "../src/modules/novel/story-settings/http/storySettingsRoutes.ts"),
  "utf8",
);

test("场景状态提供独立的 3D 空间标记识别入口", () => {
  assert.match(source, /states\/\$\{?sceneId|states\/.*stateId/);
  assert.match(source, /3d-markers\/analyze/);
  assert.match(source, /storyScene3dMarkerService/);
  assert.match(source, /analyzeSceneState/);
});
