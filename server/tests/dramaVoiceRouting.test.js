const test = require("node:test");
const assert = require("node:assert/strict");

test("分镜配音为旁白保留 narration 语义，并且不把旁白当成角色名", () => {
  const { buildDialogueTTSRequest } = require("../dist/services/drama/audio/DramaDialogueAudioService.js");

  const request = buildDialogueTTSRequest(
    {
      type: "narration",
      speaker: "旁白",
      text: "夜色落在空旷的街道上。",
      emotion: undefined,
    },
    undefined,
    {
      description: "成年女声旁白，温和沉稳",
      sampleAudioUrl: "data:audio/wav;base64,narrator",
    },
  );

  assert.equal(request.audioType, "narration");
  assert.equal(request.speaker, undefined);
  assert.equal(request.emotion, "成年女声旁白，温和沉稳");
  assert.equal(request.referenceAudioUrl, "data:audio/wav;base64,narrator");
});

test("IndexTTS 2.5 请求继续为角色保留 dialogue 语义和角色名", () => {
  const { buildDialogueTTSRequest } = require("../dist/services/drama/audio/DramaDialogueAudioService.js");

  const request = buildDialogueTTSRequest(
    {
      type: "dialogue",
      speaker: "林澈",
      text: "别走。",
      emotion: "压低声音",
    },
    {
      name: "林澈",
      voiceId: "lin-che",
      voicePrompt: "青年男声，低沉克制",
      referenceAudioUrl: "data:audio/wav;base64:character",
    },
    {},
  );

  assert.equal(request.audioType, "dialogue");
  assert.equal(request.speaker, "林澈");
  assert.equal(request.emotion, "压低声音");
  assert.equal(request.referenceAudioUrl, "data:audio/wav;base64:character");
});

test("IndexTTS 2.5 provider 将分镜的 audioType 透传到公共语音出口", () => {
  const { buildIndexTTS25SpeechInput } = require("../dist/services/drama/audio/IndexTTS25TTSProvider.js");

  const narrator = buildIndexTTS25SpeechInput({
    text: "旁白内容。",
    audioType: "narration",
    speaker: "旁白",
    emotion: "平静",
    referenceAudioUrl: "data:audio/wav;base64:narrator",
  });
  assert.equal(narrator.audioType, "narration");
  assert.equal(narrator.speaker, undefined);

  const dialogue = buildIndexTTS25SpeechInput({
    text: "角色内容。",
    audioType: "dialogue",
    speaker: "林澈",
    emotion: "克制",
  });
  assert.equal(dialogue.audioType, "dialogue");
  assert.equal(dialogue.speaker, "林澈");
});

test("旁白音色指纹包含路由版本，自动淘汰旧的对白包装音频", () => {
  const { buildDialogueVoiceKey } = require("../dist/services/drama/audio/DramaDialogueAudioService.js");
  const key = buildDialogueVoiceKey({
    type: "narration",
    narratorDescription: "成年女声旁白，温和沉稳",
    narratorSampleAudioUrl: "data:audio/wav;base64:narrator",
  });

  assert.match(key, /narration-v2/);
});
