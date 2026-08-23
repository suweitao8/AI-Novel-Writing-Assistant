const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const read = (relativePath) => fs.readFileSync(path.join(__dirname, "..", "src", relativePath), "utf8");

test("旁白合成读取系统级设置并传递参考音频", () => {
  const dialogueService = read("services/drama/audio/DramaDialogueAudioService.ts");
  assert.match(dialogueService, /globalNarratorVoiceSettingsService\.get\(\)/);
  assert.match(dialogueService, /referenceAudioUrl:\s*isNarrationLine\s*\?\s*narratorVoice\.sampleAudioUrl/);
});

test("旁白音色指纹同时包含描述和参考样本", () => {
  const { buildDialogueVoiceKey } = require("../dist/services/drama/audio/DramaDialogueAudioService.js");
  assert.notEqual(
    buildDialogueVoiceKey({ type: "narration", narratorDescription: "平直", narratorSampleAudioUrl: "data:a" }),
    buildDialogueVoiceKey({ type: "narration", narratorDescription: "平直", narratorSampleAudioUrl: "data:b" }),
  );
  assert.equal(
    buildDialogueVoiceKey({ type: "dialogue", voice: { name: "叶晨", voiceId: "v1" }, narratorSampleAudioUrl: "data:a" }),
    buildDialogueVoiceKey({ type: "dialogue", voice: { name: "叶晨", voiceId: "v1" }, narratorSampleAudioUrl: "data:b" }),
  );
});

test("分段投影读取同一份系统旁白设置", () => {
  const segmentsService = read("services/drama/audio/DramaAudioSegmentsService.ts");
  assert.match(segmentsService, /globalNarratorVoiceSettingsService\.get\(\)/);
  assert.match(segmentsService, /narratorSampleAudioUrl/);
});
