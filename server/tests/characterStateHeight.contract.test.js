const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..", "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("角色状态 JSON 保留 0.50 到 10.00 米身高并过滤越界值", () => {
  const shared = require("../../shared/dist/types/novelReferenceExtraction.js");
  const valid = shared.parseStoryAssetStatesJson(JSON.stringify([{
    id: "initial",
    label: "默认",
    description: "青年男性",
    imagePrompt: "青年男性",
    heightMeters: 1.75,
  }]));
  assert.equal(valid.states[0].heightMeters, 1.75);

  const monster = shared.parseStoryAssetStatesJson(JSON.stringify([{
    id: "initial",
    label: "默认",
    description: "血角兽",
    imagePrompt: "血角兽",
    heightMeters: 5,
  }]));
  assert.equal(monster.states[0].heightMeters, 5);

  const lowerBoundary = shared.parseStoryAssetStatesJson(JSON.stringify([{
    id: "initial",
    label: "默认",
    description: "微型生物",
    imagePrompt: "微型生物",
    heightMeters: 0.5,
  }]));
  assert.equal(lowerBoundary.states[0].heightMeters, 0.5);

  const upperBoundary = shared.parseStoryAssetStatesJson(JSON.stringify([{
    id: "initial",
    label: "默认",
    description: "巨型生物",
    imagePrompt: "巨型生物",
    heightMeters: 10,
  }]));
  assert.equal(upperBoundary.states[0].heightMeters, 10);

  const invalid = shared.parseStoryAssetStatesJson(JSON.stringify([{
    id: "initial",
    label: "默认",
    description: "青年男性",
    imagePrompt: "青年男性",
    heightMeters: 10.01,
  }]));
  assert.equal(invalid.states[0].heightMeters, undefined);
  assert.equal(invalid.canSafelyRewrite, false);

  const invalidLower = shared.parseStoryAssetStatesJson(JSON.stringify([{
    id: "initial",
    label: "默认",
    description: "越界",
    imagePrompt: "越界",
    heightMeters: 0.49,
  }]));
  assert.equal(invalidLower.states[0].heightMeters, undefined);
  assert.equal(invalidLower.canSafelyRewrite, false);
});

test("角色状态 schema 接受身高但场景和道具 schema 不共享角色字段", () => {
  const routes = read("server/src/modules/novel/story-settings/http/storySettingsRoutes.ts");
  assert.match(routes, /characterAssetStateSchema = assetStateSchema\.extend\(\{[\s\S]*heightMeters: z\.number\(\)[\s\S]*STORY_ASSET_CHARACTER_HEIGHT_MIN_METERS[\s\S]*STORY_ASSET_CHARACTER_HEIGHT_MAX_METERS/);
  const baseSchema = routes.match(/const assetStateSchema = z\.object\(\{[\s\S]*?\n\}\)\.strict\(\);/);
  assert.ok(baseSchema);
  assert.doesNotMatch(baseSchema[0], /heightMeters:/);
});

test("设定中心保存状态时保留身高并拒绝越界值", () => {
  const policy = require("../dist/modules/novel/story-settings/application/StorySettingsStatePolicy.js");
  const saved = policy.serializeStates([{
    id: "initial",
    label: "默认",
    description: "青年男性",
    imagePrompt: "青年男性",
    heightMeters: 1.75,
  }]);
  assert.equal(JSON.parse(saved)[0].heightMeters, 1.75);
  assert.throws(() => policy.serializeStates([{
    id: "initial",
    label: "默认",
    description: "青年男性",
    imagePrompt: "青年男性",
    heightMeters: 10.01,
  }]), /身高/);
});
