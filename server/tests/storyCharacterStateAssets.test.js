const test = require("node:test");
const assert = require("node:assert/strict");

const {
  normalizeStoryCharacterStates,
} = require("../../shared/dist/types/novelReferenceExtraction.js");

test("旧角色没有状态时会形成带年龄、外貌和音色的初始状态", () => {
  const states = normalizeStoryCharacterStates([], {
    gender: "male",
    ageGroup: "youth",
    appearance: "黑色短发，左眉有疤",
    facePrompt: "清瘦脸型，冷峻五官",
    voiceTexture: "低沉清晰的青年男声",
  });

  assert.equal(states.length, 1);
  assert.equal(states[0].label, "初始状态");
  assert.equal(states[0].ageGroup, "youth");
  assert.equal(states[0].description, "黑色短发，左眉有疤");
  assert.match(states[0].imagePrompt, /清瘦脸型/);
  assert.equal(states[0].voicePrompt, "低沉清晰的青年男声");
  assert.equal(states[0].referenceStateId, null);
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
  assert.equal(states[1].referenceStateId, "s1");
});

test("明确不参考仍保留 null，缺省参考才继承上一状态", () => {
  const states = normalizeStoryCharacterStates([
    { id: "s1", label: "初始", description: "正常", imagePrompt: "正常" },
    { id: "s2", label: "换装", description: "制服", imagePrompt: "制服" },
    { id: "s3", label: "独立形象", description: "全新造型", imagePrompt: "全新造型", referenceStateId: null },
  ], {});

  assert.equal(states[1].referenceStateId, "s1");
  assert.equal(states[2].referenceStateId, null);
});
