const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createStoryAssetInitialState,
  createStoryCharacterInitialState,
  normalizeStoryCharacterStates,
  normalizeStoryAssetStates,
  parseStoryAssetStatesJson,
  resolveStoryAssetStateAncestors,
  resolveStoryAssetStateReferenceId,
  isCharacterInitialStatePreserved,
  validateStoryAssetStateList,
} = require("../../shared/dist/types/novelReferenceExtraction.js");
const { normalizeSceneStates } = require("../dist/modules/novel/story-settings/application/StorySettingsStatePolicy.js");

test("手动角色没有外貌字段时也会生成有内容的初始状态", () => {
  const state = createStoryCharacterInitialState({ name: "叶晨", gender: "male" });
  assert.equal(state.id, "initial");
  assert.equal(state.label, "默认");
  assert.equal(state.ageGroup, "youth");
  assert.match(state.description, /叶晨/);
  assert.match(state.description, /青年/);
  assert.match(state.description, /男性/);
  assert.ok(state.imagePrompt.trim());
  assert.ok(state.voicePrompt?.trim());
  assert.equal(state.referenceStateId, null);
});

test("角色已有外貌和音色时默认初始状态优先保留用户字段", () => {
  const state = createStoryCharacterInitialState({
    name: "叶晨",
    gender: "male",
    ageGroup: "middle",
    appearance: "黑色短发，左眉有疤",
    facePrompt: "清瘦脸型",
    voiceTexture: "低沉清晰的男声",
  });
  assert.equal(state.ageGroup, "middle");
  assert.match(state.description, /黑色短发/);
  assert.match(state.imagePrompt, /清瘦脸型/);
  assert.equal(state.voicePrompt, "低沉清晰的男声");
});

test("角色归一化没有状态时会把姓名写入默认初始描述", () => {
  const states = normalizeStoryCharacterStates([], { name: "叶晨", gender: "female" });
  assert.equal(states.length, 1);
  assert.match(states[0].description, /叶晨/);
  assert.match(states[0].description, /女性/);
  assert.match(states[0].description, /青年/);
});

test("旧角色没有状态时会形成带年龄、外貌和音色的初始状态", () => {
  const states = normalizeStoryCharacterStates([], {
    gender: "male",
    ageGroup: "youth",
    appearance: "黑色短发，左眉有疤",
    facePrompt: "清瘦脸型，冷峻五官",
    voiceTexture: "低沉清晰的青年男声",
  });

  assert.equal(states.length, 1);
  assert.equal(states[0].label, "默认");
  assert.equal(states[0].ageGroup, "youth");
  assert.equal(states[0].description, "黑色短发，左眉有疤");
  assert.match(states[0].imagePrompt, /男性/);
  assert.match(states[0].imagePrompt, /清瘦脸型/);
  assert.equal(states[0].voicePrompt, "低沉清晰的青年男声");
  assert.equal(states[0].referenceStateId, null);
});

test("场景和道具没有状态时会形成可直接生成的初始状态", () => {
  const scene = normalizeStoryAssetStates([], {
    description: "停电后的旧车站",
    imagePrompt: "冷白月光照进空荡站台",
  });
  const prop = normalizeStoryAssetStates([], {
    description: "一枚磨损的黄铜怀表",
  });

  assert.deepEqual(scene, [{
    id: "initial",
    label: "默认",
    description: "停电后的旧车站",
    imagePrompt: "冷白月光照进空荡站台",
    referenceStateId: null,
  }]);
  assert.equal(prop[0].id, "initial");
  assert.equal(prop[0].label, "默认");
  assert.equal(prop[0].description, "一枚磨损的黄铜怀表");
  assert.equal(prop[0].imagePrompt, "一枚磨损的黄铜怀表");
  assert.equal(createStoryAssetInitialState({ imagePrompt: "" }).referenceStateId, null);
});

test("场景旧顶层字段会进入初始状态，已有状态只补缺失值", () => {
  const initial = normalizeSceneStates([], {
    name: "旧车站",
    summary: "停电后的站台",
    environmentPrompt: "冷白月光照进空荡站台",
    sceneType: "exterior",
    timeOfDay: "night",
    weather: "rainy",
  })[0];
  assert.equal(initial.sceneType, "exterior");
  assert.equal(initial.timeOfDay, "night");
  assert.equal(initial.weather, "rainy");

  const preserved = normalizeSceneStates([{
    id: "initial",
    label: "自定义初始",
    description: "白天的站台",
    imagePrompt: "明亮站台",
    sceneType: "interior",
  }], {
    name: "旧车站",
    sceneType: "exterior",
    timeOfDay: "night",
    weather: "rainy",
  })[0];
  assert.equal(preserved.sceneType, "interior");
  assert.equal(preserved.timeOfDay, "night");
  assert.equal(preserved.weather, "rainy");
});

test("已有状态只补缺省字段，不覆盖人工提示词与已生成资产", () => {
  const originalImage = { status: "done", url: "/state/s1" };
  const originalVoice = {
    status: "done",
    mode: "generate_new",
    sampleAudioUrl: "data:audio/s1",
  };
  const states = normalizeStoryCharacterStates([
    {
      id: "s1",
      label: "初始",
      description: "正常状态",
      imagePrompt: "自定义初始画面",
      image: originalImage,
      voice: originalVoice,
    },
    {
      id: "s2",
      label: "受伤",
      description: "左臂受伤",
      imagePrompt: "自定义受伤画面",
    },
  ], {
    gender: "female",
    ageGroup: "youth",
    appearance: "旧外貌不应覆盖状态",
    voiceTexture: "旧音色不应覆盖状态",
  });

  assert.equal(states[0].ageGroup, "youth");
  assert.equal(states[1].ageGroup, "youth");
  assert.equal(states[0].imagePrompt, "自定义初始画面");
  assert.equal(states[1].imagePrompt, "自定义受伤画面");
  assert.deepEqual(states[0].image, originalImage);
  assert.deepEqual(states[0].voice, originalVoice);
  // 缺席 referenceStateId 不落键：状态图侧解析为不参考，音色链按缺省上一状态继承。
  assert.equal(states[1].referenceStateId, undefined);
});

