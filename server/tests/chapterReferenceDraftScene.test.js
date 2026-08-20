const test = require("node:test");
const assert = require("node:assert/strict");

// 分镜式初稿 v6：scene 字段契约与【场景：…】换场标记序列化。

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

test("prompt 资产为 v6 且 scene 必填", () => {
  assert.equal(chapterReferenceDraftPrompt.version, "v6");
  assert.throws(() => chapterReferenceDraftPrompt.outputSchema.parse({
    segments: [makeSegment({ scene: undefined })],
  }));
  const parsed = chapterReferenceDraftPrompt.outputSchema.parse({
    segments: Array.from({ length: 8 }, () => makeSegment()),
  });
  assert.equal(parsed.segments[0].scene, "卧室");
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

test("serializeDraftSegments scene 为空串时不输出场景行（旧数据兜底）", () => {
  const draftText = serializeDraftSegments([
    makeSegment({ scene: "" }),
    makeSegment({ scene: "" }),
  ]);
  assert.ok(!draftText.includes("【场景"));
  assert.ok(draftText.startsWith("分镜："));
});
