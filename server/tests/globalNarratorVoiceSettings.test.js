const test = require("node:test");
const assert = require("node:assert/strict");

function createStore(initial = {}) {
  const values = new Map(Object.entries(initial));
  const upserts = [];
  return {
    upserts,
    async findUnique({ where }) {
      const value = values.get(where.key);
      return value === undefined ? null : { key: where.key, value };
    },
    async upsert({ where, update, create }) {
      const value = values.has(where.key) ? update.value : create.value;
      values.set(where.key, value);
      upserts.push({ where, update, create });
      return { key: where.key, value };
    },
  };
}

function createService(overrides = {}) {
  const { GlobalNarratorVoiceSettingsService } = require("../dist/services/settings/GlobalNarratorVoiceSettingsService.js");
  return new GlobalNarratorVoiceSettingsService({
    appSettingStore: overrides.appSettingStore ?? createStore(),
    legacyProjectStore: {
      async findMany() {
        return overrides.legacyProjects ?? (overrides.legacyProject ? [overrides.legacyProject] : []);
      },
    },
    synthesize: overrides.synthesize ?? (async () => ({ dataUrl: "data:audio/mp3;base64:generated" })),
    persistReferenceAudio: overrides.persistReferenceAudio ?? (async () => "app-generated.mp3"),
    now: overrides.now ?? (() => new Date("2026-08-23T00:00:00.000Z")),
  });
}

test("系统设置优先于旧项目旁白字段", async () => {
  const store = createStore({
    "drama.globalNarratorVoice": JSON.stringify({
      description: "系统男声",
      sampleText: "这是音色参考测试文本，请用自然、清晰、稳定的中文普通话读完。语速适中，吐字清楚，保持真实连贯的声音。",
      sampleAudioUrl: "data:audio/mp3;base64:global",
    }),
  });
  const legacy = {
    narratorVoiceData: JSON.stringify({
      description: "项目旧声",
      sampleAudioUrl: "data:audio/mp3;base64:legacy",
    }),
  };
  const service = createService({ appSettingStore: store, legacyProject: legacy });
  assert.deepEqual(await service.get(), {
    description: "系统男声",
    sampleText: "这是音色参考测试文本，请用自然、清晰、稳定的中文普通话读完。语速适中，吐字清楚，保持真实连贯的声音。",
    sampleAudioUrl: "data:audio/mp3;base64:global",
  });
  assert.equal(store.upserts.length, 0);
});

test("没有系统设置时迁移第一个有效旧项目并保留其字段", async () => {
  const store = createStore();
  const legacy = {
    narratorVoiceData: JSON.stringify({
      description: "旧项目男声",
      sampleText: "这是音色参考测试文本，请用自然、清晰、稳定的中文普通话读完。语速适中，吐字清楚，保持真实连贯的声音。",
      sampleAudioUrl: "data:audio/mp3;base64:old",
    }),
  };
  const service = createService({ appSettingStore: store, legacyProject: legacy });
  const result = await service.get();
  assert.equal(result.description, "旧项目男声");
  assert.equal(result.sampleAudioUrl, "data:audio/mp3;base64:old");
  assert.match(store.upserts[0].create.value, /旧项目男声/);
});

test("旧项目首条旁白无效时继续寻找下一个有效样本", async () => {
  const store = createStore();
  const service = createService({
    appSettingStore: store,
    legacyProjects: [
      { narratorVoiceData: "not-json" },
      { narratorVoiceData: JSON.stringify({
        description: "第二个旧声",
        sampleText: "这是音色参考测试文本，请用自然、清晰、稳定的中文普通话读完。语速适中，吐字清楚，保持真实连贯的声音。",
        sampleAudioUrl: "data:audio/mp3;base64:valid",
      }) },
    ],
  });
  const result = await service.get();
  assert.equal(result.description, "第二个旧声");
  assert.equal(result.sampleAudioUrl, "data:audio/mp3;base64:valid");
});

test("空旁白设置默认提供女性自然叙述描述", async () => {
  const service = createService();
  assert.deepEqual(await service.get(), {
    description: "成年女声旁白，普通话自然清楚，温和沉稳地叙述；不做情绪表演，不使用播音员或主持人的腔调。",
  });
});

test("旧小说原文试听样本不会继续返回给播放器", async () => {
  const store = createStore({
    "drama.globalNarratorVoice": JSON.stringify({
      description: "旧旁白描述",
      sampleText: "天色已经暗下来，房间里很安静。",
      sampleAudioUrl: "data:audio/mp3;base64:old",
      sampleSha256: "old-hash",
    }),
  });
  const service = createService({ appSettingStore: store });
  assert.deepEqual(await service.get(), { description: "旧旁白描述" });
});

