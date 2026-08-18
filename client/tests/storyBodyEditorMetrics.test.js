import test from "node:test";
import assert from "node:assert/strict";
import {
  buildContinuousText,
  buildDisplayText,
  countLogicalLines,
  countTextMetrics,
  findTextMatches,
  getSegmentOffsets,
  offsetToLineCol,
} from "../src/pages/shortStory/components/storyBodyEditor/storyTextMetrics.ts";

test("buildContinuousText keeps server semantics: trim, drop empty, join with blank line", () => {
  const segments = [
    { id: "s1", content: "  第一段内容  " },
    { id: "s2", content: "" },
    { id: "s3", content: "第三段" },
  ];
  assert.equal(buildContinuousText(segments, {}), "第一段内容\n\n第三段");
  assert.equal(buildContinuousText(segments, { s2: "草稿插入" }), "第一段内容\n\n草稿插入\n\n第三段");
});

test("countTextMetrics reports chars without whitespace plus lines and paragraphs", () => {
  const text = "夜色渐深。\n\n他推开门，屋里空无一人。\n\n风把窗帘吹起。";
  const metrics = countTextMetrics(text);
  assert.equal(metrics.chars, text.replace(/\s+/g, "").length);
  assert.equal(metrics.lines, 5);
  assert.equal(metrics.paragraphs, 3);
  assert.deepEqual(countTextMetrics("   \n  "), { chars: 0, lines: 0, paragraphs: 0 });
});

test("findTextMatches is case-insensitive, non-overlapping and rejects newline keywords", () => {
  const text = "林越是主角，林越的剑很旧。";
  assert.deepEqual(findTextMatches(text, "林越"), [
    { start: 0, end: 2 },
    { start: 6, end: 8 },
  ]);
  assert.deepEqual(findTextMatches(text, "  林越  "), [
    { start: 0, end: 2 },
    { start: 6, end: 8 },
  ]);
  assert.deepEqual(findTextMatches(text, "MISSING"), []);
  assert.deepEqual(findTextMatches(text, "林\n越"), []);
  assert.deepEqual(findTextMatches(text, "  "), []);
});

test("offsetToLineCol maps caret offset to one-based line and column", () => {
  const text = "abc\ndef\ngh";
  assert.deepEqual(offsetToLineCol(text, 0), { line: 1, column: 1 });
  assert.deepEqual(offsetToLineCol(text, 2), { line: 1, column: 3 });
  assert.deepEqual(offsetToLineCol(text, 4), { line: 2, column: 1 });
  assert.deepEqual(offsetToLineCol(text, 9), { line: 3, column: 2 });
  assert.deepEqual(offsetToLineCol(text, 999), { line: 3, column: 3 });
});

test("segment offsets stay consistent with display text lines and columns", () => {
  const draftList = ["第一行\n第二行", "", "末段"];
  const display = buildDisplayText(draftList);
  const offsets = getSegmentOffsets(draftList);

  assert.equal(display, "第一行\n第二行\n\n\n\n末段");
  assert.equal(offsets[0].startLine, 1);
  assert.equal(offsets[1].startLine, 4);
  assert.equal(offsets[2].startLine, 6);

  // 空段本体落在 display 文本第 4 行第 1 列（两侧 \n\n 分隔融合成 3 个连续空行）
  assert.deepEqual(offsetToLineCol(display, offsets[1].startOffset), { line: 4, column: 1 });
  // 第三段首个字符的行列与该段起始行号一致
  assert.deepEqual(offsetToLineCol(display, offsets[2].startOffset), { line: 6, column: 1 });
});

test("countLogicalLines handles empty text and trailing newline", () => {
  assert.equal(countLogicalLines(""), 0);
  assert.equal(countLogicalLines("单行"), 1);
  assert.equal(countLogicalLines("a\nb"), 2);
  assert.equal(countLogicalLines("a\n"), 2);
});
