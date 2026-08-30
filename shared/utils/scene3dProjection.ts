import type {
  StoryScene3DEnvironment,
  StoryScene3DMarker,
  StoryScene3DMarkerImageRegion,
  StoryScene3DMarkerKind,
} from "../types/comicDrama";
import { STORY_SCENE_3D_DEFAULT_PANORAMA_HORIZON_V } from "../types/comicDrama.js";

const TWO_PI = Math.PI * 2;
const MIN_MARKER_RADIUS = 0.25;
const MAX_MARKER_HEIGHT = 30;

/**
 * Legacy fallback cap for coordinate-only normalization without an environment
 * snapshot. Real placement no longer estimates depth: every projected marker is
 * snapped onto the dome inner surface along its image azimuth.
 */
export const STORY_SCENE_3D_MARKER_FALLBACK_WALL_RADIUS_RATIO = 0.45;

type MarkerSizeRange = readonly [number, number];

export interface StoryScene3dMarkerSizePolicy {
  x: MarkerSizeRange;
  y: MarkerSizeRange;
  z: MarkerSizeRange;
  imageWidthFactor: number;
  imageHeightFactor: number;
}

/**
 * Fixed-object dimensions are a deterministic post-processing guard for the
 * structured `kind` returned by the vision model. They are deliberately keyed
 * by the enum, never by a user-facing label or free-form scene text.
 * The `y` range is the USABLE height for character placement: sit/lie targets
 * (chair, bed, sofa, and other seat-like kinds) are capped at their seat or
 * mattress plane so an actor placed on top of the box lands on the surface,
 * never on a backrest or headboard. The `z` range doubles as the panel
 * thickness pressed against the dome surface.
 */
export const STORY_SCENE_3D_MARKER_SIZE_POLICIES = {
  bed: { x: [1.4, 3.2], y: [0.25, 0.9], z: [0.6, 2.8], imageWidthFactor: 1, imageHeightFactor: 0.9 },
  table: { x: [0.6, 2.4], y: [0.55, 1.2], z: [0.35, 1.5], imageWidthFactor: 1, imageHeightFactor: 0.9 },
  chair: { x: [0.35, 1], y: [0.35, 0.65], z: [0.25, 1], imageWidthFactor: 1, imageHeightFactor: 0.9 },
  sofa: { x: [1.4, 3.4], y: [0.35, 0.75], z: [0.5, 1.5], imageWidthFactor: 1, imageHeightFactor: 0.9 },
  desk: { x: [0.8, 2.4], y: [0.55, 0.95], z: [0.35, 1.2], imageWidthFactor: 1, imageHeightFactor: 0.9 },
  cabinet: { x: [0.4, 2], y: [0.8, 2.8], z: [0.3, 1], imageWidthFactor: 1, imageHeightFactor: 0.9 },
  shelf: { x: [0.4, 2.2], y: [0.8, 3], z: [0.25, 0.8], imageWidthFactor: 1, imageHeightFactor: 0.9 },
  door: { x: [0.6, 1.6], y: [1.8, 2.6], z: [0.06, 0.35], imageWidthFactor: 1, imageHeightFactor: 0.9 },
  window: { x: [0.6, 3], y: [0.6, 2.6], z: [0.08, 0.4], imageWidthFactor: 1, imageHeightFactor: 0.9 },
  counter: { x: [0.8, 3], y: [0.7, 1.3], z: [0.4, 1.2], imageWidthFactor: 1, imageHeightFactor: 0.9 },
  stair: { x: [0.8, 3.5], y: [0.5, 2.5], z: [0.5, 4], imageWidthFactor: 1, imageHeightFactor: 0.9 },
  other: { x: [0.25, 3], y: [0.2, 3], z: [0.25, 3], imageWidthFactor: 1, imageHeightFactor: 0.9 },
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

export type StoryScene3dProjectionMarker = Pick<
  StoryScene3DMarker,
  "anchor" | "position" | "size" | "imageRegion"
> & Partial<Pick<StoryScene3DMarker, "kind" | "yawDeg" | "source" | "approxDistanceMeters">>;

export type StoryScene3dProjectionEnvironment = Pick<StoryScene3DEnvironment, "radiusMeters">
  & Partial<Pick<StoryScene3DEnvironment, "projectionCenterHeight" | "panoramaHorizonV" | "yawDeg">>
  & { domeRadius?: number };

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

function resolveHorizonV(environment: StoryScene3dProjectionEnvironment): number {
  return clamp(
    finiteOr(environment.panoramaHorizonV, STORY_SCENE_3D_DEFAULT_PANORAMA_HORIZON_V),
    0,
    1,
  );
}

/** The current `radiusMeters` field carries the true dome radius in meters. */
function domeWorldRadius(environment: StoryScene3dProjectionEnvironment): number {
  const radiusMeters = Number(environment.radiusMeters);
  if (Number.isFinite(radiusMeters) && radiusMeters > 0) {
    return Math.max(0.5, radiusMeters);
  }
  // Read-only compatibility for callers that still hold a legacy snapshot.
  return Math.max(0.5, finiteOr(environment.domeRadius, 15) / 2);
}

/**
 * Convert an equirectangular image rectangle into a horizontal world direction.
 * The shared panorama contract uses u=0.5 as front, +X on the image-right side.
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

interface StoryScene3dMarkerVerticalAngles {
  /** Latitude of the region top edge, positive above the horizon. */
  topLatitude: number;
  centerLatitude: number;
  /** Latitude of the region bottom edge, negative below the horizon. */
  bottomLatitude: number;
}

