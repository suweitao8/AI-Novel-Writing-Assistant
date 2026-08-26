import type {
  StoryScene3DEnvironment,
  StoryScene3DMarker,
  StoryScene3DMarkerImageRegion,
} from "../types/comicDrama";

const TWO_PI = Math.PI * 2;
const DEFAULT_MARKER_RADIUS_RATIO = 0.76;
const MIN_MARKER_RADIUS = 0.5;

export interface StoryScene3dHorizontalDirection {
  x: number;
  z: number;
  /** PlayCanvas marker yaw: local +Z points along the radial direction. */
  azimuthDeg: number;
}

export interface StoryScene3dMarkerProjection {
  position: [number, number, number];
  yawDeg: number;
}

function finiteOr(value: unknown, fallback: number): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizeDegrees(value: number): number {
  const normalized = ((value + 180) % 360 + 360) % 360 - 180;
  return Math.abs(normalized) < 1e-9 ? 0 : normalized;
}

/**
 * Convert an equirectangular image rectangle into a horizontal world direction.
 * The shared panorama contract uses u=0.5 as front, +X on the image-right side,
 * and then -Z after the right-side seam. Vertical image coordinates do not
 * provide reliable absolute depth, so they intentionally do not affect this
 * horizontal direction.
 */
export function equirectangularRegionCenterToHorizontalDirection(
  region: StoryScene3DMarkerImageRegion,
  environment?: Partial<Pick<StoryScene3DEnvironment, "yawDeg">>,
): StoryScene3dHorizontalDirection {
  const width = clamp(finiteOr(region.width, 0), 0, 1);
  const centerU = clamp(finiteOr(region.x, 0) + width / 2, 0, 1);
  const panoramaYawRad = finiteOr(environment?.yawDeg, 0) * Math.PI / 180;
  const angle = (1 - centerU) * TWO_PI - Math.PI / 2 + panoramaYawRad;
  const x = Math.cos(angle);
  const z = Math.sin(angle);
  return {
    x,
    z,
    azimuthDeg: normalizeDegrees(Math.atan2(x, z) * 180 / Math.PI),
  };
}

/**
 * Project an AI marker onto the panorama's horizontal direction while keeping
 * its existing radial distance as a provisional depth estimate. A single
 * equirectangular image cannot recover metric depth; the fallback is only used
 * when the model did not return a usable radial distance.
 */
export function projectStoryScene3dMarkerFromImageRegion(
  marker: Pick<StoryScene3DMarker, "anchor" | "position" | "size" | "yawDeg" | "imageRegion" | "source">,
  environment: Pick<StoryScene3DEnvironment, "domeRadius"> & Partial<Pick<StoryScene3DEnvironment, "yawDeg">>,
  maxRadius = finiteOr(environment.domeRadius, 15) * 0.45,
): StoryScene3dMarkerProjection {
  const originalPosition: [number, number, number] = [
    finiteOr(marker.position[0], 0),
    finiteOr(marker.position[1], marker.size[1] / 2),
    finiteOr(marker.position[2], 0),
  ];
  const originalYaw = finiteOr(marker.yawDeg, 0);
  if (marker.source === "manual" || !marker.imageRegion) {
    return {
      position: originalPosition,
      yawDeg: originalYaw,
    };
  }

  const safeMaxRadius = Math.max(MIN_MARKER_RADIUS, finiteOr(maxRadius, 6.75));
  const existingRadius = Math.hypot(originalPosition[0], originalPosition[2]);
  const radius = clamp(
    existingRadius > 1e-3
      ? existingRadius
      : safeMaxRadius * DEFAULT_MARKER_RADIUS_RATIO,
    MIN_MARKER_RADIUS,
    safeMaxRadius,
  );
  const direction = equirectangularRegionCenterToHorizontalDirection(
    marker.imageRegion,
    environment,
  );
  const y = marker.anchor === "floor"
    ? finiteOr(marker.size[1], 1) / 2
    : originalPosition[1];
  const yawDeg = marker.anchor === "wall" || marker.anchor === "ceiling"
    ? direction.azimuthDeg
    : originalYaw;

  return {
    position: [direction.x * radius, y, direction.z * radius],
    yawDeg: normalizeDegrees(yawDeg),
  };
}
