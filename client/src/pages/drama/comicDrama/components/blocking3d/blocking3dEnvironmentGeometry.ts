export interface Blocking3dGeometryData {
  positions: number[];
  normals: number[];
  uvs: number[];
  indices: number[];
}

export const LONGITUDE_BANDS = 64;
export const GROUND_DOME_FLAT_RADIUS = 0.95;
const GROUND_DOME_RIM_BANDS = 6;
const GEOMETRY_RADIUS = 0.5;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function getGroundDomeEdgeHeight(projectionCenterHeight: number, domeRadius: number): number {
  return clamp(projectionCenterHeight / domeRadius, 0.004, 1);
}

/**
 * Project a ground vertex into the lower half of the source image.
 *
 * `seamU` is supplied by the mesh builder for duplicate longitude vertices.
 * Computing it from x/z alone loses whether a vertex is the first or last
 * copy of the seam, which makes the closing quad interpolate across the whole
 * texture and renders as a stretched vertical strip.
 */
export function projectGroundTextureUv(
  x: number,
  y: number,
  z: number,
  projectionCenterHeight: number,
  domeRadius: number,
  seamU?: number,
): [number, number] {
  const domeScale = domeRadius * GEOMETRY_RADIUS;
  const groundDomeEdgeHeight = getGroundDomeEdgeHeight(projectionCenterHeight, domeRadius);
  const worldX = x * domeScale;
  const worldY = y * domeScale;
  const worldZ = z * domeScale;
  const horizontalDistance = Math.hypot(worldX, worldZ);
  const edgeWorldY = groundDomeEdgeHeight * domeScale;
  const edgeDownAngle = Math.atan2(projectionCenterHeight - edgeWorldY, domeScale);
  const downAngle = Math.atan2(projectionCenterHeight - worldY, horizontalDistance);
  const verticalProgress = clamp(
    (downAngle - edgeDownAngle) / (Math.PI * 0.5 - edgeDownAngle),
    0,
    1,
  );
  const azimuthProgress = ((Math.atan2(worldZ, worldX) + Math.PI * 0.5) / (Math.PI * 2) + 1) % 1;
  const u = seamU === undefined ? 1 - azimuthProgress : seamU;
  return [u, 0.5 + verticalProgress * 0.5];
}

function addVertex(
  data: Blocking3dGeometryData,
  position: [number, number, number],
  normal: [number, number, number],
  uv: [number, number],
): number {
  const index = data.positions.length / 3;
  data.positions.push(...position);
  data.normals.push(...normal);
  data.uvs.push(...uv);
  return index;
}

function addGroundRing(
  data: Blocking3dGeometryData,
  radial: number,
  y: number,
  projectionCenterHeight: number,
  domeRadius: number,
): number[] {
  const ring: number[] = [];
  for (let lon = 0; lon <= LONGITUDE_BANDS; lon += 1) {
    const phi = (lon * Math.PI * 2) / LONGITUDE_BANDS - Math.PI * 0.5;
    const x = Math.cos(phi) * radial;
    const z = Math.sin(phi) * radial;
    const uv = projectGroundTextureUv(
      x,
      y,
      z,
      projectionCenterHeight,
      domeRadius,
      1 - lon / LONGITUDE_BANDS,
    );
    ring.push(addVertex(data, [x * GEOMETRY_RADIUS, y * GEOMETRY_RADIUS, z * GEOMETRY_RADIUS], [0, 1, 0], uv));
  }
  return ring;
}

/**
 * Build the lower HDRIBackdrop surface as a finite flat floor plus a curved
 * outer rim. A single center vertex avoids the lower-hemisphere pole where
 * duplicated longitudes collapse into a thin, highly stretched texture fan.
 */
export function createGroundDomeGeometryData(
  projectionCenterHeight: number,
  domeRadius: number,
): Blocking3dGeometryData {
  const data: Blocking3dGeometryData = {
    positions: [],
    normals: [],
    uvs: [],
    indices: [],
  };
  const edgeHeight = getGroundDomeEdgeHeight(projectionCenterHeight, domeRadius);
  const rings: number[][] = [];

  for (let band = 0; band <= GROUND_DOME_RIM_BANDS; band += 1) {
    const progress = band / GROUND_DOME_RIM_BANDS;
    const radial = 1 - progress * (1 - GROUND_DOME_FLAT_RADIUS);
    const y = edgeHeight * (1 - progress);
    rings.push(addGroundRing(data, radial, y, projectionCenterHeight, domeRadius));
  }

  for (let ringIndex = 0; ringIndex < rings.length - 1; ringIndex += 1) {
    const outer = rings[ringIndex];
    const inner = rings[ringIndex + 1];
    for (let lon = 0; lon < LONGITUDE_BANDS; lon += 1) {
      data.indices.push(outer[lon + 1], inner[lon], outer[lon]);
      data.indices.push(outer[lon + 1], inner[lon + 1], inner[lon]);
    }
  }

  const centerIndex = addVertex(data, [0, 0, 0], [0, 1, 0], [0.5, 1]);
  const inner = rings[rings.length - 1];
  for (let lon = 0; lon < LONGITUDE_BANDS; lon += 1) {
    data.indices.push(inner[lon + 1], centerIndex, inner[lon]);
  }

  return data;
}
