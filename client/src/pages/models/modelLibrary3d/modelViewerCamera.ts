const CAMERA_DISTANCE_RATIO = 0.0001;
const DEFAULT_FAR_CLIP = 200;
const DEFAULT_NEAR_CLIP = 0.05;
const MINIMUM_SAFE_VALUE = Number.EPSILON * 1024;

export interface ModelViewerCameraClipPlanes {
  nearClip: number;
  farClip: number;
}

function normalizeModelRadius(modelRadius: number): number {
  if (!Number.isFinite(modelRadius)) return 1;
  return Math.max(Math.abs(modelRadius), MINIMUM_SAFE_VALUE);
}

function multiplyWithinFiniteRange(value: number, factor: number): number {
  if (value > Number.MAX_VALUE / factor) return Number.MAX_VALUE;
  return value * factor;
}

function addWithinFiniteRange(left: number, right: number): number {
  if (left > Number.MAX_VALUE - right) return Number.MAX_VALUE;
  return left + right;
}

export function getModelViewerCameraMinimumDistance(modelRadius: number): number {
  return Math.max(normalizeModelRadius(modelRadius) * CAMERA_DISTANCE_RATIO, MINIMUM_SAFE_VALUE);
}

export function normalizeModelViewerCameraDistance(distance: number, modelRadius: number): number {
  const radius = normalizeModelRadius(modelRadius);
  const minimumDistance = getModelViewerCameraMinimumDistance(radius);
  if (Number.isFinite(distance) && distance > 0) return Math.max(distance, minimumDistance);

  const fallbackDistance = multiplyWithinFiniteRange(radius, 2);
  return Math.max(fallbackDistance, minimumDistance);
}

export function getModelViewerCameraClipPlanes(
  distance: number,
  modelRadius: number,
): ModelViewerCameraClipPlanes {
  const radius = normalizeModelRadius(modelRadius);
  const safeDistance = normalizeModelViewerCameraDistance(distance, radius);
  const nearClip = Math.max(
    MINIMUM_SAFE_VALUE,
    Math.min(DEFAULT_NEAR_CLIP, safeDistance * 0.05),
  );
  const farClip = Math.max(
    DEFAULT_FAR_CLIP,
    multiplyWithinFiniteRange(safeDistance, 1.25),
    addWithinFiniteRange(safeDistance, multiplyWithinFiniteRange(radius, 2)),
  );

  return { nearClip, farClip };
}
