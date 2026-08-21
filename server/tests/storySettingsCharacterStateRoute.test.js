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
const statePolicySource = fs.readFileSync(
  path.join(__dirname, "../src/modules/novel/story-settings/application/StorySettingsStatePolicy.ts"),
  "utf8",
);
const persistenceSource = fs.readFileSync(
  path.join(__dirname, "../src/modules/novel/story-settings/application/StorySettingsBundlePersistence.ts"),
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
  assert.match(statePolicySource, /normalizeStoryCharacterStates/);
  assert.match(serviceSource, /statesJson:\s*serializeStates/);
  assert.match(serviceSource, /isStoryAssetInitialStatePreserved/);
  assert.match(serviceSource, /canSafelyRewrite/);
  assert.match(serviceSource, /updateMany\(\{[\s\S]*statesJson: row\.statesJson/);
  assert.match(statePolicySource, /preserveStoryAssetRuntimeAssets/);
  assert.match(persistenceSource, /statesJson:\s*serializeStates\(normalizeCharacterStates\(undefined/);
});

test("场景和道具创建、列表与 AI 批量落库都会补齐初始状态", () => {
  assert.match(serviceSource, /normalizeSceneStates\(input\.states/);
  assert.match(serviceSource, /normalizePropStates\(input\.states/);
  assert.match(persistenceSource, /statesJson:\s*serializeStates\(normalizeSceneStates\(undefined/);
  assert.match(persistenceSource, /statesJson:\s*serializeStates\(normalizePropStates\(undefined/);
  assert.match(serviceSource, /normalizeSceneStates\(parseStates\(row\.statesJson\)/);
  assert.match(serviceSource, /normalizePropStates\(parseStates\(row\.statesJson\)/);
});

test("设定生成契约允许 AI 直接给出初始状态音色提示词", () => {
  const promptSource = fs.readFileSync(
    path.join(__dirname, "../src/prompting/prompts/novel/storySettings.prompts.ts"),
    "utf8",
  );
  assert.match(promptSource, /voicePrompt:\s*z\.string\(\)\.min\(2\)\.max\(160\)/);
  assert.match(persistenceSource, /voiceTexture:\s*character\.voicePrompt/);
});
