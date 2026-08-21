const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const adapterSource = fs.readFileSync(
  path.join(__dirname, "../src/services/adaptation/source/NovelSourceAdapter.ts"),
  "utf8",
);

test("改编内容源以角色初始状态作为年龄、视觉和音色来源", () => {
  assert.match(adapterSource, /parseStoryAssetStatesJson/);
  assert.match(adapterSource, /normalizeStoryCharacterStates/);
  assert.match(adapterSource, /ageGroup:\s*normalizeAgeGroup\(initialState\?\.ageGroup\)/);
  assert.match(adapterSource, /facePrompt:\s*stateImagePrompt/);
  assert.match(adapterSource, /voicePrompt:\s*stateVoicePrompt/);
});
