const test = require("node:test");
const assert = require("node:assert/strict");

const {
  StoryAssetStateVoiceService,
  getDefaultStateVoiceMode,
  resolvePreviousStateVoice,
  buildStateVoiceSynthesisInput,
} = require("../dist/modules/novel/story-settings/application/StoryAssetStateVoiceService.js");

test("状态音色默认沿用上一状态，首状态默认生成新音色", () => {
  assert.equal(getDefaultStateVoiceMode([], "s1"), "generate_new");
  assert.equal(getDefaultStateVoiceMode([{ id: "s1" }, { id: "s2" }], "s2"), "reuse_previous");
});

test("沿用音色只接受上一状态已完成试听", () => {
  const states = [
    { id: "s1", voice: { status: "done", mode: "generate_new", sampleAudioUrl: "data:audio/s1" } },
    { id: "s2" },
  ];
  assert.deepEqual(resolvePreviousStateVoice(states, "s2"), { stateId: "s1", sampleAudioUrl: "data:audio/s1" });
  assert.equal(resolvePreviousStateVoice([{ id: "s1" }, { id: "s2" }], "s2"), null);
});

test("多级状态复用音色时会找到最近可用的祖先试听", () => {
  const states = [
    { id: "s1", label: "初始", voice: { status: "done", mode: "generate_new", sampleAudioUrl: "data:audio/s1" } },
    { id: "s2", label: "受伤" },
    { id: "s3", label: "重伤" },
  ];
  assert.deepEqual(resolvePreviousStateVoice(states, "s3"), { stateId: "s1", sampleAudioUrl: "data:audio/s1" });
});

test("生成新音色优先使用状态提示词并传递角色名", () => {
  assert.deepEqual(buildStateVoiceSynthesisInput({ name: "林澈", voiceTexture: "基础低沉" }, {
    id: "s2", voicePrompt: "老年沙哑", description: "白发",
  }), {
    text: "这是当前音色的试听效果，一句话就能听出年龄、语气和节奏。",
    audioType: "dialogue",
    speaker: "林澈",
    emotion: "老年沙哑",
  });
  assert.equal(buildStateVoiceSynthesisInput({ name: "林澈", voiceTexture: "基础低沉" }, {
    id: "s2", description: "白发",
  }).emotion, "基础低沉");
});

test("生成新音色会沿用上一状态的音色描述", async () => {
  let statesJson = JSON.stringify([
    {
      id: "s1",
      label: "初始状态",
      description: "青年",
      imagePrompt: "青年",
      voicePrompt: "清亮的青年男声",
    },
    {
      id: "s2",
      label: "受伤",
      description: "战斗后受伤",
      imagePrompt: "缠着绷带",
    },
  ]);
  const calls = [];
  const service = new StoryAssetStateVoiceService({
    findCharacter: async () => ({
      id: "c1",
      novelId: "n1",
      name: "林澈",
      voiceTexture: null,
      statesJson,
    }),
    updateStates: async (_characterId, nextStatesJson) => { statesJson = nextStatesJson; },
    listCharacters: async () => [{
      id: "c1",
      name: "林澈",
      gender: null,
      ageGroup: null,
      physique: null,
      attireStyle: null,
      facePrompt: null,
      voiceTexture: null,
      personality: null,
      appearance: null,
      background: null,
      states: JSON.parse(statesJson),
      updatedAt: new Date().toISOString(),
    }],
    synthesize: async (input) => {
      calls.push(input);
      return {
        audioDataBase64: "YQ==",
        contentType: "audio/mpeg",
        byteLength: 1,
        dataUrl: "data:audio/mpeg;base64,YQ==",
      };
    },
  });

  await service.generateStateVoice("n1", "c1", "s2", "generate_new");

  assert.equal(calls[0].emotion, "清亮的青年男声");
});

