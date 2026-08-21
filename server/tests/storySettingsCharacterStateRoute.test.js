const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const routeSource = fs.readFileSync(
  path.join(__dirname, "../src/modules/novel/story-settings/http/storySettingsRoutes.ts"),
  "utf8",
);
const serviceSource = fs.readFileSync(
  path.join(__dirname, "../src/modules/novel/story-settings/application/StorySettingsService.ts"),
  "utf8",
);

test("角色状态请求契约允许年龄段并保留状态资产字段", () => {
  assert.match(routeSource, /const assetStateSchema = z\.object\(\{/);
  assert.match(routeSource, /ageGroup:\s*z\.enum\(\["child", "youth", "middle", "elder"\]\)\.optional\(\)/);
  assert.match(routeSource, /const characterAssetStateSchema = assetStateSchema\.extend\(/);
  assert.match(routeSource, /imagePrompt:\s*z\.string\(\)\.trim\(\)\.max\(600\)\.optional\(\)/);
  assert.match(routeSource, /states:\s*z\.array\(characterAssetStateSchema\)\.max\(24\)\.optional\(\)/);
});

test("角色服务以状态归一化结果作为角色状态来源", () => {
  assert.match(serviceSource, /normalizeStoryCharacterStates/);
  assert.match(serviceSource, /statesJson:\s*serializeStates/);
  assert.match(serviceSource, /isCharacterInitialStatePreserved/);
  assert.match(serviceSource, /canSafelyRewrite/);
  assert.match(serviceSource, /statesJson:\s*serializeStates\(normalizeStoryCharacterStates\(undefined/);
});