function resolveMarkerVerticalAngles(
  region: StoryScene3DMarkerImageRegion,
  horizonV: number,
): StoryScene3dMarkerVerticalAngles {
  const topV = clamp(finiteOr(region.y, 0), 0, 1);
  const bottomV = clamp(finiteOr(region.y, 0) + clamp(finiteOr(region.height, 0), 0, 1), 0, 1);
  const latitudeAt = (v: number): number => (horizonV - v) * Math.PI;
  return {
    topLatitude: latitudeAt(topV),
    centerLatitude: latitudeAt((topV + bottomV) / 2),
    bottomLatitude: latitudeAt(bottomV),
  };
}

function markerPolicy(marker: StoryScene3dProjectionMarker) {
  return (marker.kind && STORY_SCENE_3D_MARKER_SIZE_POLICIES[marker.kind])
    ?? STORY_SCENE_3D_MARKER_SIZE_POLICIES.other;
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
  const policy = markerPolicy(marker as StoryScene3dProjectionMarker);
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
  // Thickness is a per-kind panel depth; on the dome every box hugs the wall.
  const thickness = policy.z[0];
  if (marker.anchor === "floor") {
    return [
      width,
      height,
      thickness * (marker.kind === "bed" || marker.kind === "stair" ? 1.5 : 1),
    ];
  }
  return [width, height, thickness];
}

/**
 * Dome-surface placement contract: depth cannot be measured out of an
 * equirect frame, so pixel-derived estimation is gone. Each projected marker
 * keeps its exact azimuth from the region's horizontal center and is pressed
 * against the inner side of the panorama hemisphere:
 * - doors and windows (wall anchors) sit fully flush — the whole box lies
 *   between the axis and the sphere surface with the back face touching it;
 * - floor furniture also hugs the surface by default, but when the vision
 *   model supplies `approxDistanceMeters` the box is pulled forward along its
 *   radial direction to that coarse distance (clamped inside the surface), so
 *   objects in the same azimuth keep their real front-to-back order — a chair
 *   in front of a desk lands in front of it;
 * - vertical position follows the region's center latitude intersected with
 *   the sphere; ground-standing objects are pinned to the floor instead.
 * Manual markers and markers without an image region keep their stored
 * geometry. The result depends only on the image region, environment, and the
 * model's own distance estimate, so repeated projection stays idempotent.
 */
export function projectStoryScene3dMarkerFromImageRegion(
  marker: StoryScene3dProjectionMarker,
  environment: StoryScene3dProjectionEnvironment,
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
      yawDeg: normalizeDegrees(originalYaw),
    };
  }

  const projectionCenterHeight = finiteOr(environment.projectionCenterHeight, 2);
  const worldRadius = domeWorldRadius(environment);
  const region = marker.imageRegion;
  const angles = resolveMarkerVerticalAngles(region, resolveHorizonV(environment));
  const direction = equirectangularRegionCenterToHorizontalDirection(region, environment);

  // Far intersection of the region-center ray with the dome sphere centered at
  // [0, projectionCenterHeight, 0]; this is where the object pixels live.
  const latitude = angles.centerLatitude;
  const sinLatitude = Math.sin(latitude);
  const cosLatitude = Math.max(0.05, Math.cos(latitude));
  const discriminant = worldRadius ** 2 - (projectionCenterHeight * cosLatitude) ** 2;
  const rayDistance = Math.max(
    MIN_MARKER_RADIUS,
    projectionCenterHeight * sinLatitude + Math.sqrt(Math.max(discriminant, (worldRadius * 0.2) ** 2)),
  );
  const surfaceHorizontalRadius = rayDistance * cosLatitude;

  const size = calibrateMarkerSize(marker, region, surfaceHorizontalRadius, rayDistance);

  const standsOnGround = marker.anchor === "floor" || marker.kind === "door";
  const rayCenterY = projectionCenterHeight + sinLatitude * rayDistance;
  const positionY = standsOnGround
    ? size[1] / 2
    : clamp(rayCenterY, size[1] / 2, MAX_MARKER_HEIGHT);

  // Default placement is flush: pull the center inward by half the thickness
  // so the entire box sits between the axis and the sphere surface. Floor
  // furniture with a model-supplied coarse distance is pulled forward to that
  // distance instead (clamped inside the surface), preserving front-to-back
  // order between objects sharing an azimuth; wall anchors always stay flush.
  const flushRadius = Math.max(MIN_MARKER_RADIUS, surfaceHorizontalRadius - size[2] / 2);
  let radialDistance = flushRadius;
  const approxDistance = Number(marker.approxDistanceMeters);
  if (marker.anchor === "floor" && Number.isFinite(approxDistance) && approxDistance > 0) {
    radialDistance = clamp(approxDistance - size[2] / 2, MIN_MARKER_RADIUS, flushRadius);
  }

  return {
    position: [
      direction.x * radialDistance,
      positionY,
      direction.z * radialDistance,
    ],
    size,
    yawDeg: direction.azimuthDeg,
  };
}

/**
 * Set-level projection applies the same deterministic dome-snap to every AI
 * marker. Kept as a set entrypoint because normalization and consumers share
 * one call site; manual markers and markers without an image region keep their
 * stored geometry.
 */
export function projectStoryScene3dMarkerSetFromImageRegions(
  markers: readonly StoryScene3dProjectionMarker[],
  environment: StoryScene3dProjectionEnvironment,
): StoryScene3dMarkerProjection[] {
  return markers.map((marker) => projectStoryScene3dMarkerFromImageRegion(marker, environment));
}
