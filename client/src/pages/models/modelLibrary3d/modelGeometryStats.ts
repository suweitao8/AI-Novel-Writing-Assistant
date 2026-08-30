export type ModelGeometryVector = [number, number, number];

export interface ModelGeometryBounds {
  min: ModelGeometryVector;
  max: ModelGeometryVector;
}

export interface ModelGeometryPart {
  /** 用于避免同一顶点缓冲区被多个 mesh instance 重复统计。 */
  vertexBuffer: unknown;
  vertexCount: number;
  bounds: ModelGeometryBounds;
}

export interface ModelGeometryStats {
  vertexCount: number;
  bounds: ModelGeometryBounds;
  /** 长=X，宽=Z，高=Y，单位为米。 */
  dimensions: {
    length: number;
    width: number;
    height: number;
  };
}

function isFiniteVector(vector: ModelGeometryVector): boolean {
  return vector.every((value) => Number.isFinite(value));
}

function isValidBounds(bounds: ModelGeometryBounds): boolean {
  return isFiniteVector(bounds.min)
    && isFiniteVector(bounds.max)
    && bounds.min.every((value, index) => value <= bounds.max[index]);
}

export function summarizeModelGeometry(
  parts: readonly ModelGeometryPart[],
  unitScale = 1,
): ModelGeometryStats | null {
  const validParts = parts.filter((part) => isValidBounds(part.bounds));
  if (validParts.length === 0) return null;

  const scale = Number.isFinite(unitScale) && unitScale > 0 ? unitScale : 1;
  const min: ModelGeometryVector = [
    Number.POSITIVE_INFINITY,
    Number.POSITIVE_INFINITY,
    Number.POSITIVE_INFINITY,
  ];
  const max: ModelGeometryVector = [
    Number.NEGATIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
  ];
  const countedVertexBuffers = new Set<unknown>();
  let vertexCount = 0;

  for (const part of validParts) {
    for (let axis = 0; axis < 3; axis += 1) {
      min[axis] = Math.min(min[axis], part.bounds.min[axis]);
      max[axis] = Math.max(max[axis], part.bounds.max[axis]);
    }
    if (!countedVertexBuffers.has(part.vertexBuffer)) {
      countedVertexBuffers.add(part.vertexBuffer);
      if (Number.isFinite(part.vertexCount) && part.vertexCount > 0) {
        vertexCount += Math.floor(part.vertexCount);
      }
    }
  }

  const scaledBounds: ModelGeometryBounds = {
    min: min.map((value) => value * scale) as ModelGeometryVector,
    max: max.map((value) => value * scale) as ModelGeometryVector,
  };
  return {
    vertexCount,
    bounds: scaledBounds,
    dimensions: {
      length: (max[0] - min[0]) * scale,
      width: (max[2] - min[2]) * scale,
      height: (max[1] - min[1]) * scale,
    },
  };
}

/** 把米制源 AABB 换算为落地居中后的 modelRoot 本地 AABB。 */
export function getNormalizedModelBounds(stats: ModelGeometryStats): ModelGeometryBounds {
  const [minX, minY, minZ] = stats.bounds.min;
  const [maxX, maxY, maxZ] = stats.bounds.max;
  const centerX = (minX + maxX) / 2;
  const centerZ = (minZ + maxZ) / 2;
  return {
    min: [minX - centerX, 0, minZ - centerZ],
    max: [maxX - centerX, maxY - minY, maxZ - centerZ],
  };
}

export function formatModelDimension(value: number): string {
  if (!Number.isFinite(value)) return "暂无数据";
  const rounded = Math.round(value * 100) / 100;
  return `${Object.is(rounded, -0) ? 0 : rounded} 米`;
}
