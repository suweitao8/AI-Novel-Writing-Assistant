const test = require("node:test");
const assert = require("node:assert/strict");

// 分镜式初稿 v8：scene/stateSwitches 契约与
// 【场景：…】【角色状态：…】切换标记序列化（风格不进初稿）。

const { chapterReferenceDraftPrompt } = require("../dist/prompting/prompts/novel/chapterReferenceDraft.prompts.js");
const { promptAssetLoaderEntries } = require("../dist/prompting/registry/promptAssetLoaderEntries.js");
const {
  serializeDraftSegments,
} = require("../dist/modules/novel/planning/application/ChapterReferenceDraftService.js");

function makeSegment(overrides = {}) {
  return {
    shot: "中景",
    storyboard: "林川站在窗前看向楼下的街道",
    scene: "卧室",
    speaker: "旁白",
    kind: "narration",
    mood: "",
    text: "夜色里街道空无一人。",
    ...overrides,
  };
}

test("prompt 资产为 v8，scene 必填、无风格字段（画风不进初稿）、状态切换可缺省", () => {
  assert.equal(chapterReferenceDraftPrompt.version, "v8");
  assert.equal(
    promptAssetLoaderEntries.find((entry) => entry.key.startsWith("novel.chapter.reference_draft")).key,
    "novel.chapter.reference_draft@v8",
  );
  assert.throws(() => chapterReferenceDraftPrompt.outputSchema.parse({
    segments: [makeSegment({ scene: undefined })],
  }));
  const parsed = chapterReferenceDraftPrompt.outputSchema.parse({
    segments: Array.from({ length: 8 }, () => makeSegment()),
  });
  assert.equal(parsed.segments[0].scene, "卧室");
  // 状态缺省时落到空数组，旧结构化结果仍可解析
  assert.deepEqual(parsed.segments[0].stateSwitches, []);
  // v8 移除 styleSwitch：strict 模式下多余字段直接拒绝
  assert.throws(() => chapterReferenceDraftPrompt.outputSchema.parse({
    segments: Array.from({ length: 8 }, (_, index) => index === 0
      ? makeSegment({ styleSwitch: "写实末日" })
      : makeSegment()),
  }));
  const withSwitches = chapterReferenceDraftPrompt.outputSchema.parse({
    segments: Array.from({ length: 8 }, (_, index) => index === 0
      ? makeSegment({ stateSwitches: [{ name: "林川", state: "重伤" }] })
      : makeSegment()),
  });
  assert.deepEqual(withSwitches.segments[0].stateSwitches, [{ name: "林川", state: "重伤" }]);
});

test("serializeDraftSegments 首单元与换场时输出【场景】行，同场景不重复", () => {
  const draftText = serializeDraftSegments([
    makeSegment(),
    makeSegment({ shot: "近景", text: "他握紧了手里的信。" }),
    makeSegment({ scene: "客厅", kind: "dialogue", speaker: "林川", mood: "压抑怒气", text: "你不该回来。" }),
    makeSegment({ scene: "客厅", shot: "特写", text: "茶几上的杯子裂了缝。" }),
  ]);
  const lines = draftText.split("\n");
  assert.equal(lines[0], "【场景：卧室】");
  assert.equal(lines[1], "分镜：中景，林川站在窗前看向楼下的街道");
  assert.equal(lines[2], "旁白：夜色里街道空无一人。");
  // 第二单元同场景：不再输出场景行，直接以分镜行开头
  assert.ok(draftText.includes("\n\n分镜：近景"));
  // 换场到客厅：只有一次客厅场景行
  assert.equal(draftText.split("【场景：客厅】").length - 1, 1);
  // 台词行带神态括注
  assert.ok(draftText.includes("林川（压抑怒气）：你不该回来。"));
  // 第四单元同场景直接分镜行
  assert.ok(draftText.includes("\n\n分镜：特写"));
});

test("serializeDraftSegments 无风格字段（v8 移除），不输出【风格】行", () => {
  // v7 旧结构化结果可能带 styleSwitch：序列化器不再认识它，原样忽略不产出标记。
  const draftText = serializeDraftSegments([
    makeSegment(),
    makeSegment({ storyboard: "街道上火光冲天", text: "城市在三天内陷落。", styleSwitch: "写实末日" }),
  ]);
  assert.ok(!draftText.includes("【风格"));
});

test("serializeDraftSegments 角色状态切换输出【角色状态】行，同角色同状态不重复", () => {
  const draftText = serializeDraftSegments([
    makeSegment(),
    makeSegment({
      storyboard: "林川被碎石砸中倒地",
      stateSwitches: [{ name: "林川", state: "重伤" }, { name: "苏叶", state: "沾血" }],
      text: "爆炸掀翻了半条街。",
    }),
    makeSegment({ stateSwitches: [{ name: "林川", state: "重伤" }], text: "他撑着墙站起来。" }),
    makeSegment({ stateSwitches: [{ name: "林川", state: "" }], text: "无论如何先离开这里。" }),
  ]);
  assert.ok(draftText.includes("【角色状态：林川：重伤】"));
  assert.ok(draftText.includes("【角色状态：苏叶：沾血】"));
  // 重复同状态与空状态都被折叠
  assert.equal(draftText.split("【角色状态：林川：重伤】").length - 1, 1);
  assert.ok(!draftText.includes("：】"));
});

test("serializeDraftSegments 切换行顺序：场景 → 角色状态 → 分镜", () => {
  const draftText = serializeDraftSegments([
    makeSegment({ scene: "天台", stateSwitches: [{ name: "林川", state: "癫狂" }] }),
  ]);
  const lines = draftText.split("\n");
  assert.equal(lines[0], "【场景：天台】");
  assert.equal(lines[1], "【角色状态：林川：癫狂】");
  assert.ok(lines[2].startsWith("分镜："));
});

test("serializeDraftSegments scene 为空串时不输出场景行（旧数据兜底）", () => {
  const draftText = serializeDraftSegments([
    makeSegment({ scene: "" }),
    makeSegment({ scene: "" }),
  ]);
  assert.ok(!draftText.includes("【场景"));
  assert.ok(draftText.startsWith("分镜："));
});
