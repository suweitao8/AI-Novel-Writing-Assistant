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
  const data = createBackdropGeometryData(2, 7.5);
  const ringSize = LONGITUDE_BANDS + 1;
  const seamRingStart = UPPER_DOME_LATITUDE_BANDS * ringSize;
  const seamHeight = getGroundDomeEdgeHeight(2, 7.5) * 0.5;
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

test("有效投射中心高度和圆半径都把交界圈放在投射中心水平面", () => {
  const ringSize = LONGITUDE_BANDS + 1;
  const seamRingStart = UPPER_DOME_LATITUDE_BANDS * ringSize;
  for (const [projectionCenterHeight, radiusMeters] of [[1, 2.5], [2, 7.5], [10, 5], [10, 15]]) {
    const data = createBackdropGeometryData(projectionCenterHeight, radiusMeters);
    const seamLocalY = vertex(data, seamRingStart).position[1];
    assert.ok(
      Math.abs(seamLocalY * radiusMeters * 2 - projectionCenterHeight) < 1e-8,
      `交界圈高度应匹配投射中心: h=${projectionCenterHeight}, radius=${radiusMeters}`,
    );
  }
});

test("地面保留完整圆形平面拓扑，不把平面弯成碗状", () => {
  const data = createGroundDomeGeometryData(2, 7.5);
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

  const nonCenterRadial = Array.from({ length: vertexCount }, (_, index) => {
    const { position } = vertex(data, index);
    return { radial: Math.hypot(position[0], position[2]), y: position[1] };
  }).filter(({ radial }) => radial > 1e-8);
  assert.ok(nonCenterRadial.every(({ radial }) => Math.abs(radial - 0.5) < 1e-8), "圆墙和地面边界应保持同一圆周");
  assert.ok(nonCenterRadial.some(({ y }) => Math.abs(y) < 1e-8), "圆周必须落到地面平面高度");
  assert.equal(GROUND_DOME_FLAT_RADIUS, 0.95, "青色参考圈仍保留在平面内侧");
});

test("地面几何不编码全景 UV，避免中心插值造成漩涡", () => {
  const data = createGroundDomeGeometryData(2, 7.5);

  assert.ok(data.uvs.every((value) => value === 0), "地面投影不应依赖顶点 UV 插值，否则中心会把角度映射成环状漩涡");
});

test("地面外圈以垂直圆墙接入半球，底部保持完整平面", () => {
  const projectionCenterHeight = 2;
  const radiusMeters = 7.5;
  const data = createGroundDomeGeometryData(projectionCenterHeight, radiusMeters);
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

  assert.ok(Math.abs(outerRadialDrop) < 1e-8, "圆墙不应向中心收缩");
  assert.ok(Math.abs(nextRadialDrop) < 1e-8, "圆墙每一段都应保持同一半径");
  assert.ok(outerHeightDrop > 0, "圆墙应从地平线向下落到地面");
  assert.ok(Math.abs(outerHeightDrop - nextHeightDrop) < 1e-8, "圆墙高度应线性分段，不形成碗状曲面");
  assert.ok(Math.abs(outer[1] - getGroundDomeEdgeHeight(projectionCenterHeight, radiusMeters) * 0.5) < 1e-8);
  assert.ok(Math.abs(inner[1]) < 1e-8, "圆墙底边应落到平面高度");
});
