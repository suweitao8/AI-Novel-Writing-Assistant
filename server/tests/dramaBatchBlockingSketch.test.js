const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(
  path.join(__dirname, "../src/services/drama/production/DramaBatchOrchestrator.ts"),
  "utf8",
);

test("批量首帧跳过尚未确认的摆位草图，不把它计为失败或图片成本", () => {
  assert.match(source, /isDraftBlockingSketch/);
  assert.match(source, /return "skipped"/);
  assert.match(source, /!hasDoneKeyframe\(shot\.keyframeData\) && !isDraftBlockingSketch\(shot\.blockingSketchData\)/);
});
