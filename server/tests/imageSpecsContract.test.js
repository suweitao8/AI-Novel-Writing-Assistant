const test = require("node:test");
const assert = require("node:assert/strict");

// 生图规格规范契约（imageSpecs.ts 为唯一来源，对齐旧项目 mydrama 的固定画幅约定）：
// 设计参考类横版、阅读消费类竖版、头像类方图。改动规格前必须同步 UI 展示比例。

const { IMAGE_SPECS } = require("../dist/services/image/imageSpecs.js");

test("设计参考类生图固定横版；场景全景是 2:1 等距柱状（2026-08-23 用户要求）", () => {
  assert.equal(IMAGE_SPECS.characterSheet, "1536x1024");
  assert.equal(IMAGE_SPECS.scenePanorama, "2048x1024");
  assert.equal(IMAGE_SPECS.characterAsset, "1536x1024");
});

test("阅读消费类生图固定竖版（漫剧首帧/分格兜底/封面）", () => {
  assert.equal(IMAGE_SPECS.dramaKeyframe, "1024x1536");
  assert.equal(IMAGE_SPECS.comicPanelFallback, "1024x1536");
  assert.equal(IMAGE_SPECS.novelCover, "1024x1536");
});

test("规格值都必须在 IMAGE_SIZES 白名单内", () => {
  const { IMAGE_SIZES } = require("../dist/services/image/types.js");
  const allowed = new Set(IMAGE_SIZES);
  for (const [key, value] of Object.entries(IMAGE_SPECS)) {
    assert.ok(allowed.has(value), `${key}=${value} 不在 IMAGE_SIZES 白名单内`);
  }
});
