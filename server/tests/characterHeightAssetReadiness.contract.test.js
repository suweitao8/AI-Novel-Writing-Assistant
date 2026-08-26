const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..", "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("身高推断把角色默认状态资料合并为小说角色输入", () => {
  const service = require("../dist/services/drama/visual/CharacterHeightProfileService.js");
  assert.equal(typeof service.buildNovelCharacterHeightInput, "function");

  const input = service.buildNovelCharacterHeightInput({
    name: "小满",
    role: "",
    gender: "female",
    ageGroup: null,
    physique: null,
    appearance: null,
    personality: null,
    background: null,
    attireStyle: null,
    facePrompt: null,
    statesJson: JSON.stringify([{
      id: "initial",
      label: "默认",
      description: "娇小的少年，体态纤细，穿着宽大的校服",
      imagePrompt: "短黑发、圆脸、纤细身形、宽大校服",
      ageGroup: "child",
    }]),
  });

  assert.equal(input.ageGroup, "child");
  assert.match(input.appearance, /娇小的少年/);
  assert.match(input.facePrompt, /短黑发/);
});
test("默认状态资料变化会进入身高档案输入指纹", () => {
  const service = require("../dist/services/drama/visual/CharacterHeightProfileService.js");
  const base = {
    name: "角色",
    gender: "other",
    ageGroup: null,
    physique: null,
    appearance: null,
    statesJson: JSON.stringify([{
      id: "initial",
      label: "默认",
      description: "普通成年人",
      imagePrompt: "普通体型",
      ageGroup: "youth",
    }]),
  };
  const changed = { ...base, statesJson: base.statesJson.replace("普通成年人", "高大的成年人") };
  const baseInput = service.buildNovelCharacterHeightInput(base);
  const changedInput = service.buildNovelCharacterHeightInput(changed);
  assert.notEqual(
    service.buildCharacterHeightInputFingerprint(baseInput),
    service.buildCharacterHeightInputFingerprint(changedInput),
  );
});

test("角色资产边界负责补齐身高档案，而不是只有 3D blocking 才触发", () => {
  const serviceSource = read("server/src/modules/novel/story-settings/application/StorySettingsService.ts");
  assert.match(serviceSource, /ensureNovelCharacterHeightProfiles/);
  assert.match(serviceSource, /async listCharacters[\s\S]*ensureNovelCharacterHeightProfiles/);
  assert.match(serviceSource, /async createCharacter[\s\S]*ensureNovelCharacterHeightProfiles/);
  assert.match(serviceSource, /async updateCharacter[\s\S]*ensureNovelCharacterHeightProfiles/);
});

test("提取应用把年龄段、外貌和图片提示词写入默认状态，不要求手工身高", () => {
  const dialogSource = read("client/src/pages/drama/comicDrama/components/ExtractApplyDialog.tsx");
  const heightSource = read("server/src/services/drama/visual/CharacterHeightProfileService.ts");
  assert.match(dialogSource, /ageGroup: character\?\.ageGroup/);
  assert.match(dialogSource, /description,/);
  assert.match(dialogSource, /imagePrompt,/);
  assert.doesNotMatch(dialogSource, /heightMeters|heightProfile/);
  assert.doesNotMatch(heightSource, /heightMeters\s*:\s*character\?\./);
});
