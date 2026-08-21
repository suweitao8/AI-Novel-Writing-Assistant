const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const adapterSource = fs.readFileSync(
  path.join(__dirname, "../src/services/adaptation/source/NovelSourceAdapter.ts"),
  "utf8",
);
const contextSource = fs.readFileSync(
  path.join(__dirname, "../src/services/drama/DramaContextAssembler.ts"),
  "utf8",
);
const keyframeSource = fs.readFileSync(
  path.join(__dirname, "../src/services/drama/visual/DramaShotKeyframeService.ts"),
  "utf8",
);

test("改编内容源以角色初始状态作为年龄、视觉和音色来源", () => {
  assert.match(adapterSource, /parseStoryAssetStatesJson/);
  assert.match(adapterSource, /normalizeStoryCharacterStates/);
  assert.match(adapterSource, /ageGroup:\s*normalizeAgeGroup\(initialState\?\.ageGroup\)/);
  assert.match(adapterSource, /facePrompt:\s*stateImagePrompt/);
  assert.match(adapterSource, /voicePrompt:\s*stateVoicePrompt/);
});

test("漫剧上下文读取角色时也会归一化缺失的初始状态", () => {
  assert.match(contextSource, /parseStoryAssetStatesJson/);
  assert.match(contextSource, /normalizeStoryCharacterStates\(\s*parseStoryAssetStatesJson/);
  assert.match(contextSource, /画面：/);
  assert.match(contextSource, /音色：/);
});

test("首帧生成读取场景和道具时以初始状态提示词为准", () => {
  assert.match(keyframeSource, /statesJson/);
  assert.match(keyframeSource, /normalizeStoryAssetStates/);
  assert.match(keyframeSource, /environmentPrompt:\s*initial\.imagePrompt/);
  assert.match(keyframeSource, /visualPrompt:\s*initial\.imagePrompt/);
});
