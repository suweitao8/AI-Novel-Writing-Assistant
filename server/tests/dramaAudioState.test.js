const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildDialogueVoiceKey,
  parseShotCharacterStates,
  resolveVoiceForCharacterState,
} = require("../dist/services/drama/audio/DramaDialogueAudioService.js");

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
