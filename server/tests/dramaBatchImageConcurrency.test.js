const assert = require("node:assert/strict");
const test = require("node:test");

const {
  DEFAULT_DRAMA_KEYFRAME_BATCH_CONCURRENCY,
  MAX_DRAMA_KEYFRAME_BATCH_CONCURRENCY,
  MIN_DRAMA_KEYFRAME_BATCH_CONCURRENCY,
  normalizeDramaKeyframeBatchConcurrency,
} = require("../dist/services/drama/production/dramaBatchConcurrency.js");

test("关键帧批量默认使用图片桥安全上限 4 路", () => {
  assert.equal(DEFAULT_DRAMA_KEYFRAME_BATCH_CONCURRENCY, 4);
  assert.equal(MAX_DRAMA_KEYFRAME_BATCH_CONCURRENCY, 4);
  assert.equal(MIN_DRAMA_KEYFRAME_BATCH_CONCURRENCY, 1);
  assert.equal(normalizeDramaKeyframeBatchConcurrency(undefined), 4);
});

test("关键帧批量并发值始终被裁剪到 1-4 的整数", () => {
  assert.equal(normalizeDramaKeyframeBatchConcurrency(0), 1);
  assert.equal(normalizeDramaKeyframeBatchConcurrency(-3), 1);
  assert.equal(normalizeDramaKeyframeBatchConcurrency(2.9), 2);
  assert.equal(normalizeDramaKeyframeBatchConcurrency(99), 4);
  assert.equal(normalizeDramaKeyframeBatchConcurrency("not-a-number"), 4);
});
