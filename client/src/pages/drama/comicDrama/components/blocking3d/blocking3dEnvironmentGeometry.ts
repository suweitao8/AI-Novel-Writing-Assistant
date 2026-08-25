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

function addVertex(
  data: Blocking3dGeometryData,
  position: [number, number, number],
  normal: [number, number, number],
): number {
  const index = data.positions.length / 3;
  data.positions.push(...position);
  data.normals.push(...normal);
  // PlayCanvas requires every declared stream to have one item per vertex.
  // The projection shader ignores this placeholder UV; it must stay constant
  // so no panorama angle is interpolated across the center fan.
  data.uvs.push(0, 0);
  return index;
}

function addGroundRing(
  data: Blocking3dGeometryData,
  radial: number,
  y: number,
): number[] {
  const ring: number[] = [];
  for (let lon = 0; lon <= LONGITUDE_BANDS; lon += 1) {
    const phi = (lon * Math.PI * 2) / LONGITUDE_BANDS - Math.PI * 0.5;
    const x = Math.cos(phi) * radial;
    const z = Math.sin(phi) * radial;
    ring.push(addVertex(data, [x * GEOMETRY_RADIUS, y * GEOMETRY_RADIUS, z * GEOMETRY_RADIUS], [0, 1, 0]));
  }
  return ring;
}

/**
 * Build the lower HDRIBackdrop surface as a finite flat floor plus a curved
 * outer rim. Texture projection is intentionally not encoded in the vertex
 * UVs: the ground material projects the panorama from the world-space
 * projection center per fragment, so the center does not interpolate a
 * circular UV fan.
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
    rings.push(addGroundRing(data, radial, y));
  }

  for (let ringIndex = 0; ringIndex < rings.length - 1; ringIndex += 1) {
    const outer = rings[ringIndex];
    const inner = rings[ringIndex + 1];
    for (let lon = 0; lon < LONGITUDE_BANDS; lon += 1) {
      data.indices.push(outer[lon + 1], inner[lon], outer[lon]);
      data.indices.push(outer[lon + 1], inner[lon + 1], inner[lon]);
    }
  }

  const centerIndex = addVertex(data, [0, 0, 0], [0, 1, 0]);
  const inner = rings[rings.length - 1];
  for (let lon = 0; lon < LONGITUDE_BANDS; lon += 1) {
    data.indices.push(inner[lon + 1], centerIndex, inner[lon]);
  }

  return data;
}