test("缺省参考＝全新生成，仅显式选择才引用指定状态", () => {
  const states = normalizeStoryCharacterStates([
    { id: "s1", label: "初始", description: "正常", imagePrompt: "正常" },
    { id: "s2", label: "换装", description: "制服", imagePrompt: "制服" },
    { id: "s3", label: "独立形象", description: "全新造型", imagePrompt: "全新造型", referenceStateId: null },
  ], {});

  // s2 缺席字段＝缺省（状态图全新生成；音色链隐式继承）；s3 显式取消。
  assert.equal(resolveStoryAssetStateReferenceId(states, states[1]), null);
  assert.equal(states[1].referenceStateId, undefined);
  assert.equal(states[2].referenceStateId, null);
});

test("损坏或含非法条目的状态 JSON 不允许自动回写", () => {
  assert.equal(parseStoryAssetStatesJson("{bad json").canSafelyRewrite, false);
  assert.equal(parseStoryAssetStatesJson(JSON.stringify({ id: "s1" })).canSafelyRewrite, false);
  assert.equal(parseStoryAssetStatesJson(JSON.stringify([
    { id: "s1", label: "初始", description: "正常", imagePrompt: "正常" },
    { id: 3, label: "非法" },
  ])).canSafelyRewrite, false);
  assert.equal(parseStoryAssetStatesJson(JSON.stringify([
    { id: "s1", label: "初始", description: "正常", imagePrompt: "正常" },
    { id: "s1", label: "重复", description: "重复", imagePrompt: "重复" },
  ])).canSafelyRewrite, false);
  assert.doesNotThrow(() => parseStoryAssetStatesJson(JSON.stringify([
    { id: "s1", label: "初始", description: 42, imagePrompt: "正常" },
    { id: "s2", label: "换装", description: "制服", imagePrompt: "制服", image: { status: "done", url: 7 } },
  ])));
  assert.equal(parseStoryAssetStatesJson(JSON.stringify([
    { id: "s1", label: "初始", description: 42, imagePrompt: "正常" },
  ])).canSafelyRewrite, false);
  assert.equal(parseStoryAssetStatesJson(JSON.stringify([
    { id: "s1", label: "初始", description: "正常", imagePrompt: "正常", referenceStateId: "missing" },
  ])).canSafelyRewrite, false);
});

test("状态列表拒绝重复 ID 和悬空参考，避免写入不可解析的状态链", () => {
  assert.match(validateStoryAssetStateList([
    { id: "s1", referenceStateId: null },
    { id: "s1", referenceStateId: null },
  ]) ?? "", /重复/);
  assert.match(validateStoryAssetStateList([
    { id: "s1", referenceStateId: null },
    { id: "s2", referenceStateId: "missing" },
  ]) ?? "", /不存在/);
  assert.equal(validateStoryAssetStateList([
    { id: "s1", referenceStateId: null },
    { id: "s2", referenceStateId: "s1" },
  ]), null);
  assert.match(validateStoryAssetStateList([
    { id: "s1", referenceStateId: "s2" },
    { id: "s2", referenceStateId: null },
  ]) ?? "", /初始状态/);
});

test("不存在的参考状态会被清理，避免生成链指向悬空状态", () => {
  const states = normalizeStoryAssetStates([
    { id: "s1", label: "初始", description: "正常", imagePrompt: "正常" },
    { id: "s2", label: "换装", description: "制服", imagePrompt: "制服", referenceStateId: "missing" },
  ]);

  assert.equal(states[1].referenceStateId, null);
});

test("状态资产继承沿显式参考链向前找祖先；缺省参考不再隐式继承", () => {
  // 显式链：s3→s2→s1。
  const chained = normalizeStoryCharacterStates([
    { id: "s1", label: "初始", description: "正常", imagePrompt: "正常" },
    { id: "s2", label: "受伤", description: "轻伤", imagePrompt: "绷带", referenceStateId: "s1" },
    { id: "s3", label: "重伤", description: "重伤", imagePrompt: "更多绷带", referenceStateId: "s2" },
  ], {});
  assert.deepEqual(resolveStoryAssetStateAncestors(chained, "s3").map((state) => state.id), ["s2", "s1"]);
  // 缺省参考＝全新生成（2026-08-27 用户要求）：没有显式链接就没有祖先。
  const independent = normalizeStoryCharacterStates([
    { id: "s1", label: "初始", description: "正常", imagePrompt: "正常" },
    { id: "s2", label: "受伤", description: "轻伤", imagePrompt: "绷带" },
    { id: "s3", label: "重伤", description: "重伤", imagePrompt: "更多绷带" },
  ], {});
  assert.deepEqual(resolveStoryAssetStateAncestors(independent, "s3"), []);
});

test("角色更新必须保留首个初始状态", () => {
  const previous = [{ id: "initial", label: "初始状态", description: "青年", imagePrompt: "青年" }];
  assert.equal(isCharacterInitialStatePreserved(previous, previous), true);
  assert.equal(isCharacterInitialStatePreserved(previous, [{ id: "next", label: "重伤", description: "重伤", imagePrompt: "重伤" }]), false);
  assert.equal(isCharacterInitialStatePreserved(previous, [{ id: "next", label: "重伤", description: "重伤", imagePrompt: "重伤" }, ...previous]), false);
});
