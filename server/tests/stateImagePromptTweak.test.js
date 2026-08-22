const test = require("node:test");
const assert = require("node:assert/strict");

const { stateImagePromptTweakPrompt } = require("../dist/prompting/prompts/novel/stateImagePromptTweak.prompts.js");
const { promptAssetLoaderEntries } = require("../dist/prompting/registry/promptAssetLoaderEntries.js");
const { hasRegisteredPromptAsset } = require("../dist/prompting/registry.js");

// 状态图片提示词微调契约（2026-08-22）：新增状态常复用旧状态提示词，用户给一条小改动
// 指令（如「去掉身上的伤」），novel.state_image_prompt.tweak@v1 只改指令涉及的部分。
// 输出单条 imagePrompt（4~600 字，与状态表单同上限），不夹带解释，不添加生成链自动
// 注入的视图规格/画风词。纯文本改写，不读写资产——资产未保存也可用。

test("stateImagePromptTweak 已注册且为结构化输出", () => {
  assert.equal(stateImagePromptTweakPrompt.id, "novel.state_image_prompt.tweak");
  assert.equal(stateImagePromptTweakPrompt.version, "v2");
  assert.equal(stateImagePromptTweakPrompt.mode, "structured");
  assert.ok(promptAssetLoaderEntries.some((entry) => entry.key === "novel.state_image_prompt.tweak@v2"));
  assert.ok(hasRegisteredPromptAsset("novel.state_image_prompt.tweak", "v2"));
});

test("输出 schema：imagePrompt 4～600 字，多余字段拒绝", () => {
  const schema = stateImagePromptTweakPrompt.outputSchema;
  assert.equal(schema.safeParse({ imagePrompt: "青年男性全身像，黑色短发，脸上无伤" }).success, true);
  assert.equal(schema.safeParse({ imagePrompt: "太短" }).success, false);
  assert.equal(schema.safeParse({ imagePrompt: "青".repeat(601) }).success, false);
  assert.equal(schema.safeParse({ imagePrompt: "青年男性全身像", extra: 1 }).success, false);
});

test("render 携带当前提示词与指令，系统消息要求轻微修改", () => {
  const input = {
    kind: "character",
    assetName: "林川",
    stateLabel: "痊愈",
    imagePrompt: "青年男性全身像：黑色短发、深色夹克，脸上有伤",
    instruction: "去掉身上的伤",
  };
  const messages = stateImagePromptTweakPrompt.render(input);
  const systemText = String(messages[0].content);
  assert.ok(systemText.includes("轻微修改"));
  assert.ok(systemText.includes("四视图"));
  const human = JSON.parse(String(messages[messages.length - 1].content));
  assert.equal(human.instruction, "去掉身上的伤");
  assert.ok(human.imagePrompt.includes("伤"));
});

test("postValidate 拒绝过短输出", () => {
  assert.throws(() => stateImagePromptTweakPrompt.postValidate({ imagePrompt: "太短" }));
  assert.doesNotThrow(() => stateImagePromptTweakPrompt.postValidate({ imagePrompt: "青年男性全身像，脸上无伤" }));
});

test("postValidate 出口剥离画风/背景/视图/时代氛围词（v2）", () => {
  const output = stateImagePromptTweakPrompt.postValidate({
    imagePrompt: "青年男性，黑色短发，深色夹克，脸上无伤，写实动漫风格，纯白背景",
  });
  assert.equal(output.imagePrompt, "青年男性，黑色短发，深色夹克，脸上无伤");
});