test("生成新音色只更新目标状态并保留已有图片", async () => {
  let statesJson = JSON.stringify([
    {
      id: "s1",
      label: "初始",
      description: "正常",
      imagePrompt: "正面",
      image: { status: "done", url: "/state/s1" },
    },
    {
      id: "s2",
      label: "老年",
      description: "白发",
      imagePrompt: "白发",
      image: { status: "done", url: "/state/s2" },
      voicePrompt: "年迈沙哑",
    },
  ]);
  const calls = [];
  const service = new StoryAssetStateVoiceService({
    findCharacter: async () => ({
      id: "c1",
      novelId: "n1",
      name: "林澈",
      voiceTexture: "清晰低沉",
      statesJson,
    }),
    updateStates: async (_characterId, nextStatesJson) => {
      statesJson = nextStatesJson;
    },
    listCharacters: async () => [{
      id: "c1",
      name: "林澈",
      gender: null,
      ageGroup: null,
      physique: null,
      attireStyle: null,
      facePrompt: null,
      voiceTexture: "清晰低沉",
      personality: null,
      appearance: null,
      background: null,
      states: JSON.parse(statesJson),
      updatedAt: new Date().toISOString(),
    }],
    synthesize: async (input) => {
      calls.push(input);
      return {
        audioDataBase64: "YQ==",
        contentType: "audio/mpeg",
        byteLength: 1,
        dataUrl: "data:audio/mpeg;base64,YQ==",
      };
    },
  });

  await service.generateStateVoice("n1", "c1", "s2", "generate_new");

  const savedStates = JSON.parse(statesJson);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].emotion, "年迈沙哑");
  assert.equal(savedStates[0].image.url, "/state/s1");
  assert.equal(savedStates[1].image.url, "/state/s2");
  assert.equal(savedStates[1].voice.status, "done");
  assert.equal(savedStates[1].voice.sampleAudioUrl, "data:audio/mpeg;base64,YQ==");
});

test("复用上一状态音色不调用合成服务", async () => {
  let statesJson = JSON.stringify([
    {
      id: "s1",
      label: "初始",
      description: "正常",
      imagePrompt: "正面",
      voice: { status: "done", mode: "generate_new", sampleAudioUrl: "data:audio/s1", prompt: "青年清亮" },
    },
    { id: "s2", label: "换装", description: "制服", imagePrompt: "制服" },
  ]);
  let synthesizeCalls = 0;
  const service = new StoryAssetStateVoiceService({
    findCharacter: async () => ({ id: "c1", novelId: "n1", name: "林澈", voiceTexture: null, statesJson }),
    updateStates: async (_characterId, nextStatesJson) => { statesJson = nextStatesJson; },
    listCharacters: async () => [{
      id: "c1",
      name: "林澈",
      gender: null,
      ageGroup: null,
      physique: null,
      attireStyle: null,
      facePrompt: null,
      voiceTexture: null,
      personality: null,
      appearance: null,
      background: null,
      states: JSON.parse(statesJson),
      updatedAt: new Date().toISOString(),
    }],
    synthesize: async () => {
      synthesizeCalls += 1;
      throw new Error("不应调用合成");
    },
  });

  await service.generateStateVoice("n1", "c1", "s2", "reuse_previous");

  const savedStates = JSON.parse(statesJson);
  assert.equal(synthesizeCalls, 0);
  assert.equal(savedStates[1].voice.sourceStateId, "s1");
  assert.equal(savedStates[1].voice.sampleAudioUrl, "data:audio/s1");
  assert.equal(savedStates[1].voice.mode, "reuse_previous");
});

test("选取音色：显式指定来源状态，不按参考链取上一状态", async () => {
  let statesJson = JSON.stringify([
    {
      id: "s1",
      label: "初始",
      description: "正常",
      imagePrompt: "正面",
      voice: { status: "done", mode: "generate_new", sampleAudioUrl: "data:audio/s1", prompt: "青年清亮" },
    },
    { id: "s2", label: "换装", description: "制服", imagePrompt: "制服" },
    {
      id: "s3",
      label: "受伤",
      description: "左臂受伤",
      imagePrompt: "受伤",
      // 参考链上一状态（s2）没有音色；选取时显式跳过它取 s1
      voice: { status: "done", mode: "generate_new", sampleAudioUrl: "data:audio/s3old", prompt: "旧音色" },
    },
    { id: "s4", label: "重伤", description: "重伤卧床", imagePrompt: "重伤" },
  ]);
  let synthesizeCalls = 0;
  const service = new StoryAssetStateVoiceService({
    findCharacter: async () => ({ id: "c1", novelId: "n1", name: "林澈", voiceTexture: null, statesJson }),
    updateStates: async (_characterId, nextStatesJson) => { statesJson = nextStatesJson; },
    listCharacters: async () => [{
      id: "c1",
      name: "林澈",
      gender: null,
      ageGroup: null,
      physique: null,
      attireStyle: null,
      facePrompt: null,
      voiceTexture: null,
      personality: null,
      appearance: null,
      background: null,
      states: JSON.parse(statesJson),
      updatedAt: new Date().toISOString(),
    }],
    synthesize: async () => {
      synthesizeCalls += 1;
      throw new Error("不应调用合成");
    },
  });

  await service.generateStateVoice("n1", "c1", "s4", "reuse_previous", "s1");

  const savedStates = JSON.parse(statesJson);
  assert.equal(synthesizeCalls, 0);
  assert.equal(savedStates[3].voice.sourceStateId, "s1");
  assert.equal(savedStates[3].voice.sampleAudioUrl, "data:audio/s1");
  assert.equal(savedStates[3].voice.mode, "reuse_previous");

  // 选取自己 → 400
  await assert.rejects(
    () => service.generateStateVoice("n1", "c1", "s4", "reuse_previous", "s4"),
    /不能选取当前状态/,
  );

  // 选取还没有音色的状态 → 明确报错
  await assert.rejects(
    () => service.generateStateVoice("n1", "c1", "s4", "reuse_previous", "s2"),
    /还没有已生成的音色/,
  );
});

