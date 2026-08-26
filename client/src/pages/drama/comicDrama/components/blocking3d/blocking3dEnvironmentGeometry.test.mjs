import assert from "node:assert/strict";
import test from "node:test";

import {
  GROUND_DOME_RIM_BANDS,
  GROUND_DOME_FLAT_RADIUS,
  LONGITUDE_BANDS,
  UPPER_DOME_LATITUDE_BANDS,
  createBackdropGeometryData,
  createGroundDomeGeometryData,
  getGroundDomeEdgeHeight,
} from "./blocking3dEnvironmentGeometry.ts";

function vertex(data, index) {
  return {
    position: data.positions.slice(index * 3, index * 3 + 3),
  };
}

test("EnviroDome 上下表面共享唯一交界圈，避免两个网格的光栅缝", () => {
  const data = createBackdropGeometryData(2, 15);
  const ringSize = LONGITUDE_BANDS + 1;
  const seamRingStart = UPPER_DOME_LATITUDE_BANDS * ringSize;
  const seamHeight = getGroundDomeEdgeHeight(2, 15) * 0.5;
  const seamWorldHeight = seamHeight * 15;
  const seamVertices = [];

  for (let index = 0; index < data.positions.length / 3; index += 1) {
    const position = vertex(data, index).position;
    if (Math.abs(position[1] - seamHeight) < 1e-8) seamVertices.push(index);
  }

  assert.equal(seamVertices.length, ringSize, "交界圈只能存在一份顶点");
  assert.deepEqual(seamVertices, Array.from({ length: ringSize }, (_, offset) => seamRingStart + offset));
  assert.ok(Math.abs(seamWorldHeight - 2) < 1e-8, "交界圈应位于投射中心水平面");
  const upperIndexCount = UPPER_DOME_LATITUDE_BANDS * LONGITUDE_BANDS * 6;
  const firstLowerRingStart = (UPPER_DOME_LATITUDE_BANDS + 1) * ringSize;
  assert.deepEqual(
    data.indices.slice(upperIndexCount, upperIndexCount + 6),
    [seamRingStart + 1, firstLowerRingStart, seamRingStart, seamRingStart + 1, firstLowerRingStart + 1, firstLowerRingStart],
    "上半球和地面必须在同一份索引缓冲中连接",
  );
});

test("有效投射中心高度和半球直径都把交界圈放在投射中心水平面", () => {
  const ringSize = LONGITUDE_BANDS + 1;
  const seamRingStart = UPPER_DOME_LATITUDE_BANDS * ringSize;
  for (const [projectionCenterHeight, domeRadius] of [[1, 5], [2, 15], [10, 10], [10, 30]]) {
    const data = createBackdropGeometryData(projectionCenterHeight, domeRadius);
    const seamLocalY = vertex(data, seamRingStart).position[1];
    assert.ok(
      Math.abs(seamLocalY * domeRadius - projectionCenterHeight) < 1e-8,
      `交界圈高度应匹配投射中心: h=${projectionCenterHeight}, diameter=${domeRadius}`,
    );
  }
});

test("地面投影保留连续的半球拓扑，不退化成尖点或竖向拉伸", () => {
  const data = createGroundDomeGeometryData(2, 15);
  const vertexCount = data.positions.length / 3;
  const centerIndices = [];

  for (let index = 0; index < vertexCount; index += 1) {
    const { position } = vertex(data, index);
    if (Math.hypot(position[0], position[2]) < 1e-8) centerIndices.push(index);
  }

  assert.equal(centerIndices.length, 1, "平底中心应只有一个几何顶点");
  assert.equal(data.uvs.length, vertexCount * 2, "PlayCanvas 顶点流需要占位 UV");
  assert.ok(data.uvs.every((value) => value === 0), "地面占位 UV 必须保持常量，不能编码全景角度");
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

  assert.ok(data.uvs.every((value) => value === 0), "地面投影不应依赖顶点 UV 插值，否则中心会把角度映射成环状漩涡");
});

test("地面外圈以垂直切线接入半球，并平滑落到平底", () => {
  const projectionCenterHeight = 2;
  const domeRadius = 15;
  const data = createGroundDomeGeometryData(projectionCenterHeight, domeRadius);
  const ringSize = LONGITUDE_BANDS + 1;
  const firstVertexOfRing = (ring) => vertex(data, ring * ringSize).position;
  const radial = (position) => Math.hypot(position[0], position[2]);
  const outer = firstVertexOfRing(0);
  const first = firstVertexOfRing(1);
  const second = firstVertexOfRing(2);
  const inner = firstVertexOfRing(GROUND_DOME_RIM_BANDS);
  const outerRadialDrop = radial(outer) - radial(first);
  const nextRadialDrop = radial(first) - radial(second);
  const outerHeightDrop = outer[1] - first[1];
  const nextHeightDrop = first[1] - second[1];

  assert.ok(outerRadialDrop < nextRadialDrop, "接缝第一段应先沿垂直方向过渡，避免地面斜切半球边缘");
  assert.ok(outerHeightDrop > nextHeightDrop, "接缝第一段的高度变化应逐步放缓");
  assert.ok(Math.abs(outer[1] - getGroundDomeEdgeHeight(projectionCenterHeight, domeRadius) * 0.5) < 1e-8);
  assert.ok(Math.abs(inner[1]) < 1e-8, "外圈弧面应平滑落到平底高度");
});
