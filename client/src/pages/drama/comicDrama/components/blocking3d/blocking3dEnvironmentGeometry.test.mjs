import assert from "node:assert/strict";
import test from "node:test";

import {
  GROUND_DOME_FLAT_RADIUS,
  createGroundDomeGeometryData,
} from "./blocking3dEnvironmentGeometry.ts";

function vertex(data, index) {
  return {
    position: data.positions.slice(index * 3, index * 3 + 3),
  };
}

test("地面投影保留连续的半球拓扑，不退化成尖点或竖向拉伸", () => {
  const data = createGroundDomeGeometryData(2, 15);
  const vertexCount = data.positions.length / 3;
  const centerIndices = [];

  for (let index = 0; index < vertexCount; index += 1) {
    const { position } = vertex(data, index);
    if (Math.hypot(position[0], position[2]) < 1e-8) centerIndices.push(index);
  }

  assert.equal(centerIndices.length, 1, "平底中心应只有一个几何顶点");
  assert.equal(data.uvs.length, 0, "地面贴图由投影材质计算，不应携带顶点 UV");
  assert.equal(data.indices.length % 3, 0, "地面索引必须组成完整三角形");
  assert.ok(data.indices.every((index) => index >= 0 && index < vertexCount), "地面索引不得越界");

  const maxRadial = Math.max(...Array.from({ length: vertexCount }, (_, index) => {
    const { position } = vertex(data, index);
    return Math.hypot(position[0], position[2]);
  }));
  assert.ok(maxRadial > GROUND_DOME_FLAT_RADIUS * 0.5, "地面应保留外圈弧面");
});

test("地面全景贴图由投影材质按世界坐标计算，不把经度 UV 写进顶点", () => {
  const data = createGroundDomeGeometryData(2, 15);

  assert.equal(
    data.uvs.length,
    0,
    "地面投影不应依赖顶点 UV 插值，否则中心会把角度映射成环状漩涡",
  );
});
