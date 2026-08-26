import type {
  StoryScene3DEnvironment,
  StoryScene3DMarker,
  StoryScene3DMarkerImageRegion,
  StoryScene3DMarkerKind,
} from "../types/comicDrama";
import { STORY_SCENE_3D_PANORAMA_HORIZON_V } from "../types/comicDrama.js";

const TWO_PI = Math.PI * 2;
const MIN_MARKER_RADIUS = 0.5;
const MAX_MARKER_HEIGHT = 30;

type MarkerSizeRange = readonly [number, number];

export interface StoryScene3dMarkerSizePolicy {
  x: MarkerSizeRange;
  y: MarkerSizeRange;
  z: MarkerSizeRange;
  imageWidthFactor: number;
  imageHeightFactor: number;
  floorDepthRatio: number;
}

/**
 * Fixed-object dimensions are a deterministic post-processing guard for the
 * structured `kind` returned by the vision model. They are deliberately keyed
 * by the enum, never by a user-facing label or free-form scene text.
 */
export const STORY_SCENE_3D_MARKER_SIZE_POLICIES = {
  bed: { x: [1.4, 3.2], y: [0.35, 1.2], z: [1.4, 2.8], imageWidthFactor: 0.55, imageHeightFactor: 0.35, floorDepthRatio: 0.86 },
  table: { x: [0.6, 2.4], y: [0.55, 1.2], z: [0.5, 1.5], imageWidthFactor: 0.42, imageHeightFactor: 0.42, floorDepthRatio: 0.55 },
  chair: { x: [0.35, 1], y: [0.75, 1.5], z: [0.35, 1], imageWidthFactor: 0.5, imageHeightFactor: 0.48, floorDepthRatio: 0.78 },
  sofa: { x: [1.4, 3.4], y: [0.55, 1.2], z: [0.7, 1.5], imageWidthFactor: 0.5, imageHeightFactor: 0.45, floorDepthRatio: 0.42 },
  desk: { x: [0.8, 2.4], y: [0.6, 1.1], z: [0.45, 1.2], imageWidthFactor: 0.42, imageHeightFactor: 0.45, floorDepthRatio: 0.55 },
  cabinet: { x: [0.4, 2], y: [0.8, 2.8], z: [0.3, 1], imageWidthFactor: 0.45, imageHeightFactor: 0.7, floorDepthRatio: 0.5 },
  shelf: { x: [0.4, 2.2], y: [0.8, 3], z: [0.25, 0.8], imageWidthFactor: 0.5, imageHeightFactor: 0.75, floorDepthRatio: 0.35 },
  door: { x: [0.6, 1.6], y: [1.8, 2.6], z: [0.05, 0.35], imageWidthFactor: 0.8, imageHeightFactor: 0.9, floorDepthRatio: 0.12 },
  window: { x: [0.6, 3], y: [0.6, 2.6], z: [0.05, 0.4], imageWidthFactor: 0.75, imageHeightFactor: 0.9, floorDepthRatio: 0.12 },
  counter: { x: [0.8, 3], y: [0.7, 1.3], z: [0.4, 1.2], imageWidthFactor: 0.4, imageHeightFactor: 0.45, floorDepthRatio: 0.5 },
  stair: { x: [0.8, 3.5], y: [0.5, 2.5], z: [0.8, 4], imageWidthFactor: 0.55, imageHeightFactor: 0.5, floorDepthRatio: 1 },
  other: { x: [0.25, 3], y: [0.2, 3], z: [0.25, 3], imageWidthFactor: 0.6, imageHeightFactor: 0.6, floorDepthRatio: 0.75 },
} as const satisfies Record<StoryScene3DMarkerKind, StoryScene3dMarkerSizePolicy>;

export interface StoryScene3dHorizontalDirection {
  x: number;
  z: number;
  /** PlayCanvas marker yaw: local +Z points along the radial direction. */
  azimuthDeg: number;
}

