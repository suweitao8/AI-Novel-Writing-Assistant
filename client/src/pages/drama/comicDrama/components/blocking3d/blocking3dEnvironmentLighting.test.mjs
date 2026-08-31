import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_HDRI_LIGHT_ESTIMATE,
  estimateHdriLightFromTexture,
  estimateHdriLightFromPixels,
  rotateHdriLightDirectionAzimuth,
} from "./blocking3dEnvironmentLighting.ts";
import { projectEquirectangularDirection } from "./blocking3dEnvironmentProjection.ts";

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

test("PlayCanvas RGBE HDRI 源会解码亮区并与可见等距投影保持同向", () => {
  const width = 32;
  const height = 16;
  const pixels = new Uint8Array(width * height * 4);
  for (let offset = 0; offset < pixels.length; offset += 4) {
    pixels.set([8, 8, 8, 128], offset);
  }
  for (let y = 2; y <= 4; y += 1) {
    for (let x = 22; x <= 25; x += 1) {
      pixels.set([255, 230, 80, 140], (y * width + x) * 4);
    }
  }

  const estimate = estimateHdriLightFromTexture({
    width,
    height,
    type: "rgbe",
    getSource: () => pixels,
  });
  const projected = projectEquirectangularDirection(estimate.direction);

  assert.equal(estimate.usedFallback, false);
  assert.ok(estimate.direction[0] > 0.45, "右上亮区应指向世界 +X");
  assert.ok(estimate.direction[1] > 0.35, "上方亮区应保持正向高度");
  assert.ok(Math.abs(projected.u - 0.75) < 0.04, "方向光经度应落回亮区所在的图像经度");
  assert.ok(Math.abs(projected.v - 0.21875) < 0.04, "方向光纬度应落回亮区所在的图像纬度");
});

test("亮度已归一化到 1 的 RGBE HDRI 仍能识别局部太阳亮区", () => {
  const width = 32;
  const height = 16;
  const pixels = new Uint8Array(width * height * 4);
  for (let offset = 0; offset < pixels.length; offset += 4) {
    pixels.set([180, 180, 180, 128], offset);
  }
  for (let y = 3; y <= 4; y += 1) {
    for (let x = 27; x <= 29; x += 1) {
      pixels.set([255, 255, 255, 128], (y * width + x) * 4);
    }
  }

  const estimate = estimateHdriLightFromTexture({
    width,
    height,
    type: "rgbe",
    getSource: () => pixels,
  });
  const projected = projectEquirectangularDirection(estimate.direction);

  assert.equal(estimate.usedFallback, false);
  assert.ok(projected.u > 0.78, "局部亮区位于右侧时，方向光不能退回固定后备方向");
  assert.ok(projected.v < 0.35, "局部亮区位于上方时，方向光应保持在天空方向");
});

test("RGBE 主光与环境地平线偏移使用同一套纬度坐标", () => {
  const width = 32;
  const height = 16;
  const pixels = new Uint8Array(width * height * 4);
  for (let offset = 0; offset < pixels.length; offset += 4) {
    pixels.set([180, 180, 180, 128], offset);
  }
  for (let y = 7; y <= 8; y += 1) {
    for (let x = 27; x <= 29; x += 1) {
      pixels.set([255, 255, 255, 128], (y * width + x) * 4);
    }
  }

  const panoramaHorizonV = 0.55;
  const estimate = estimateHdriLightFromTexture(
    {
      width,
      height,
      type: "rgbe",
      getSource: () => pixels,
    },
    panoramaHorizonV,
  );
  const projected = projectEquirectangularDirection(estimate.direction, panoramaHorizonV);

  assert.equal(estimate.usedFallback, false);
  assert.ok(Math.abs(projected.v - 0.46875) < 0.04, "主光纬度应与带偏移的可见 HDRI 位置一致");
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

test("模型预览主光旋转 180° 时只翻转水平来向并保持上方高度", () => {
  const direction = [0.45, 0.72, 0.5];
  const rotated = rotateHdriLightDirectionAzimuth(direction, 180);

  assert.ok(Math.abs(rotated[0] + direction[0]) < 1e-10);
  assert.equal(rotated[1], direction[1]);
  assert.ok(Math.abs(rotated[2] + direction[2]) < 1e-10);
  assert.ok(
    Math.abs(Math.hypot(...rotated) - Math.hypot(...direction)) < 1e-10,
    "水平偏转不能改变方向向量长度",
  );
});

test("主光方位偏转为 0° 时保持 HDRI 估算方向", () => {
  const direction = [0.45, 0.72, 0.5];

  assert.deepEqual(rotateHdriLightDirectionAzimuth(direction, 0), direction);
});
