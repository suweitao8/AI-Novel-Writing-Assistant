const test = require("node:test");
const assert = require("node:assert/strict");

const {
  preserveStoryAssetRuntimeAssets,
  updateStoryAssetStateJsonWithCas,
} = require("../dist/modules/novel/story-settings/application/StorySettingsStatePolicy.js");

test("用户保存状态时保留数据库最新的图片和音色资产", () => {
  const current = [{
    id: "s1",
    label: "初始",
    description: "正常",
    imagePrompt: "正面",
    image: { status: "done", url: "/latest-image" },
    voice: { status: "done", mode: "generate_new", sampleAudioUrl: "data:latest-audio" },
  }];
  const stalePayload = [{
    ...current[0],
    image: { status: "done", url: "/stale-image" },
    voice: { status: "done", mode: "generate_new", sampleAudioUrl: "data:stale-audio" },
  }];

  const merged = preserveStoryAssetRuntimeAssets(current, stalePayload);
  assert.equal(merged[0].image.url, "/latest-image");
  assert.equal(merged[0].voice.sampleAudioUrl, "data:latest-audio");
});

test("状态资产 CAS 冲突重试时只合并目标字段并保留并发状态", async () => {
  const initial = [
    { id: "s1", label: "初始", description: "正常", imagePrompt: "正面" },
    { id: "s2", label: "受伤", description: "受伤", imagePrompt: "绷带" },
  ];
  let raw = JSON.stringify(initial);
  let writeAttempts = 0;

  await updateStoryAssetStateJsonWithCas({
    stateId: "s2",
    fallbackStates: initial,
    read: async () => ({ raw }),
    write: async (expectedRaw, nextRaw) => {
      writeAttempts += 1;
      if (writeAttempts === 1) {
        raw = JSON.stringify(initial.map((state) => state.id === "s1"
          ? { ...state, voice: { status: "done", mode: "generate_new", sampleAudioUrl: "data:audio/s1" } }
          : state));
        assert.equal(expectedRaw, JSON.stringify(initial));
        return false;
      }
      assert.equal(expectedRaw, raw);
      raw = nextRaw;
      return true;
    },
    patch: (state) => ({
      ...state,
      image: { status: "done", url: "/state/s2" },
    }),
  });

  const saved = JSON.parse(raw);
  assert.equal(writeAttempts, 2);
  assert.equal(saved[0].voice.sampleAudioUrl, "data:audio/s1");
  assert.equal(saved[1].image.url, "/state/s2");
});

test("状态资产 CAS 单次模式在冲突后不重试覆盖同文案的新错误", async () => {
  const initial = [{
    id: "s1",
    label: "初始",
    description: "正常",
    imagePrompt: "正面",
    image: { status: "error", error: "生成超时" },
  }];
  let raw = JSON.stringify(initial);
  let writeAttempts = 0;

  await assert.rejects(
    updateStoryAssetStateJsonWithCas({
      stateId: "s1",
      fallbackStates: initial,
      maxAttempts: 1,
      read: async () => ({ raw }),
      write: async () => {
        writeAttempts += 1;
        raw = JSON.stringify([{
          ...initial[0],
          image: { status: "error", error: "生成超时", attemptId: "new-attempt" },
        }]);
        return false;
      },
      patch: (state) => ({ ...state, image: { status: "error" } }),
    }),
    (error) => error?.statusCode === 409,
  );

  assert.equal(writeAttempts, 1);
  assert.deepEqual(JSON.parse(raw)[0].image, {
    status: "error",
    error: "生成超时",
    attemptId: "new-attempt",
  });
});

test("状态资产 CAS 遇到损坏 JSON 时不会写回覆盖原始数据", async () => {
  let writes = 0;
  await assert.rejects(
    updateStoryAssetStateJsonWithCas({
      stateId: "s1",
      fallbackStates: [],
      read: async () => ({ raw: JSON.stringify([{ id: "s1", label: "初始", description: 7 }]) }),
      write: async () => {
        writes += 1;
        return true;
      },
      patch: (state) => state,
    }),
    (error) => error?.statusCode === 409,
  );
  assert.equal(writes, 0);
});
