const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const read = (relativePath) => fs.readFileSync(path.join(__dirname, "../src", relativePath), "utf8");
const keyframeSource = read("services/drama/visual/DramaShotKeyframeService.ts");
const routeSource = read("modules/drama/http/dramaRoutes.ts");
const promptSource = read("prompting/prompts/drama/shotKeyframe.prompts.ts");
const registrySource = read("prompting/registry/promptAssetLoaderEntries.ts");

test("确认后的摆位草图排在首帧参考图第一位，并锁定构图", () => {
  assert.match(keyframeSource, /parseBlockingSketchData/);
  assert.match(keyframeSource, /isConfirmedBlockingSketch/);
  assert.match(keyframeSource, /kind: "layout_sketch"/);
  assert.match(keyframeSource, /refImages\.unshift\(blockingSketch\.url\)/);
  assert.match(keyframeSource, /referenceImages\.unshift/);
  assert.match(promptSource, /drama\.shot\.keyframe/);
  assert.match(promptSource, /第一张参考图是已确认的摆位草图/);
  assert.match(promptSource, /必须严格与它一致/);
  assert.match(promptSource, /lightingContract/);
  assert.match(registrySource, /drama\.shot\.keyframe@v4/);
});

test("已确认草图存在时场景整图不再作为参考图，避免画面退回场景原图", () => {
  // 场景整图的穹顶投影就是草图的来源，两者同时挂会让模型照抄场景图、丢掉摄像机取景。
  assert.match(keyframeSource, /matchedScene\?\.imageUrl && !blockingSketch/);
  assert.doesNotMatch(keyframeSource, /if \(matchedScene\?\.imageUrl\) \{\s*refImages\.push/);
});

test("草稿草图不会偷偷进入首帧生成", () => {
  assert.match(keyframeSource, /存在尚未确认的摆位草图/);
  assert.doesNotMatch(keyframeSource, /blockingSketch\.status === "draft"[\s\S]{0,240}refImages\.unshift/);
});

test("历史首帧如果原样复用了参考图，图片路由会隐藏它而不是回退到场景图", () => {
  assert.match(keyframeSource, /isExistingKeyframeReferencePassthrough/);
  assert.match(keyframeSource, /prepareReferenceImageFiles/);
  assert.match(keyframeSource, /fingerprintImageFile/);
  assert.match(routeSource, /isExistingKeyframeReferencePassthrough\(shotId, resolved\)/);
  assert.match(routeSource, /镜头 AI 首帧不可用，请重新生成/);
});
