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
const sharedStateSource = fs.readFileSync(
  path.join(__dirname, "../../shared/types/novelReferenceExtraction.ts"),
  "utf8",
);
const novelCoreCharacterSource = fs.readFileSync(
  path.join(__dirname, "../src/services/novel/novelCore/novelCoreCharacterService.ts"),
  "utf8",
);
const characterLibrarySource = fs.readFileSync(
  path.join(__dirname, "../src/services/character/CharacterLibrarySyncService.ts"),
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

test("角色创建和批量落库把姓名交给默认初始状态工厂", () => {
  assert.match(sharedStateSource, /createStoryCharacterInitialState/);
  assert.match(serviceSource, /name:\s*input\.name/);
  assert.match(serviceSource, /name:\s*input\.name\s*!==\s*undefined\s*\?\s*input\.name\s*:\s*row\.name/);
  assert.match(persistenceSource, /normalizeCharacterStates\(undefined,\s*\{[\s\S]*name:\s*character\.name/);
});

test("小说核心创建和角色库导入也会直接落库默认初始状态", () => {
  assert.match(novelCoreCharacterSource, /createStoryCharacterInitialState/);
  assert.match(novelCoreCharacterSource, /statesJson:\s*JSON\.stringify\(\[createStoryCharacterInitialState/);
  assert.match(characterLibrarySource, /createStoryCharacterInitialState/);
  assert.match(characterLibrarySource, /statesJson:\s*JSON\.stringify\(\[createStoryCharacterInitialState/);
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
