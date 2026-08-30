export type ModelPreviewVector = readonly [number, number, number];

export interface ModelPreviewBounds {
  min: ModelPreviewVector;
  max: ModelPreviewVector;
}

export interface ModelPreviewCameraFit {
  target: ModelPreviewVector;
  distance: number;
  azimuthDegrees: number;
  elevationDegrees: number;
}

export interface ModelPreviewProjection {
  widthOccupancy: number;
  heightOccupancy: number;
  maxOccupancy: number;
}

export interface ModelPreviewCanvasMetrics {
  width?: number;
  height?: number;
  clientWidth?: number;
  clientHeight?: number;
}

export const MODEL_PREVIEW_FRAMING = Object.freeze({
  azimuthDegrees: -45,
  elevationDegrees: -25,
  fovDegrees: 50,
  targetOccupancy: 0.8,
  minOccupancy: 0.76,
  maxOccupancy: 0.84,
  minDistance: 0.05,
  maxDistance: 100000,
});

const EPSILON = 1e-8;

function positiveFinite(value: number | undefined): number | null {
  return Number.isFinite(value) && (value as number) > EPSILON ? value as number : null;
}

/** Prefer the CSS layout size so initial fitting is not based on WebGL's default 300x150 canvas. */
export function getModelPreviewAspectRatio(metrics: ModelPreviewCanvasMetrics): number {
  const width = positiveFinite(metrics.clientWidth) ?? positiveFinite(metrics.width) ?? 1;
  const height = positiveFinite(metrics.clientHeight) ?? positiveFinite(metrics.height) ?? 1;
  return width / height;
}

function finiteNumber(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function normalizeBounds(bounds: ModelPreviewBounds): ModelPreviewBounds {
  const min: [number, number, number] = [0, 0, 0];
  const max: [number, number, number] = [0, 0, 0];
  for (let axis = 0; axis < 3; axis += 1) {
    const lower = finiteNumber(bounds?.min?.[axis], 0);
    const upper = finiteNumber(bounds?.max?.[axis], lower);
    min[axis] = Math.min(lower, upper);
    max[axis] = Math.max(lower, upper);
  }
  return { min, max };
}

function boundsCenter(bounds: ModelPreviewBounds): ModelPreviewVector {
  return [
    (bounds.min[0] + bounds.max[0]) / 2,
    (bounds.min[1] + bounds.max[1]) / 2,
    (bounds.min[2] + bounds.max[2]) / 2,
  ];
}

function dot(left: ModelPreviewVector, right: ModelPreviewVector): number {
  return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}

function cross(left: ModelPreviewVector, right: ModelPreviewVector): ModelPreviewVector {
  return [
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0],
  ];
}

function normalize(vector: ModelPreviewVector, fallback: ModelPreviewVector): ModelPreviewVector {
  const length = Math.hypot(vector[0], vector[1], vector[2]);
  if (!Number.isFinite(length) || length < EPSILON) return fallback;
  return [vector[0] / length, vector[1] / length, vector[2] / length];
}

function getCameraBasis(fit: Pick<ModelPreviewCameraFit, "azimuthDegrees" | "elevationDegrees">) {
  const azimuth = fit.azimuthDegrees * Math.PI / 180;
  const elevation = fit.elevationDegrees * Math.PI / 180;
  const cameraOffset: ModelPreviewVector = [
    Math.sin(azimuth) * Math.cos(elevation),
    Math.sin(-elevation),
    Math.cos(azimuth) * Math.cos(elevation),
  ];
  const forward = normalize(
    [-cameraOffset[0], -cameraOffset[1], -cameraOffset[2]],
    [0, 0, -1],
  );
  const right = normalize(
    [-forward[2], 0, forward[0]],
    [1, 0, 0],
  );
  const up = normalize(cross(right, forward), [0, 1, 0]);
  return { forward, right, up };
}

function getBoundsCorners(bounds: ModelPreviewBounds): ModelPreviewVector[] {
  const corners: ModelPreviewVector[] = [];
  for (const x of [bounds.min[0], bounds.max[0]]) {
    for (const y of [bounds.min[1], bounds.max[1]]) {
      for (const z of [bounds.min[2], bounds.max[2]]) corners.push([x, y, z]);
    }
  }
  return corners;
}

function normalizePreviewPoints(
  inputPoints: readonly ModelPreviewVector[] | undefined,
): ModelPreviewVector[] {
  if (!inputPoints) return [];
  return inputPoints
    .filter((point) => point?.length === 3 && point.every((value) => Number.isFinite(value)))
    .map((point) => [point[0], point[1], point[2]]);
}

