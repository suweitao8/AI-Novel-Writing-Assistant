const test = require("node:test");
const assert = require("node:assert/strict");

// 角色音色描述估算（novel.character.voice_profile@v1）：注册、schema 边界、postValidate。

const { characterVoiceProfilePrompt } = require("../dist/prompting/prompts/novel/characterVoiceProfile.prompts.js");
const { promptAssetLoaderEntries } = require("../dist/prompting/registry/promptAssetLoaderEntries.js");

test("prompt 注册进 loader registry（novel.character.voice_profile@v1）", () => {
  const keys = promptAssetLoaderEntries.map((entry) => entry.key);
  assert.ok(keys.includes("novel.character.voice_profile@v1"), "缺少 novel.character.voice_profile@v1 注册");
});

test("outputSchema 接受中文音色描述并拒绝越界长度", () => {
  const parsed = characterVoiceProfilePrompt.outputSchema.parse({
    voiceProfile: "青年男性，嗓音清亮干净，语速平缓，像身边同学自然说话",
  });
  assert.equal(parsed.voiceProfile.length > 0, true);
  assert.throws(() => characterVoiceProfilePrompt.outputSchema.parse({ voiceProfile: "短" }));
  assert.throws(() => characterVoiceProfilePrompt.outputSchema.parse({ voiceProfile: "x".repeat(61) }));
  assert.throws(() => characterVoiceProfilePrompt.outputSchema.parse({ voiceProfile: "青年男声", extra: 1 }));
});

test("postValidate 拒绝空白描述", () => {
  assert.throws(
    () => characterVoiceProfilePrompt.postValidate({ voiceProfile: "   " }),
    /音色描述过短/,
  );
  const ok = characterVoiceProfilePrompt.postValidate({ voiceProfile: "中年女性，声音温和沉稳，吐字清晰" });
  assert.equal(ok.voiceProfile, "中年女性，声音温和沉稳，吐字清晰");
});

test("render 注入形象档案与真人基线约束", () => {
  const messages = characterVoiceProfilePrompt.render({
    name: "林澈",
    gender: "male",
    ageGroup: "youth",
    facePrompt: "青年男性大学生，清爽短发",
  });
  const text = messages.map((message) => String(message.content)).join("\n");
  assert.match(text, /选角配音导演/);
  assert.match(text, /像真人日常交流/);
  assert.match(text, /林澈/);
});
