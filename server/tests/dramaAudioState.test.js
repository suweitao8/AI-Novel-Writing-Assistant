const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildDialogueVoiceKey,
  parseDialogueLines,
  parseShotCharacterStates,
  resolveVoiceForCharacterState,
} = require("../dist/services/drama/audio/DramaDialogueAudioService.js");

test("旁白行不会被当成带语气的对白", () => {
  assert.deepEqual(parseDialogueLines("旁白（平静）：街灯亮起。"), [
    { lineIndex: 0, type: "narration", speaker: "旁白", text: "街灯亮起。" },
  ]);
  assert.deepEqual(parseDialogueLines("林澈（急切）：别走。"), [
    { lineIndex: 0, type: "dialogue", speaker: "林澈", text: "别走。", emotion: "急切" },
  ]);
});

test("分镜角色状态会覆盖对白音色并传入状态试听参考", () => {
  const states = [{
    id: "s2",
    label: "老年",
    description: "白发",
    imagePrompt: "白发",
    voicePrompt: "年迈沙哑",
    voice: {
      status: "done",
      mode: "generate_new",
      sampleAudioUrl: "data:audio/s2",
      prompt: "年迈沙哑",
    },
  }];
  const voice = resolveVoiceForCharacterState({ name: "林澈", voiceId: "base" }, states, "老年");
  assert.equal(voice.referenceAudioUrl, "data:audio/s2");
  assert.equal(voice.emotion, "年迈沙哑");
  assert.equal(
    resolveVoiceForCharacterState(undefined, states, "老年", "林澈").referenceAudioUrl,
    "data:audio/s2",
  );
  assert.notEqual(
    buildDialogueVoiceKey({ type: "dialogue", voice: { name: "林澈", voiceId: "base", referenceAudioUrl: "data:audio/s1" } }),
    buildDialogueVoiceKey({ type: "dialogue", voice }),
  );
});

test("没有当前状态音色时，分镜配音会继承上一状态提示词", () => {
  const states = [
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
  ];
  const voice = resolveVoiceForCharacterState({ name: "林澈", voiceId: "base" }, states, "受伤");
  assert.equal(voice.emotion, "清亮的青年男声");
  assert.equal(voice.voicePrompt, "清亮的青年男声");
});

test("分镜配音会沿多级状态继承最近可用的试听音频", () => {
  const states = [
    {
      id: "s1",
      label: "初始状态",
      description: "青年",
      imagePrompt: "青年",
      voice: { status: "done", mode: "generate_new", sampleAudioUrl: "data:audio/s1", prompt: "清亮的青年男声" },
    },
    { id: "s2", label: "受伤", description: "轻伤", imagePrompt: "轻伤" },
    { id: "s3", label: "重伤", description: "重伤", imagePrompt: "重伤" },
  ];
  const voice = resolveVoiceForCharacterState({ name: "林澈", voiceId: "base" }, states, "重伤");
  assert.equal(voice.referenceAudioUrl, "data:audio/s1");
});

test("分镜状态 JSON 按角色名归一化，未知或空状态不会覆盖音色", () => {
  const stateMap = parseShotCharacterStates(JSON.stringify([
    { name: " 林澈 ", state: " 老年 " },
    { name: "空状态", state: "" },
  ]));
  assert.equal(stateMap.get("林澈"), "老年");
  assert.equal(stateMap.has("空状态"), false);
  const voice = resolveVoiceForCharacterState({ name: "林澈", voiceId: "base" }, [], "老年");
  assert.deepEqual(voice, { name: "林澈", voiceId: "base" });
});
