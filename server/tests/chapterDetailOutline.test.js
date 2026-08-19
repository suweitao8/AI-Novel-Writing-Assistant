const test = require("node:test");
const assert = require("node:assert/strict");

// 单章细纲（novel.chapter.detail_outline@v1）：schema 边界与 postValidate 行为。

const { chapterDetailOutlinePrompt } = require("../dist/prompting/prompts/novel/chapterDetailOutline.prompts.js");
const { promptAssetLoaderEntries } = require("../dist/prompting/registry/promptAssetLoaderEntries.js");

function makeBeats(count) {
  return Array.from({ length: count }, (_, index) => ({
    summary: `第${index + 1}拍：主角推进调查并发现线索${index}`,
    keyEvent: index % 2 === 0 ? `关键事件${index}` : null,
  }));
}

test("prompt 注册进 loader registry（novel.chapter.detail_outline@v1）", () => {
  const keys = promptAssetLoaderEntries.map((entry) => entry.key);
  assert.ok(keys.includes("novel.chapter.detail_outline@v1"), "缺少 novel.chapter.detail_outline@v1 注册");
});

test("outputSchema 接受 3～10 拍且 keyEvent 可空", () => {
  const parsed = chapterDetailOutlinePrompt.outputSchema.parse({ beats: makeBeats(5), notes: "补充说明" });
  assert.equal(parsed.beats.length, 5);
  assert.equal(parsed.beats[0].keyEvent, "关键事件0");
  assert.equal(parsed.beats[1].keyEvent, null);
});

test("outputSchema 拒绝 2 拍与 11 拍", () => {
  assert.throws(() => chapterDetailOutlinePrompt.outputSchema.parse({ beats: makeBeats(2), notes: null }));
  assert.throws(() => chapterDetailOutlinePrompt.outputSchema.parse({ beats: makeBeats(11), notes: null }));
});

test("postValidate 拒绝重复节拍", () => {
  const beats = [
    { summary: "主角进入废弃医院查看现场", keyEvent: null },
    { summary: "主角进入废弃医院查看现场", keyEvent: "同一拍重复" },
    { summary: "主角发现墙上的刻痕指向地下室", keyEvent: null },
  ];
  const parsed = chapterDetailOutlinePrompt.outputSchema.parse({ beats, notes: null });
  assert.throws(() => chapterDetailOutlinePrompt.postValidate(parsed, {}, {}));
});

test("render 注入大纲与前后章上下文", () => {
  const messages = chapterDetailOutlinePrompt.render({
    novelTitle: "夜航",
    chapterTitle: "雨夜的第一个委托",
    chapterOrder: 3,
    chapterSynopsis: "主角接到第一单委托，在雨夜见到了委托人。",
    previousChapterSummary: "第2章：主角抵达城市",
    nextChapterSummary: "第4章：委托出现反转",
  });
  assert.equal(messages.length, 2);
  const human = messages[1].content;
  assert.ok(human.includes("雨夜的第一个委托"));
  assert.ok(human.includes("第2章：主角抵达城市"));
  assert.ok(human.includes("第4章：委托出现反转"));
});
