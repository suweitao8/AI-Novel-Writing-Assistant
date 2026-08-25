import assert from "node:assert/strict";
import test from "node:test";

import {
  SELECTION_RING_INNER_RADIUS,
  SELECTION_RING_OUTER_RADIUS,
  SELECTION_RING_SEGMENTS,
  createSelectionRingGeometryData,
} from "./blocking3dSelectionRing.ts";

function position(data, index) {
  return data.positions.slice(index * 3, index * 3 + 3);
}

test("选中角色标记使用空心环形几何，中心不生成面", () => {
  const data = createSelectionRingGeometryData();
  const ringSize = SELECTION_RING_SEGMENTS + 1;
  const vertexCount = data.positions.length / 3;

  assert.equal(vertexCount, ringSize * 2);
  assert.equal(data.indices.length, SELECTION_RING_SEGMENTS * 6);
  assert.ok(data.indices.every((index) => index >= 0 && index < vertexCount));

  const outer = position(data, 0);
  const inner = position(data, ringSize);
  assert.ok(Math.abs(Math.hypot(outer[0], outer[2]) - SELECTION_RING_OUTER_RADIUS) < 1e-8);
  assert.ok(Math.abs(Math.hypot(inner[0], inner[2]) - SELECTION_RING_INNER_RADIUS) < 1e-8);
  assert.ok(data.positions.every((value, index) => index % 3 !== 1 || value === 0));

  const firstTriangle = data.indices.slice(0, 3).map((index) => position(data, index));
  const edgeA = firstTriangle[1].map((value, index) => value - firstTriangle[0][index]);
  const edgeB = firstTriangle[2].map((value, index) => value - firstTriangle[0][index]);
  const normalY = edgeA[2] * edgeB[0] - edgeA[0] * edgeB[2];
  assert.ok(normalY > 0, "环面应朝向上方，避免默认背面剔除后不可见");
});