test("保存描述会更新时间但不会丢失已有参考音频", async () => {
  const store = createStore({
    "drama.globalNarratorVoice": JSON.stringify({
      description: "旧描述",
      sampleText: "这是音色参考测试文本，请用自然、清晰、稳定的中文普通话读完。语速适中，吐字清楚，保持真实连贯的声音。",
      sampleAudioUrl: "data:audio/mp3;base64:sample",
    }),
  });
  const service = createService({ appSettingStore: store });
  const result = await service.updateDescription("新的描述");
  assert.equal(result.sampleAudioUrl, "data:audio/mp3;base64:sample");
  assert.equal(result.updatedAt, "2026-08-23T00:00:00.000Z");
});

test("生成试听会以旁白样句和描述调用语音服务并替换全局样本", async () => {
  const calls = [];
  const store = createStore();
  const service = createService({
    appSettingStore: store,
    synthesize: async (input) => {
      calls.push(input);
      return { dataUrl: "data:audio/mp3;base64:new" };
    },
  });
  const result = await service.design("成年男声，平直叙述");
  assert.equal(calls[0].audioType, "narration");
  assert.equal(calls[0].emotion, "成年男声，平直叙述");
  assert.equal(
    calls[0].text,
    "这是音色参考测试文本，请用自然、清晰、稳定的中文普通话读完。语速适中，吐字清楚，保持真实连贯的声音。",
  );
  assert.equal(result.sampleAudioUrl, "data:audio/mp3;base64:new");
  assert.equal(
    result.sampleText,
    "这是音色参考测试文本，请用自然、清晰、稳定的中文普通话读完。语速适中，吐字清楚，保持真实连贯的声音。",
  );
  assert.equal(result.referenceAudioUrl, undefined);
});

test("重新设计音色不会把上一次试听样本当成新的参考音频", async () => {
  const calls = [];
  const store = createStore({
    "drama.globalNarratorVoice": JSON.stringify({
      description: "旧男声旁白",
      referenceAudioUrl: "app-legacy-index-reference.mp3",
      sampleText: "这是音色参考测试文本，请用自然、清晰、稳定的中文普通话读完。语速适中，吐字清楚，保持真实连贯的声音。",
      sampleAudioUrl: "data:audio/wav;base64,old-male-sample",
    }),
  });
  const service = createService({
    appSettingStore: store,
    synthesize: async (input) => {
      calls.push(input);
      return { dataUrl: "data:audio/wav;base64,new-female-sample" };
    },
  });

  const result = await service.design("成年女声旁白，普通话自然清楚，温和沉稳");

  assert.equal(calls[0].referenceAudioUrl, undefined);
  assert.equal(result.referenceAudioUrl, undefined);
});

test("保存旁白描述时保留可被 VoxCPM2 读取的参考音频", async () => {
  const store = createStore({
    "drama.globalNarratorVoice": JSON.stringify({ description: "旧描述", referenceAudioUrl: "old.wav" }),
  });
  const service = createService({
    appSettingStore: store,
  });
  const result = await service.updateDescription("新的描述", {
    referenceAudioUrl: "data:audio/wav;base64,dXBsb2FkZWQ=",
    indexTTS25Speaker: "narrator-lora",
  });
  assert.equal(result.referenceAudioUrl, "data:audio/wav;base64,dXBsb2FkZWQ=");
  assert.equal(result.indexTTS25Speaker, "narrator-lora");
});

test("旁白试听使用用户提供的 VoxCPM2 参考音频", async () => {
  const calls = [];
  const service = createService({
    synthesize: async (input) => {
      calls.push(input);
      return { dataUrl: "data:audio/mp3;base64:new" };
    },
  });
  const result = await service.design("成年男声，平直叙述", {
    referenceAudioUrl: "data:audio/wav;base64,dXBsb2FkZWQ=",
    indexTTS25Speaker: "narrator-lora",
  });
  assert.equal(calls[0].referenceAudioUrl, "data:audio/wav;base64,dXBsb2FkZWQ=");
  assert.equal(calls[0].indexTTS25Speaker, undefined);
  assert.equal(result.referenceAudioUrl, "data:audio/wav;base64,dXBsb2FkZWQ=");
  assert.equal(result.indexTTS25Speaker, "narrator-lora");
});

test("清除旁白参考音频会从持久化状态中移除来源", async () => {
  const store = createStore({
    "drama.globalNarratorVoice": JSON.stringify({
      description: "旧描述",
      referenceAudioUrl: "old.wav",
      indexTTS25Speaker: "narrator-lora",
    }),
  });
  const service = createService({ appSettingStore: store });
  const result = await service.updateDescription("新的描述", { referenceAudioUrl: "" });
  assert.equal(result.referenceAudioUrl, undefined);
  assert.equal(result.indexTTS25Speaker, "narrator-lora");
});
