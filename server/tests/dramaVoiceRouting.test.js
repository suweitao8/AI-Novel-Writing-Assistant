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

test("VoxCPM2 请求继续为角色保留 dialogue 语义和角色名", () => {
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
      referenceAudioUrl: "data:audio/wav;base64,Y2hhcmFjdGVy",
    },
    {},
  );

  assert.equal(request.audioType, "dialogue");
  assert.equal(request.speaker, "林澈");
  assert.equal(request.emotion, "压低声音");
  assert.equal(request.referenceAudioUrl, "data:audio/wav;base64,Y2hhcmFjdGVy");
});

test("角色试听样本会作为后续 VoxCPM2 参考音频", () => {
  const { readCharacterVoice, buildDialogueTTSRequest } = require("../dist/services/drama/audio/DramaDialogueAudioService.js");
  const voice = readCharacterVoice({
    name: "叶竹",
    voiceProfile: JSON.stringify({
      voicePrompt: "青年女声，清亮克制",
      sampleAudioUrl: "data:audio/wav;base64,cHJldmlldw==",
    }),
  });
  assert.equal(voice.referenceAudioUrl, "data:audio/wav;base64,cHJldmlldw==");
  const request = buildDialogueTTSRequest(
    { type: "dialogue", speaker: "叶竹", text: "我在。", emotion: undefined },
    voice,
    {},
  );
  assert.equal(request.referenceAudioUrl, "data:audio/wav;base64,cHJldmlldw==");
});

test("VoxCPM2 provider 将分镜的 audioType 透传到公共语音出口", () => {
  const { buildVoxCPMSpeechInput } = require("../dist/services/drama/audio/VoxCPM2TTSProvider.js");

  const narrator = buildVoxCPMSpeechInput({
    text: "旁白内容。",
    audioType: "narration",
    speaker: "旁白",
    emotion: "平静",
    referenceAudioUrl: "data:audio/wav;base64:narrator",
  });
  assert.equal(narrator.audioType, "narration");
  assert.equal(narrator.speaker, undefined);

  const dialogue = buildVoxCPMSpeechInput({
    text: "角色内容。",
    audioType: "dialogue",
    speaker: "林澈",
    emotion: "克制",
  });
  assert.equal(dialogue.audioType, "dialogue");
  assert.equal(dialogue.speaker, "林澈");
});

test("历史 IndexTTS 文件名不会作为 VoxCPM2 参考音频发送", () => {
  const { buildDialogueTTSRequest } = require("../dist/services/drama/audio/DramaDialogueAudioService.js");
  const request = buildDialogueTTSRequest(
    { type: "narration", speaker: "旁白", text: "继续前进。", emotion: undefined },
    undefined,
    {
      description: "成年女声旁白，温和沉稳",
      referenceAudioUrl: "app-legacy-index-reference.mp3",
      sampleAudioUrl: "data:audio/wav;base64,Z2VuZXJhdGVkLXByZXZpZXc=",
    },
  );
  assert.equal(request.referenceAudioUrl, "data:audio/wav;base64,Z2VuZXJhdGVkLXByZXZpZXc=");
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

test("角色音色描述变化会淘汰旧对白音频", () => {
  const { buildDialogueVoiceKey } = require("../dist/services/drama/audio/DramaDialogueAudioService.js");
  const first = buildDialogueVoiceKey({
    type: "dialogue",
    voice: { name: "叶竹", voicePrompt: "自然女声" },
  });
  const second = buildDialogueVoiceKey({
    type: "dialogue",
    voice: { name: "叶竹", voicePrompt: "清亮女声" },
  });
  assert.notEqual(first, second);
});
