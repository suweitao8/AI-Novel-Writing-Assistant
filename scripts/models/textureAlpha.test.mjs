import assert from "node:assert/strict";
import test from "node:test";

import {
  getTextureOutputExtension,
  hasAlphaPixelFormat,
  parseAlphaMinimum,
  shouldPreserveAlpha,
} from "./textureAlpha.mjs";

test("识别 FFmpeg 的等号格式 alpha 统计并保留透明贴图", () => {
  const output = "lavfi.signalstats.YMIN=0\nlavfi.signalstats.YMAX=255";

  assert.equal(hasAlphaPixelFormat("rgba"), true);
  assert.equal(parseAlphaMinimum(output), 0);
  assert.equal(shouldPreserveAlpha({ pixelFormat: "rgba", ffmpegOutput: output }), true);
  assert.equal(getTextureOutputExtension({ pixelFormat: "rgba", ffmpegOutput: output }), "png");
});

test("兼容旧式冒号格式并拒绝把不透明贴图误当透明", () => {
  assert.equal(parseAlphaMinimum("YMIN: 255"), 255);
  assert.equal(shouldPreserveAlpha({ pixelFormat: "rgba", ffmpegOutput: "YMIN:255" }), false);
  assert.equal(getTextureOutputExtension({ pixelFormat: "yuvj444p", ffmpegOutput: "" }), "jpg");
});

test("alpha 统计缺失时采用保守策略，不能静默丢弃 alpha", () => {
  assert.equal(shouldPreserveAlpha({ pixelFormat: "rgba", ffmpegOutput: "" }), true);
  assert.equal(getTextureOutputExtension({ pixelFormat: "rgba", ffmpegOutput: "" }), "png");
});

test("法线和 RMA 等强制不透明贴图仍可输出 JPG", () => {
  assert.equal(
    getTextureOutputExtension({ pixelFormat: "rgba", ffmpegOutput: "YMIN=0", forceOpaque: true }),
    "jpg",
  );
});