function projectAtDistance(
  bounds: ModelPreviewBounds,
  target: ModelPreviewVector,
  distance: number,
  aspectRatio: number,
  basis: ReturnType<typeof getCameraBasis>,
  points?: readonly ModelPreviewVector[],
): ModelPreviewProjection {
  const safeDistance = Math.max(EPSILON, finiteNumber(distance, MODEL_PREVIEW_FRAMING.maxDistance));
  const safeAspect = Math.max(EPSILON, finiteNumber(aspectRatio, 1));
  const tanHalfFov = Math.tan(MODEL_PREVIEW_FRAMING.fovDegrees * Math.PI / 360);
  const projected: Array<[number, number]> = [];

  for (const corner of points && points.length > 0 ? points : getBoundsCorners(bounds)) {
    const relative: ModelPreviewVector = [
      corner[0] - target[0],
      corner[1] - target[1],
      corner[2] - target[2],
    ];
    const depth = Math.max(EPSILON, safeDistance + dot(relative, basis.forward));
    const horizontal = dot(relative, basis.right) / (depth * tanHalfFov * safeAspect);
    const vertical = dot(relative, basis.up) / (depth * tanHalfFov);
    projected.push([horizontal, vertical]);
  }

  const horizontalValues = projected.map(([horizontal]) => horizontal);
  const verticalValues = projected.map(([, vertical]) => vertical);
  const widthOccupancy = Math.max(0, (Math.max(...horizontalValues) - Math.min(...horizontalValues)) / 2);
  const heightOccupancy = Math.max(0, (Math.max(...verticalValues) - Math.min(...verticalValues)) / 2);
  return {
    widthOccupancy,
    heightOccupancy,
    maxOccupancy: Math.max(widthOccupancy, heightOccupancy),
  };
}

export function projectModelPreviewBounds(
  inputBounds: ModelPreviewBounds,
  fit: ModelPreviewCameraFit,
  aspectRatio: number,
): ModelPreviewProjection {
  const bounds = normalizeBounds(inputBounds);
  const target = fit.target ?? boundsCenter(bounds);
  return projectAtDistance(bounds, target, fit.distance, aspectRatio, getCameraBasis(fit));
}

export function projectModelPreviewPoints(
  inputPoints: readonly ModelPreviewVector[],
  fit: ModelPreviewCameraFit,
  aspectRatio: number,
): ModelPreviewProjection {
  const points = normalizePreviewPoints(inputPoints);
  const bounds: ModelPreviewBounds = points.length > 0
    ? {
      min: [
        Math.min(...points.map((point) => point[0])),
        Math.min(...points.map((point) => point[1])),
        Math.min(...points.map((point) => point[2])),
      ],
      max: [
        Math.max(...points.map((point) => point[0])),
        Math.max(...points.map((point) => point[1])),
        Math.max(...points.map((point) => point[2])),
      ],
    }
    : { min: [0, 0, 0], max: [0, 0, 0] };
  const target = fit.target ?? boundsCenter(bounds);
  return projectAtDistance(bounds, target, fit.distance, aspectRatio, getCameraBasis(fit), points);
}

export function fitModelPreviewCamera(
  inputBounds: ModelPreviewBounds,
  aspectRatio: number,
  inputPoints?: readonly ModelPreviewVector[],
): ModelPreviewCameraFit {
  const bounds = normalizeBounds(inputBounds);
  const points = normalizePreviewPoints(inputPoints);
  const target = boundsCenter(bounds);
  const basis = getCameraBasis(MODEL_PREVIEW_FRAMING);
  const diagonal = Math.hypot(
    bounds.max[0] - bounds.min[0],
    bounds.max[1] - bounds.min[1],
    bounds.max[2] - bounds.min[2],
  );
  const fit: ModelPreviewCameraFit = {
    target,
    distance: MODEL_PREVIEW_FRAMING.minDistance,
    azimuthDegrees: MODEL_PREVIEW_FRAMING.azimuthDegrees,
    elevationDegrees: MODEL_PREVIEW_FRAMING.elevationDegrees,
  };

  if (!Number.isFinite(diagonal) || diagonal < EPSILON) return fit;

  let high = Math.max(MODEL_PREVIEW_FRAMING.minDistance, diagonal);
  while (
    projectAtDistance(bounds, target, high, aspectRatio, basis, points).maxOccupancy > MODEL_PREVIEW_FRAMING.targetOccupancy
    && high < MODEL_PREVIEW_FRAMING.maxDistance
  ) {
    high *= 2;
  }
  high = Math.min(high, MODEL_PREVIEW_FRAMING.maxDistance);
  let low: number = MODEL_PREVIEW_FRAMING.minDistance;
  for (let iteration = 0; iteration < 48; iteration += 1) {
    const middle = (low + high) / 2;
    if (projectAtDistance(bounds, target, middle, aspectRatio, basis, points).maxOccupancy > MODEL_PREVIEW_FRAMING.targetOccupancy) {
      low = middle;
    } else {
      high = middle;
    }
  }
  fit.distance = Number.isFinite(high) && high > 0 ? high : MODEL_PREVIEW_FRAMING.minDistance;
  return fit;
}
