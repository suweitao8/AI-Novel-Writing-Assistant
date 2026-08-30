import assert from "node:assert/strict";
import test from "node:test";

import {
  formatModelDimension,
  getNormalizedModelBounds,
  summarizeModelGeometry,
} from "./modelGeometryStats.ts";

test("模型几何统计按唯一顶点缓冲区计数，并按 X/Z/Y 输出长宽高", () => {
  const sharedVertexBuffer = {};
  const stats = summarizeModelGeometry([
    {
      vertexBuffer: sharedVertexBuffer,
      vertexCount: 12,
      bounds: { min: [-1, 0, -2], max: [1, 3, 2] },
    },
    {
      vertexBuffer: sharedVertexBuffer,
      vertexCount: 12,
      bounds: { min: [-0.5, 0.5, -1], max: [0.5, 2, 1] },
    },
    {
      vertexBuffer: {},
      vertexCount: 5,
      bounds: { min: [-2, -1, -0.5], max: [2, 1, 0.5] },
    },
  ], 0.01);

  assert.ok(stats);
  assert.equal(stats.vertexCount, 17);
  assert.deepEqual(stats.bounds.min, [-0.02, -0.01, -0.02]);
  assert.deepEqual(stats.bounds.max, [0.02, 0.03, 0.02]);
  assert.deepEqual(stats.dimensions, {
    length: 0.04,
    width: 0.04,
    height: 0.04,
  });
  assert.deepEqual(getNormalizedModelBounds(stats).min, [-0.02, 0, -0.02]);
  assert.deepEqual(getNormalizedModelBounds(stats).max, [0.02, 0.04, 0.02]);
});

test("模型尺寸显示最多保留两位小数并使用米制单位", () => {
  assert.equal(formatModelDimension(1.234), "1.23 米");
  assert.equal(formatModelDimension(2), "2 米");
  assert.equal(formatModelDimension(0), "0 米");
});

test("没有有效网格时不伪造几何统计", () => {
  assert.equal(summarizeModelGeometry([]), null);
});
