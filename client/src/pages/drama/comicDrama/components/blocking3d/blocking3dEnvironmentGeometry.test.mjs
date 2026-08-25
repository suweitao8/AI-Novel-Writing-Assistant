import assert from "node:assert/strict";
import test from "node:test";

import {
  GROUND_DOME_FLAT_RADIUS,
  LONGITUDE_BANDS,
  createGroundDomeGeometryData,
} from "./blocking3dEnvironmentGeometry.ts";

function vertex(data, index) {
  return {
    position: data.positions.slice(index * 3, index * 3 + 3),
    uv: data.uvs.slice(index * 2, index * 2 + 2),
  };
}

function positionKey(position) {
  return position.map((value) => (Math.abs(value) < 1e-8 ? "0" : value.toFixed(8))).join(",");
}

test("地面投影的经度接缝保持连续，不把整张图片拉成一条竖带", () => {
  const data = createGroundDomeGeometryData(2, 15);
  const vertexCount = data.positions.length / 3;
  const centerIndices = [];

  for (let index = 0; index < vertexCount; index += 1) {
    const { position } = vertex(data, index);
    if (Math.hypot(position[0], position[2]) < 1e-8) centerIndices.push(index);
  }

  assert.equal(centerIndices.length, 1, "平底中心应只有一个几何顶点");
  assert.deepEqual(vertex(data, centerIndices[0]).uv, [0.5, 1]);

  const positionGroups = new Map();
  for (let index = 0; index < vertexCount; index += 1) {
    const { position, uv } = vertex(data, index);
    const key = positionKey(position);
    const group = positionGroups.get(key) ?? [];
    group.push({ index, uv });
    positionGroups.set(key, group);
  }

  const seamPairs = [...positionGroups.values()].filter((group) => (
    group.length >= 2
    && group.some(({ uv }) => uv[0] < 0.01)
    && group.some(({ uv }) => uv[0] > 0.99)
  ));
  assert.ok(seamPairs.length > 0, "首尾经度需要在同一位置使用 0/1 两侧 UV");

  for (let offset = 0; offset < data.indices.length; offset += 3) {
    const triangle = data.indices.slice(offset, offset + 3);
    if (triangle.includes(centerIndices[0])) continue;
    const us = triangle.map((index) => vertex(data, index).uv[0]);
    assert.ok(
      Math.max(...us) - Math.min(...us) <= (1 / LONGITUDE_BANDS) + 1e-6,
      `非中心三角形跨越了过大的 U 范围: ${us.join(", ")}`,
    );
  }

  const maxRadial = Math.max(...Array.from({ length: vertexCount }, (_, index) => {
    const { position } = vertex(data, index);
    return Math.hypot(position[0], position[2]);
  }));
  assert.ok(maxRadial > GROUND_DOME_FLAT_RADIUS * 0.5, "地面应保留外圈弧面");
});
