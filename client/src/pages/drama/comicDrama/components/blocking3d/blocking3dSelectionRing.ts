export const SELECTION_RING_SEGMENTS = 64;
export const SELECTION_RING_OUTER_RADIUS = 0.5;
export const SELECTION_RING_INNER_RADIUS = 0.4;

export interface Blocking3dSelectionRingGeometryData {
  positions: number[];
  normals: number[];
  uvs: number[];
  indices: number[];
}

export function createSelectionRingGeometryData(
  outerRadius = SELECTION_RING_OUTER_RADIUS,
  innerRadius = SELECTION_RING_INNER_RADIUS,
  segments = SELECTION_RING_SEGMENTS,
): Blocking3dSelectionRingGeometryData {
  if (!Number.isFinite(outerRadius) || !Number.isFinite(innerRadius) || outerRadius <= 0 || innerRadius <= 0 || innerRadius >= outerRadius) {
    throw new RangeError("选中圆环的内外半径必须为正数，且内半径小于外半径。");
  }
  if (!Number.isInteger(segments) || segments < 3) {
    throw new RangeError("选中圆环至少需要 3 个分段。");
  }

  const data: Blocking3dSelectionRingGeometryData = {
    positions: [],
    normals: [],
    uvs: [],
    indices: [],
  };
  const ringSize = segments + 1;

  for (const radius of [outerRadius, innerRadius]) {
    for (let segment = 0; segment <= segments; segment += 1) {
      const angle = (segment * Math.PI * 2) / segments;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      data.positions.push(x, 0, z);
      data.normals.push(0, 1, 0);
      data.uvs.push((x / outerRadius + 1) * 0.5, (z / outerRadius + 1) * 0.5);
    }
  }

  for (let segment = 0; segment < segments; segment += 1) {
    const outer = segment;
    const nextOuter = segment + 1;
    const inner = ringSize + segment;
    const nextInner = ringSize + segment + 1;
    data.indices.push(outer, inner, nextOuter);
    data.indices.push(inner, nextInner, nextOuter);
  }

  return data;
}