export interface StoryScene3dMarkerProjection {
  position: [number, number, number];
  size: [number, number, number];
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

function normalizedSize(value: StoryScene3DMarker["size"]): [number, number, number] {
  return [
    finiteOr(value[0], 1),
    finiteOr(value[1], 1),
    finiteOr(value[2], 1),
  ];
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

interface StoryScene3dProjectionRay {
  ray: [number, number, number];
  horizontalLength: number;
  direction: StoryScene3dHorizontalDirection;
}

function resolveProjectionRay(
  region: StoryScene3DMarkerImageRegion,
  anchor: StoryScene3DMarker["anchor"],
  environment: Partial<Pick<StoryScene3DEnvironment, "projectionCenterHeight" | "domeRadius" | "yawDeg">>,
): StoryScene3dProjectionRay {
  const imageV = anchor === "floor"
    ? region.y + region.height
    : region.y + region.height / 2;
  const latitude = (STORY_SCENE_3D_PANORAMA_HORIZON_V - imageV) * Math.PI;
  const horizontalLength = Math.max(0, Math.cos(latitude));
  const direction = equirectangularRegionCenterToHorizontalDirection(region, environment);
  return {
    ray: [
      horizontalLength * direction.x,
      Math.sin(latitude),
      horizontalLength * direction.z,
    ],
    horizontalLength,
    direction,
  };
}

function resolveGroundRadius(
  ray: StoryScene3dProjectionRay,
  projectionCenterHeight: number,
  safeMaxRadius: number,
): number {
  const downward = -ray.ray[1];
  const groundRadius = downward > 0.08
    ? projectionCenterHeight * ray.horizontalLength / downward
    : safeMaxRadius;
  return clamp(
    Number.isFinite(groundRadius) ? groundRadius : safeMaxRadius,
    0.25,
    safeMaxRadius,
  );
}

function resolveImageSpan(
  region: StoryScene3DMarkerImageRegion,
  horizontalRadius: number,
  rayDistance: number,
): { width: number; height: number } {
  const width = clamp(finiteOr(region.width, 0), 0.005, 0.5);
  const height = clamp(finiteOr(region.height, 0), 0.005, 0.8);
  return {
    width: Math.max(0.05, 2 * horizontalRadius * Math.sin(Math.PI * width)),
    height: Math.max(0.05, 2 * rayDistance * Math.sin(Math.PI * height / 2)),
  };
}

function calibrateMarkerSize(
  marker: Pick<StoryScene3DMarker, "anchor" | "size"> & Partial<Pick<StoryScene3DMarker, "kind">>,
  region: StoryScene3DMarkerImageRegion,
  horizontalRadius: number,
  rayDistance: number,
): [number, number, number] {
  const policy = (marker.kind && STORY_SCENE_3D_MARKER_SIZE_POLICIES[marker.kind])
    ?? STORY_SCENE_3D_MARKER_SIZE_POLICIES.other;
  const imageSpan = resolveImageSpan(region, horizontalRadius, rayDistance);
  const width = clamp(
    imageSpan.width * policy.imageWidthFactor,
    policy.x[0],
    policy.x[1],
  );
  const height = clamp(
    imageSpan.height * policy.imageHeightFactor,
    policy.y[0],
    policy.y[1],
  );
  if (marker.anchor === "floor") {
    return [
      width,
      height,
      clamp(width * policy.floorDepthRatio, policy.z[0], policy.z[1]),
    ];
  }
  const rawDepth = finiteOr(marker.size[2], policy.z[0]);
  return [
    width,
    height,
    clamp(rawDepth, policy.z[0], policy.z[1]),
  ];
}

/**
 * Project an AI marker onto the panorama's direction and calibrate its box
 * against the visible image region. A single equirectangular image cannot
 * recover true metric depth, so wall/ceiling markers use the stable outer wall
 * reference radius and floor markers use a ground intersection or outer-floor
 * fallback. This keeps visual alignment deterministic without pretending to
 * reconstruct a precise room mesh.
 */
export function projectStoryScene3dMarkerFromImageRegion(
  marker: Pick<StoryScene3DMarker, "anchor" | "position" | "size" | "imageRegion">
    & Partial<Pick<StoryScene3DMarker, "yawDeg" | "source">>,
  environment: Pick<StoryScene3DEnvironment, "domeRadius"> & Partial<Pick<StoryScene3DEnvironment, "projectionCenterHeight" | "yawDeg">>,
  maxRadius = finiteOr(environment.domeRadius, 15) * 0.45,
): StoryScene3dMarkerProjection {
  const originalPosition: [number, number, number] = [
    finiteOr(marker.position[0], 0),
    finiteOr(marker.position[1], marker.size[1] / 2),
    finiteOr(marker.position[2], 0),
  ];
  const originalSize = normalizedSize(marker.size);
  const originalYaw = finiteOr(marker.yawDeg, 0);
  if (marker.source === "manual" || !marker.imageRegion) {
    return {
      position: originalPosition,
      size: originalSize,
      yawDeg: originalYaw,
    };
  }

  const safeMaxRadius = Math.max(MIN_MARKER_RADIUS, finiteOr(maxRadius, 6.75));
  const projectionCenterHeight = finiteOr(environment.projectionCenterHeight, 1.7);
  const projectionRay = resolveProjectionRay(marker.imageRegion, marker.anchor, {
    ...environment,
    projectionCenterHeight,
  });
  const horizontalRadius = marker.anchor === "floor"
    ? resolveGroundRadius(projectionRay, projectionCenterHeight, safeMaxRadius)
    : safeMaxRadius;
  const rayDistance = horizontalRadius / Math.max(projectionRay.horizontalLength, 0.08);
  const size = calibrateMarkerSize(
    marker,
    marker.imageRegion,
    horizontalRadius,
    rayDistance,
  );

  if (marker.anchor === "floor") {
    return {
      position: [
        projectionRay.direction.x * horizontalRadius,
        size[1] / 2,
        projectionRay.direction.z * horizontalRadius,
      ],
      size,
      yawDeg: normalizeDegrees(originalYaw),
    };
  }

  return {
    position: [
      projectionRay.direction.x * horizontalRadius,
      clamp(
        projectionCenterHeight + projectionRay.ray[1] * rayDistance,
        size[1] / 2,
        MAX_MARKER_HEIGHT,
      ),
      projectionRay.direction.z * horizontalRadius,
    ],
    size,
    yawDeg: normalizeDegrees(projectionRay.direction.azimuthDeg),
  };
}
