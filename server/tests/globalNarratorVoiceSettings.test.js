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
      async findFirst() {
        return overrides.legacyProject ?? null;
      },
    },
    synthesize: overrides.synthesize ?? (async () => ({ dataUrl: "data:audio/mp3;base64:generated" })),
    now: overrides.now ?? (() => new Date("2026-08-23T00:00:00.000Z")),
  });
}

test("系统设置优先于旧项目旁白字段", async () => {
  const store = createStore({
    "drama.globalNarratorVoice": JSON.stringify({
      description: "系统男声",
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
    sampleAudioUrl: "data:audio/mp3;base64:global",
  });
  assert.equal(store.upserts.length, 0);
});

test("没有系统设置时迁移第一个有效旧项目并保留其字段", async () => {
  const store = createStore();
  const legacy = {
    narratorVoiceData: JSON.stringify({
      description: "旧项目男声",
      sampleAudioUrl: "data:audio/mp3;base64:old",
    }),
  };
  const service = createService({ appSettingStore: store, legacyProject: legacy });
  const result = await service.get();
  assert.equal(result.description, "旧项目男声");
  assert.equal(result.sampleAudioUrl, "data:audio/mp3;base64:old");
  assert.match(store.upserts[0].create.value, /旧项目男声/);
});

test("保存描述会更新时间但不会丢失已有参考音频", async () => {
  const store = createStore({
    "drama.globalNarratorVoice": JSON.stringify({
      description: "旧描述",
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
  assert.match(calls[0].text, /音色/);
  assert.equal(result.sampleAudioUrl, "data:audio/mp3;base64:new");
});
