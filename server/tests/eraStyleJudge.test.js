const test = require("node:test");
const assert = require("node:assert/strict");

// 时代风格按剧情判定（drama.visual.era_style_judge@v1）：注册、schema、postValidate 只认清单内风格。

const { eraStyleJudgePrompt } = require("../dist/prompting/prompts/drama/eraStyleJudge.prompts.js");
const { promptAssetLoaderEntries } = require("../dist/prompting/registry/promptAssetLoaderEntries.js");

const STYLES = [
  { key: "realistic", label: "现代都市", summary: "当代都市与日常生活。" },
  { key: "post_apocalyptic", label: "末世废土", summary: "文明崩溃后的灰调氛围。" },
  { key: "民国年代", label: "民国年代", summary: "自定义风格。" },
];

const BASE_INPUT = {
  target: "叶竹 · 初始状态 状态图",
  scriptExcerpt: "清晨的大学宿舍，阳光洒进窗户，叶竹背着书包出门赶早课。",
  availableStyles: STYLES,
  defaultKey: "post_apocalyptic",
};

test("prompt 注册进 loader registry（drama.visual.era_style_judge@v1）", () => {
  const keys = promptAssetLoaderEntries.map((entry) => entry.key);
  assert.ok(keys.includes("drama.visual.era_style_judge@v1"), "缺少 drama.visual.era_style_judge@v1 注册");
});

test("postValidate 只接受清单内的风格 key", () => {
  const ok = eraStyleJudgePrompt.postValidate(
    { styleKey: "realistic", reason: "剧情是崩溃前的现代日常" },
    BASE_INPUT,
  );
  assert.equal(ok.styleKey, "realistic");
  // 自定义风格名作为 key 也可选。
  assert.equal(
    eraStyleJudgePrompt.postValidate({ styleKey: "民国年代", reason: "剧情在民国" }, BASE_INPUT).styleKey,
    "民国年代",
  );
  assert.throws(
    () => eraStyleJudgePrompt.postValidate({ styleKey: "赛博朋克", reason: "不在清单" }, BASE_INPUT),
    /不在可选清单/,
  );
});

test("schema 拒绝缺失字段与超长 reason", () => {
  assert.throws(() => eraStyleJudgePrompt.outputSchema.parse({ styleKey: "realistic" }));
  assert.throws(() => eraStyleJudgePrompt.outputSchema.parse({ styleKey: "realistic", reason: "x".repeat(121) }));
  assert.throws(() => eraStyleJudgePrompt.outputSchema.parse({ styleKey: "realistic", reason: "ok", extra: 1 }));
});

test("render 注入剧情判定关键原则（看当下、不被题材带偏、线索不明用 defaultKey）", () => {
  const messages = eraStyleJudgePrompt.render(BASE_INPUT);
  const text = messages.map((message) => String(message.content)).join(" ");
  assert.match(text, /只看这段文本描述的「当下」/);
  assert.match(text, /线索模糊或混合时选 defaultKey/);
  assert.match(text, /必须从 availableStyles 给出的 key 里选/);
  assert.match(text, /叶竹 · 初始状态 状态图/);
});