test("音色描述为空时按角色形象 AI 估算兜底，不回填状态表单", async () => {
  let statesJson = JSON.stringify([
    { id: "s1", label: "初始状态", description: "青年", imagePrompt: "青年" },
  ]);
  const calls = [];
  const estimates = [];
  const service = new StoryAssetStateVoiceService({
    findCharacter: async () => ({
      id: "c1",
      novelId: "n1",
      name: "林澈",
      voiceTexture: null,
      statesJson,
      gender: "male",
      ageGroup: "youth",
      facePrompt: "青年男性大学生，清爽短发",
    }),
    updateStates: async (_characterId, nextStatesJson) => { statesJson = nextStatesJson; },
    listCharacters: async () => [{
      id: "c1",
      name: "林澈",
      gender: "male",
      ageGroup: "youth",
      physique: null,
      attireStyle: null,
      facePrompt: null,
      voiceTexture: null,
      personality: null,
      appearance: null,
      background: null,
      states: JSON.parse(statesJson),
      updatedAt: new Date().toISOString(),
    }],
    synthesize: async (input) => {
      calls.push(input);
      return {
        audioDataBase64: "YQ==",
        contentType: "audio/mpeg",
        byteLength: 1,
        dataUrl: "data:audio/mpeg;base64,YQ==",
      };
    },
    estimateVoiceProfile: async (character, state) => {
      estimates.push({ character, state });
      return "青年男性，嗓音清亮干净，语速平缓，像身边同学自然说话";
    },
  });

  await service.generateStateVoice("n1", "c1", "s1", "generate_new");

  // 估算依据带上了角色形象档案。
  assert.equal(estimates.length, 1);
  assert.equal(estimates[0].character.facePrompt, "青年男性大学生，清爽短发");
  assert.equal(estimates[0].state.label, "初始状态");
  // 合成与落库都用估算出的描述。
  assert.match(calls[0].emotion, /青年男性，嗓音清亮干净/);
  const saved = JSON.parse(statesJson);
  assert.equal(saved[0].voice.status, "done");
  assert.match(saved[0].voice.prompt, /青年男性，嗓音清亮干净/);
  // 表单字段保持共享归一化预填的通用占位（估算不回填表单——用户显式填写永远优先）。
  assert.equal(saved[0].voicePrompt, "男性，青年，自然清晰的说话声音");
});

test("通用占位音色在估算失败时仍可兜底合成（保持旧行为）", async () => {
  // 初始状态由共享归一化预填「男性，青年，自然清晰的说话声音」这类占位；估算失败不阻塞合成。
  let statesJson = JSON.stringify([
    { id: "s1", label: "初始状态", description: "青年", imagePrompt: "青年" },
  ]);
  const calls = [];
  const service = new StoryAssetStateVoiceService({
    findCharacter: async () => ({
      id: "c1", novelId: "n1", name: "林澈", voiceTexture: null, statesJson,
      gender: "male", ageGroup: "youth",
    }),
    updateStates: async (_characterId, nextStatesJson) => { statesJson = nextStatesJson; },
    listCharacters: async () => [{
      id: "c1",
      name: "林澈",
      gender: "male",
      ageGroup: "youth",
      physique: null,
      attireStyle: null,
      facePrompt: null,
      voiceTexture: null,
      personality: null,
      appearance: null,
      background: null,
      states: JSON.parse(statesJson),
      updatedAt: new Date().toISOString(),
    }],
    synthesize: async (input) => {
      calls.push(input);
      return {
        audioDataBase64: "YQ==",
        contentType: "audio/mpeg",
        byteLength: 1,
        dataUrl: "data:audio/mpeg;base64,YQ==",
      };
    },
    estimateVoiceProfile: async () => {
      throw new Error("估算服务不可用");
    },
  });

  await service.generateStateVoice("n1", "c1", "s1", "generate_new");

  assert.equal(calls.length, 1);
  assert.match(calls[0].emotion, /自然清晰的说话声音/);
  const saved = JSON.parse(statesJson);
  assert.equal(saved[0].voice.status, "done");
});
