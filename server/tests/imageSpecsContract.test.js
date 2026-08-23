const test = require("node:test");
const assert = require("node:assert/strict");

// 生图规格规范契约（imageSpecs.ts 为唯一来源，对齐旧项目 mydrama 的固定画幅约定）：
// 设计参考类横版、阅读消费类竖版、头像类方图。改动规格前必须同步 UI 展示比例。

const { IMAGE_SPECS } = require("../dist/services/image/imageSpecs.js");

test("角色、道具和分镜统一严格 16:9；场景全景保留 2:1 等距柱状", () => {
  assert.equal(IMAGE_SPECS.characterSheet, "1536x864");
  assert.equal(IMAGE_SPECS.scenePanorama, "2048x1024");
  assert.equal(IMAGE_SPECS.characterAsset, "1536x864");
  assert.equal(IMAGE_SPECS.dramaKeyframe, "1536x864");

  const parseSize = (value) => value.split("x").map(Number);
  for (const key of ["characterSheet", "characterAsset", "dramaKeyframe"]) {
    const [width, height] = parseSize(IMAGE_SPECS[key]);
    assert.equal(width / height, 16 / 9, `${key} 必须是严格 16:9`);
  }
  const [panoramaWidth, panoramaHeight] = parseSize(IMAGE_SPECS.scenePanorama);
  assert.equal(panoramaWidth / panoramaHeight, 2, "scenePanorama 必须是严格 2:1");
});

test("漫剧首帧与成片统一横版；封面仍保持竖版", () => {
  assert.equal(IMAGE_SPECS.dramaKeyframe, "1536x864");
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
