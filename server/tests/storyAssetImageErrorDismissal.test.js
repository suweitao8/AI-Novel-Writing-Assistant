const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");

const routesSource = fs.readFileSync(
  path.join(__dirname, "../src/modules/novel/story-settings/http/storySettingsRoutes.ts"),
  "utf8",
);
const serviceSource = fs.readFileSync(
  path.join(__dirname, "../src/modules/novel/story-settings/application/StoryAssetStateImageService.ts"),
  "utf8",
);

test("三类资产状态图都提供关闭失败提示的独立动作", () => {
  for (const kind of ["characters/:characterId", "scenes/:sceneId", "props/:propId"]) {
    assert.match(routesSource, new RegExp(`/${kind}/states/:stateId/dismiss-image-error`));
  }
  assert.equal((routesSource.match(/dismissStateImageError/g) ?? []).length, 3);
});

test("关闭失败提示走状态级 CAS 写回并返回最新资产", () => {
  assert.match(serviceSource, /async dismissStateImageError\(/);
  assert.match(serviceSource, /dismissStoryAssetImageError\(current\)/);
  assert.match(serviceSource, /await this\.writeStateImage\(/);
  assert.match(serviceSource, /storySettingsService\.listCharacters|storySettingsService\.listScenes|storySettingsService\.listProps/);
  assert.equal((serviceSource.match(/const nextImage = patchCurrentImage/g) ?? []).length, 3);
});
