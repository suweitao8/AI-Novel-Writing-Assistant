const test = require("node:test");
const assert = require("node:assert/strict");

// 小说设定角色 → 漫画视觉锚点的桥：面部锚点与年龄段必须进入设定图基准。
test("comic visual anchor carries face prompt and age group from novel source character", () => {
  const { buildComicVisualAnchor } = require("../dist/services/comic/ComicProjectService.js");

  const anchorJson = buildComicVisualAnchor({
    name: "陈默",
    gender: "male",
    ageGroup: "youth",
    persona: "主角｜话少但可靠",
    visualHint: "男性，二十多岁，黑色短发，单眼皮，浅麦肤色，长脸，洗旧的连帽衫",
    facePrompt: "男性，二十多岁，黑色短发，单眼皮，浅麦肤色，长脸",
    sourceCharacterRef: "char_1",
  });
  assert.ok(anchorJson);
  const anchor = JSON.parse(anchorJson);
  assert.match(anchor.description, /青年/);
  assert.match(anchor.visualSpec.appearance, /男性，二十多岁，黑色短发/);
  assert.match(anchor.visualSpec.signatureFeatures, /黑色短发/);
  assert.equal(anchor.defaultCostume.id, "default");
  assert.equal(anchor.behaviorSignature.persona, "主角｜话少但可靠");
});

test("comic visual anchor falls back to visual hint when face prompt is absent", () => {
  const { buildComicVisualAnchor } = require("../dist/services/comic/ComicProjectService.js");

  const anchorJson = buildComicVisualAnchor({
    name: "林月",
    gender: "female",
    persona: "主角｜外冷内热",
    visualHint: "短发，深色风衣，眼神锐利",
  });
  assert.ok(anchorJson);
  const anchor = JSON.parse(anchorJson);
  assert.match(anchor.visualSpec.appearance, /短发，深色风衣/);
  assert.ok(!anchor.description.includes("青年"));
});

test("comic visual anchor returns null for empty source character", () => {
  const { buildComicVisualAnchor } = require("../dist/services/comic/ComicProjectService.js");
  assert.equal(buildComicVisualAnchor({ name: "无名" }), null);
});
