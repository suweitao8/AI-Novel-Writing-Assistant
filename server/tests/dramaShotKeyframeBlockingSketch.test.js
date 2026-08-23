const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const read = (relativePath) => fs.readFileSync(path.join(__dirname, "../src", relativePath), "utf8");
const keyframeSource = read("services/drama/visual/DramaShotKeyframeService.ts");
const promptSource = read("prompting/prompts/drama/shotKeyframe.prompts.ts");
const registrySource = read("prompting/registry/promptAssetLoaderEntries.ts");

test("确认后的摆位草图排在首帧参考图第一位，并锁定构图", () => {
  assert.match(keyframeSource, /parseBlockingSketchData/);
  assert.match(keyframeSource, /isConfirmedBlockingSketch/);
  assert.match(keyframeSource, /kind: "layout_sketch"/);
  assert.match(keyframeSource, /refImages\.unshift\(blockingSketch\.url\)/);
  assert.match(keyframeSource, /referenceImages\.unshift/);
  assert.match(promptSource, /drama\.shot\.keyframe/);
  assert.match(promptSource, /锁定摆位草图/);
  assert.match(registrySource, /drama\.shot\.keyframe@v1/);
});

test("草稿草图不会偷偷进入首帧生成", () => {
  assert.match(keyframeSource, /存在尚未确认的摆位草图/);
  assert.doesNotMatch(keyframeSource, /blockingSketch\.status === "draft"[\s\S]{0,240}refImages\.unshift/);
});
