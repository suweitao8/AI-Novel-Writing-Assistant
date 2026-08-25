import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_HDRI_LIGHT_ESTIMATE,
  estimateHdriLightDirection,
} from "../src/pages/drama/comicDrama/components/blocking3d/blocking3dEnvironmentMath.ts";

function imageWithBrightPixel(width, height, brightX, brightY) {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < pixels.length; index += 4) {
    pixels[index] = 20;
    pixels[index + 1] = 24;
    pixels[index + 2] = 30;
    pixels[index + 3] = 255;
  }
  const offset = (brightY * width + brightX) * 4;
  pixels[offset] = 255;
  pixels[offset + 1] = 220;
  pixels[offset + 2] = 180;
  return pixels;
}

test("HDRI 高亮区域决定斜上方主光方向", () => {
  const left = estimateHdriLightDirection(imageWithBrightPixel(8, 4, 1, 0), 8, 4);
  const right = estimateHdriLightDirection(imageWithBrightPixel(8, 4, 6, 0), 8, 4);

  assert.ok(left.direction[1] > 0, "左侧高亮应来自上方");
  assert.ok(right.direction[1] > 0, "右侧高亮应来自上方");
  assert.ok(left.direction[0] > right.direction[0], "左右高亮应产生相反的水平光向");
});

test("HDRI 无法读取有效像素时使用稳定后备光向", () => {
  assert.deepEqual(
    estimateHdriLightDirection(new Uint8ClampedArray(), 0, 0),
    DEFAULT_HDRI_LIGHT_ESTIMATE,
  );
});
