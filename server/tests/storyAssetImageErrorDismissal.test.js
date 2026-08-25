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
const runtimeSource = fs.readFileSync(
  path.join(__dirname, "../src/services/image/runtime/runner.ts"),
  "utf8",
);

test("三类资产状态图都提供关闭失败提示的独立动作", () => {
  for (const kind of ["characters/:characterId", "scenes/:sceneId", "props/:propId"]) {
    assert.match(routesSource, new RegExp(`/${kind}/states/:stateId/dismiss-image-error`));
  }
  assert.equal((routesSource.match(/error: z\.string\(\)\.min\(1\)\.max\(600\)/g) ?? []).length, 3);
  assert.equal((routesSource.match(/attemptId: z\.string\(\)\.trim\(\)\.min\(1\)\.max\(120\)\.optional\(\)/g) ?? []).length, 3);
  assert.equal((routesSource.match(/dismissStateImageError/g) ?? []).length, 3);
});

test("关闭失败提示走状态级 CAS 写回并返回最新资产", () => {
  assert.match(serviceSource, /async dismissStateImageError\(/);
  assert.match(serviceSource, /dismissStoryAssetImageError\(current, expectedError, expectedAttemptId\)/);
  assert.match(serviceSource, /current\.error !== expectedError/);
  assert.match(serviceSource, /expectedAttemptId/);
  assert.match(serviceSource, /current\.attemptId !== expectedAttemptId/);
  assert.match(serviceSource, /expectedAttemptId === undefined \? 1 : 3/);
  assert.match(serviceSource, /await this\.writeStateImage\(/);
  assert.match(serviceSource, /storySettingsService\.listCharacters|storySettingsService\.listScenes|storySettingsService\.listProps/);
  assert.equal((serviceSource.match(/const nextImage = patchCurrentImage/g) ?? []).length, 3);
});

test("每次状态图生成都把 attemptId 贯穿 runtime 状态", () => {
  assert.match(runtimeSource, /attemptId/);
  assert.match(runtimeSource, /attemptFields/);
});
