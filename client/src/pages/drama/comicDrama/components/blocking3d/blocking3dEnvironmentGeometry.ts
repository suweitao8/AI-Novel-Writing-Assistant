export interface Blocking3dGeometryData {
  positions: number[];
  normals: number[];
  uvs: number[];
  indices: number[];
}

export const LONGITUDE_BANDS = 64;
export const UPPER_DOME_LATITUDE_BANDS = 24;
export const GROUND_DOME_FLAT_RADIUS = 0.95;
export const GROUND_DOME_RIM_BANDS = 16;
const GEOMETRY_RADIUS = 0.5;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function getGroundDomeEdgeHeight(projectionCenterHeight: number, domeRadius: number): number {
  // The base mesh radius is 0.5 and the entity is scaled by domeRadius. Keep
  // the actual seam at the projection center's world-space height so its
  // direction maps to the panorama horizon (v=0.5).
  return clamp((projectionCenterHeight * 2) / domeRadius, 0.004, 2);
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

function addRadialRing(
  data: Blocking3dGeometryData,
  radial: number,
  y: number,
  normal: [number, number, number],
): number[] {
  const ring: number[] = [];
  for (let lon = 0; lon <= LONGITUDE_BANDS; lon += 1) {
    const phi = (lon * Math.PI * 2) / LONGITUDE_BANDS - Math.PI * 0.5;
    const x = Math.cos(phi) * radial;
    const z = Math.sin(phi) * radial;
    ring.push(addVertex(data, [x * GEOMETRY_RADIUS, y * GEOMETRY_RADIUS, z * GEOMETRY_RADIUS], normal));
  }
  return ring;
}

function addGroundRing(
  data: Blocking3dGeometryData,
  radial: number,
  y: number,
): number[] {
  return addRadialRing(data, radial, y, [0, 1, 0]);
}

function connectRings(data: Blocking3dGeometryData, outer: number[], inner: number[]): void {
  for (let lon = 0; lon < LONGITUDE_BANDS; lon += 1) {
    data.indices.push(outer[lon + 1], inner[lon], outer[lon]);
    data.indices.push(outer[lon + 1], inner[lon + 1], inner[lon]);
  }
}

function addUpperRing(
  data: Blocking3dGeometryData,
  theta: number,
  edgeHeight: number,
): number[] {
  const rawSinTheta = Math.sin(theta);
  const rawCosTheta = Math.cos(theta);
  const isPole = Math.abs(rawSinTheta) < 1e-8;
  const sinTheta = isPole ? 0 : rawSinTheta;
  const cosTheta = isPole ? Math.sign(rawCosTheta) : rawCosTheta;
  const ring: number[] = [];

  for (let lon = 0; lon <= LONGITUDE_BANDS; lon += 1) {
    const phi = (lon * Math.PI * 2) / LONGITUDE_BANDS - Math.PI * 0.5;
    const sinPhi = Math.sin(phi);
    const cosPhi = Math.cos(phi);
    const x = cosPhi * sinTheta;
    const z = sinPhi * sinTheta;
    ring.push(addVertex(
      data,
      [x * GEOMETRY_RADIUS, (cosTheta + edgeHeight) * GEOMETRY_RADIUS, z * GEOMETRY_RADIUS],
      [x, cosTheta, z],
    ));
  }

  return ring;
}

function createGeometryData(): Blocking3dGeometryData {
  return {
    positions: [],
    normals: [],
    uvs: [],
    indices: [],
  };
}

/**
 * Build the complete finite EnviroDome surface in one index buffer. The
 * equator ring belongs to both the upper dome and the lower floor transition;
 * sharing it removes the one-pixel raster gap caused by two draw calls using
 * duplicated boundary vertices. Texture coordinates stay in the projection
 * material, so this topology also keeps the floor center free of interpolated
 * longitude UVs.
 */
export function createBackdropGeometryData(
  projectionCenterHeight: number,
  domeRadius: number,
): Blocking3dGeometryData {
  const data = createGeometryData();
  const edgeHeight = getGroundDomeEdgeHeight(projectionCenterHeight, domeRadius);
  const upperRings: number[][] = [];

  for (let lat = 0; lat <= UPPER_DOME_LATITUDE_BANDS; lat += 1) {
    const theta = (Math.PI * 0.5 * lat) / UPPER_DOME_LATITUDE_BANDS;
    upperRings.push(addUpperRing(data, theta, edgeHeight));
  }

  for (let ringIndex = 0; ringIndex < upperRings.length - 1; ringIndex += 1) {
    connectRings(data, upperRings[ringIndex], upperRings[ringIndex + 1]);
  }

  const groundRings = [upperRings[upperRings.length - 1]];
  for (let band = 1; band <= GROUND_DOME_RIM_BANDS; band += 1) {
    const progress = band / GROUND_DOME_RIM_BANDS;
    const radial = 1 - (1 - GROUND_DOME_FLAT_RADIUS) * progress * progress;
    const y = edgeHeight * (1 - progress) * (1 - progress);
    groundRings.push(addGroundRing(data, radial, y));
  }

  for (let ringIndex = 0; ringIndex < groundRings.length - 1; ringIndex += 1) {
    connectRings(data, groundRings[ringIndex], groundRings[ringIndex + 1]);
  }

  const centerIndex = addVertex(data, [0, 0, 0], [0, 1, 0]);
  const inner = groundRings[groundRings.length - 1];
  for (let lon = 0; lon < LONGITUDE_BANDS; lon += 1) {
    data.indices.push(inner[lon + 1], centerIndex, inner[lon]);
  }

  return data;
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
  const data = createGeometryData();
  const edgeHeight = getGroundDomeEdgeHeight(projectionCenterHeight, domeRadius);
  const rings: number[][] = [];

  for (let band = 0; band <= GROUND_DOME_RIM_BANDS; band += 1) {
    const progress = band / GROUND_DOME_RIM_BANDS;
    // Match the upper dome's near-vertical tangent at the horizon, then
    // flatten the curve into the usable floor instead of cutting it with a
    // fixed-slope strip. This keeps the projected panorama from changing
    // slope abruptly at the dome/floor boundary.
    const radial = 1 - (1 - GROUND_DOME_FLAT_RADIUS) * progress * progress;
    const y = edgeHeight * (1 - progress) * (1 - progress);
    rings.push(addGroundRing(data, radial, y));
  }

  for (let ringIndex = 0; ringIndex < rings.length - 1; ringIndex += 1) {
    connectRings(data, rings[ringIndex], rings[ringIndex + 1]);
  }

  const centerIndex = addVertex(data, [0, 0, 0], [0, 1, 0]);
  const inner = rings[rings.length - 1];
  for (let lon = 0; lon < LONGITUDE_BANDS; lon += 1) {
    data.indices.push(inner[lon + 1], centerIndex, inner[lon]);
  }

  return data;
}
