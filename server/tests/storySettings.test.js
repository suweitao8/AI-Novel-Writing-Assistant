const test = require("node:test");
const assert = require("node:assert/strict");

test("story settings prompt asset is registered", () => {
  const { hasRegisteredPromptAsset } = require("../dist/prompting/registry.js");
  assert.equal(hasRegisteredPromptAsset("novel.story_settings.bundle", "v1"), true);
});

test("story settings bundle schema accepts a valid bundle", () => {
  const { storySettingsBundlePrompt } = require("../dist/prompting/prompts/novel/storySettings.prompts.js");
  const bundle = {
    characters: [
      { name: "林月", role: "主角", personality: "外冷内热，行动果断", appearance: "短发，深色风衣", voicePrompt: "清晰克制的青年女声", background: "前刑警，因一桩旧案离职" },
    ],
    scenes: [
      { name: "废弃地铁站", summary: "冷白灯管，滴水声", significance: "第一幕冲突爆发地", mapLocationName: "旧城地铁站" },
    ],
    props: [
      { name: "外婆的怀表", description: "黄铜外壳，停在两点", plotFunction: "结局关键证物", ownerCharacterName: "林月", importance: "core", firstAppearHint: "开篇随身物" },
    ],
    world: {
      premise: "近未来城市，记忆可以被交易",
      era: "近未来",
      toneRules: ["低魔", "能力有代价"],
      keySettings: [
        { title: "记忆交易规则", content: "每笔交易都会失去一段等价记忆" },
        { title: "交易禁区", content: "警方封锁的记忆黑市" },
      ],
      mapLocations: [
        { id: "loc_1", name: "旧城地铁站", kind: "building", summary: "废弃枢纽" },
        { id: "loc_2", name: "市中心", kind: "city", summary: "霓虹与雨" },
      ],
      mapEdges: [
        { fromId: "loc_1", toId: "loc_2", label: "地铁残线" },
      ],
    },
  };
  const parsed = storySettingsBundlePrompt.outputSchema.parse(bundle);
  assert.equal(parsed.characters.length, 1);
  assert.equal(parsed.characters[0].voicePrompt, "清晰克制的青年女声");

  const validated = storySettingsBundlePrompt.postValidate(
    parsed,
    { novelTitle: "测试", originalIdea: "想法", narrativeForm: "short_story" },
    {},
  );
  assert.equal(validated.world.mapLocations.length, 2);
});

test("story settings bundle validation rejects scene pointing to missing map location", () => {
  const { storySettingsBundlePrompt } = require("../dist/prompting/prompts/novel/storySettings.prompts.js");
  const bundle = {
    characters: [
      { name: "林月", role: "主角", personality: "外冷内热，行动果断" },
    ],
    scenes: [
      { name: "废弃地铁站", summary: "冷白灯管", significance: "冲突爆发地", mapLocationName: "不存在的地点" },
    ],
    props: [
      { name: "怀表", description: "黄铜外壳", plotFunction: "关键证物", importance: "core" },
    ],
    world: {
      premise: "近未来城市，记忆可以被交易",
      era: "近未来",
      toneRules: ["低魔"],
      keySettings: [
        { title: "记忆交易规则", content: "每笔交易都会失去一段等价记忆" },
        { title: "交易禁区", content: "警方封锁的记忆黑市" },
      ],
      mapLocations: [
        { id: "loc_1", name: "旧城地铁站", kind: "building", summary: "废弃枢纽" },
        { id: "loc_2", name: "市中心", kind: "city", summary: "霓虹与雨" },
      ],
      mapEdges: [],
    },
  };
  const parsed = storySettingsBundlePrompt.outputSchema.parse(bundle);
  assert.throws(
    () => storySettingsBundlePrompt.postValidate(parsed, { novelTitle: "测试", originalIdea: "想法", narrativeForm: "short_story" }, {}),
    /地图地点不存在/,
  );
});

test("story settings prompt text renders all sections and guards empty snapshot", () => {
  const { buildStorySettingsPromptText } = require("../dist/modules/novel/story-settings/application/storySettingsPromptText.js");
  assert.equal(buildStorySettingsPromptText(null), "");
  const text = buildStorySettingsPromptText({
    characters: [{ name: "林月", role: "主角", personality: "外冷内热" }],
    scenes: [{ name: "废弃地铁站", summary: "冷白灯管", significance: "冲突爆发地" }],
    props: [{ name: "怀表", description: "黄铜外壳", plotFunction: "关键证物", importance: "core" }],
    world: {
      premise: "近未来城市",
      era: "近未来",
      toneRules: ["低魔"],
      keySettings: [{ title: "记忆交易规则", content: "每笔交易都会失去等价记忆" }],
      locationNames: ["旧城地铁站", "市中心"],
    },
  });
  assert.match(text, /【角色】/);
  assert.match(text, /【场景】/);
  assert.match(text, /【关键道具】/);
  assert.match(text, /【世界观】/);
  assert.match(text, /不得推翻设定/);
});

test("workflow stage and checkpoint maps cover settings gate", () => {
  const {
    NOVEL_WORKFLOW_STAGE_LABELS,
    NOVEL_WORKFLOW_STAGE_PROGRESS,
  } = require("../dist/services/novel/workflow/novelWorkflow.shared.js");
  assert.equal(NOVEL_WORKFLOW_STAGE_LABELS.short_story_settings, "生成设定");
  assert.equal(typeof NOVEL_WORKFLOW_STAGE_PROGRESS.short_story_settings, "number");
});

test("story entity generate prompt asset is registered", () => {
  const { hasRegisteredPromptAsset } = require("../dist/prompting/registry.js");
  assert.equal(hasRegisteredPromptAsset("novel.story_settings.entity.generate", "v1"), true);
});

test("entity generate validation rejects drafts that fill more than the requested type", () => {
  const { storyEntityGeneratePrompt } = require("../dist/prompting/prompts/novel/storySettings.prompts.js");
  const draft = {
    character: {
      name: "陈默",
      role: "主角",
      gender: "male",
      ageGroup: "youth",
      physique: "高瘦",
      personality: "话少但可靠",
      appearance: "戴黑框眼镜",
      attireStyle: "洗旧的连帽衫",
      facePrompt: "男性，二十多岁，黑色短发，单眼皮，浅麦肤色，长脸",
      background: "男大学生，物理系",
    },
    scene: null,
    prop: null,
  };
  const input = { novelTitle: "测试", entityType: "scene", hint: "便利店" };
  const validated = storyEntityGeneratePrompt.outputSchema.parse(draft);
  assert.throws(
    () => storyEntityGeneratePrompt.postValidate(validated, input, {}),
    /请求的是场景，但草稿里没有场景/,
  );

  const characterInput = { novelTitle: "测试", entityType: "character", hint: "男大学生" };
  assert.equal(storyEntityGeneratePrompt.postValidate(validated, characterInput, {}).character.name, "陈默");

  const duplicateInput = {
    novelTitle: "测试",
    entityType: "character",
    hint: "男大学生",
    existingCharacters: ["陈默（主角）"],
  };
  assert.throws(
    () => storyEntityGeneratePrompt.postValidate(validated, duplicateInput, {}),
    /与已有角色重复/,
  );
});
