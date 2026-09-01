import assert from "node:assert/strict";
import test from "node:test";

import {
  clampAnimationFrame,
  frameToSeconds,
  getAnimationFrameCount,
  getDefaultAnimationFrame,
  inferAnimationFrameRate,
  secondsToFrame,
} from "./animationFrame.ts";

test("24fps 和 30fps 的总帧数包含 0 帧与末帧", () => {
  assert.equal(getAnimationFrameCount(1, 24), 25);
  assert.equal(getAnimationFrameCount(2.5, 30), 76);
});

test("默认预览帧是最后一帧的 50%", () => {
  assert.equal(getDefaultAnimationFrame(1, 24), 12);
  assert.equal(getDefaultAnimationFrame(2.5, 30), 38);
});

test("帧与秒换算会按片段边界裁剪", () => {
  assert.equal(frameToSeconds(-1, 24, 1), 0);
  assert.equal(frameToSeconds(99, 24, 1), 1);
  assert.equal(secondsToFrame(-1, 24, 1), 0);
  assert.equal(secondsToFrame(99, 24, 1), 24);
  assert.equal(clampAnimationFrame(4.6, 5), 5);
});

test("循环模式在片段时长边界回到第 0 帧，单次播放保留末帧", () => {
  assert.equal(secondsToFrame(1, 24, 1, true), 0);
  assert.equal(secondsToFrame(1 - 0.0001, 24, 1, true), 24);
  assert.equal(secondsToFrame(1, 24, 1, false), 24);
});

test("从 AnimTrack 的单值输入采样间隔推断真实帧率", () => {
  assert.equal(
    inferAnimationFrameRate({ inputs: [{ components: 1, data: [0, 1 / 24, 2 / 24] }] }, 30),
    24,
  );
  assert.equal(inferAnimationFrameRate({ inputs: [] }, 30), 30);
});

test("异常输入不会产生非有限帧值", () => {
  assert.equal(getAnimationFrameCount(Number.NaN, Number.POSITIVE_INFINITY), 1);
  assert.equal(getDefaultAnimationFrame(Number.NaN, 30), 0);
  assert.equal(secondsToFrame(Number.NaN, 30, 1), 0);
});
