const test = require("node:test");
const assert = require("node:assert/strict");

// 分镜式初稿 v7：scene/styleSwitch/stateSwitches 契约与
// 【场景：…】【风格：…】【角色状态：…】切换标记序列化。

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

test("prompt 资产为 v7，scene 必填、风格/状态切换字段可缺省", () => {
  assert.equal(chapterReferenceDraftPrompt.version, "v7");
  assert.equal(
    promptAssetLoaderEntries.find((entry) => entry.key.startsWith("novel.chapter.reference_draft")).key,
    "novel.chapter.reference_draft@v7",
  );
  assert.throws(() => chapterReferenceDraftPrompt.outputSchema.parse({
    segments: [makeSegment({ scene: undefined })],
  }));
  const parsed = chapterReferenceDraftPrompt.outputSchema.parse({
    segments: Array.from({ length: 8 }, () => makeSegment()),
  });
  assert.equal(parsed.segments[0].scene, "卧室");
  // 风格/状态缺省时落到空串/空数组，旧结构化结果仍可解析
  assert.equal(parsed.segments[0].styleSwitch, "");
  assert.deepEqual(parsed.segments[0].stateSwitches, []);
  const withSwitches = chapterReferenceDraftPrompt.outputSchema.parse({
    segments: Array.from({ length: 8 }, (_, index) => index === 0
      ? makeSegment({ styleSwitch: "写实末日", stateSwitches: [{ name: "林川", state: "重伤" }] })
      : makeSegment()),
  });
  assert.equal(withSwitches.segments[0].styleSwitch, "写实末日");
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

test("serializeDraftSegments 风格切换输出【风格】行，重复同名切换被折叠", () => {
  const draftText = serializeDraftSegments([
    makeSegment(),
    makeSegment({ styleSwitch: "写实末日", storyboard: "街道上火光冲天", text: "城市在三天内陷落。" }),
    makeSegment({ styleSwitch: "写实末日", shot: "远景", text: "废墟上只剩下风声。" }),
    makeSegment({ styleSwitch: "3D写实电影", storyboard: "回忆里城市还在", text: "三个月前的街道。" }),
  ]);
  // 只在真正切换时输出：第一次「写实末日」一次、「3D写实电影」一次，第三单元重复不输出
  assert.equal(draftText.split("【风格：写实末日】").length - 1, 1);
  assert.equal(draftText.split("【风格：3D写实电影】").length - 1, 1);
  // 风格行在分镜行上方
  assert.ok(draftText.includes("【风格：写实末日】\n分镜："));
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

test("serializeDraftSegments 切换行顺序：场景 → 风格 → 角色状态 → 分镜", () => {
  const draftText = serializeDraftSegments([
    makeSegment({ scene: "天台", styleSwitch: "现代诡异", stateSwitches: [{ name: "林川", state: "癫狂" }] }),
  ]);
  const lines = draftText.split("\n");
  assert.equal(lines[0], "【场景：天台】");
  assert.equal(lines[1], "【风格：现代诡异】");
  assert.equal(lines[2], "【角色状态：林川：癫狂】");
  assert.ok(lines[3].startsWith("分镜："));
});

test("serializeDraftSegments scene 为空串时不输出场景行（旧数据兜底）", () => {
  const draftText = serializeDraftSegments([
    makeSegment({ scene: "" }),
    makeSegment({ scene: "" }),
  ]);
  assert.ok(!draftText.includes("【场景"));
  assert.ok(draftText.startsWith("分镜："));
});
