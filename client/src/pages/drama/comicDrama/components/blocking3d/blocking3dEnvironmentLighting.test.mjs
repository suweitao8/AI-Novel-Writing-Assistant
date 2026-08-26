import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_HDRI_LIGHT_ESTIMATE,
  estimateHdriLightFromPixels,
} from "./blocking3dEnvironmentLighting.ts";

function image(width, height, color = [32, 32, 32, 255]) {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let offset = 0; offset < pixels.length; offset += 4) pixels.set(color, offset);
  return pixels;
}

function paint(pixels, width, x, y, color) {
  pixels.set(color, (y * width + x) * 4);
}

test("HDRI 上方右侧高亮区域会产生同方向的暖色主光", () => {
  const width = 32;
  const height = 16;
  const pixels = image(width, height);
  for (let y = 3; y <= 5; y += 1) {
    for (let x = 22; x <= 25; x += 1) paint(pixels, width, x, y, [255, 230, 80, 255]);
  }

  const estimate = estimateHdriLightFromPixels(pixels, width, height);

  assert.equal(estimate.usedFallback, false);
  assert.ok(estimate.direction[0] > 0.45, "亮部位于图像右侧时，光源方向应指向世界 +X");
  assert.ok(estimate.direction[1] > 0.35, "上方亮部应产生斜上方光源");
  assert.ok(Math.abs(estimate.direction[2]) < 0.35, "亮部接近 +X 方向时不应被错误推向前后");
  assert.ok(estimate.color[0] > estimate.color[1]);
  assert.ok(estimate.color[1] > estimate.color[2]);
  assert.ok(estimate.intensity >= 1 && estimate.intensity <= 2.2);
});

test("HDRI 经度首尾的高亮区域按球面方向连续合并", () => {
  const width = 32;
  const height = 16;
  const pixels = image(width, height);
  for (const x of [0, 1, 30, 31]) paint(pixels, width, x, 4, [255, 255, 255, 255]);

  const estimate = estimateHdriLightFromPixels(pixels, width, height);

  assert.equal(estimate.usedFallback, false);
  assert.ok(estimate.direction[2] < -0.7, "图像首尾应共同指向同一个 -Z 经度，而不是相互抵消");
  assert.ok(Math.abs(estimate.direction[0]) < 0.2);
});

test("没有可用高亮时使用稳定的后备主光，而不是生成异常方向", () => {
  const estimate = estimateHdriLightFromPixels(image(16, 8), 16, 8);

  assert.equal(estimate.usedFallback, true);
  assert.deepEqual(estimate.direction, DEFAULT_HDRI_LIGHT_ESTIMATE.direction);
  assert.equal(estimate.intensity, DEFAULT_HDRI_LIGHT_ESTIMATE.intensity);
  assert.ok(estimate.direction.every(Number.isFinite));
});

test("无效像素缓冲区同样安全降级", () => {
  const estimate = estimateHdriLightFromPixels(new Uint8ClampedArray(), 0, 0);

  assert.equal(estimate.usedFallback, true);
  assert.deepEqual(estimate.direction, DEFAULT_HDRI_LIGHT_ESTIMATE.direction);
});
