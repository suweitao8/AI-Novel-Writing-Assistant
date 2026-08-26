import type {
  StoryScene3DEnvironment,
  StoryScene3DMarker,
  StoryScene3DMarkerImageRegion,
  StoryScene3DMarkerKind,
} from "../types/comicDrama";
import { STORY_SCENE_3D_DEFAULT_PANORAMA_HORIZON_V } from "../types/comicDrama.js";

const TWO_PI = Math.PI * 2;
const MIN_MARKER_RADIUS = 0.5;
const MAX_MARKER_HEIGHT = 30;

/**
 * No-evidence fallback radius shared by every projection entrypoint. Wall and
 * floor markers only fall back to this ratio of the dome radius when the image
 * region provides no usable depth cue (for example a window box without a
 * measurable vertical span).
 */
export const STORY_SCENE_3D_MARKER_FALLBACK_WALL_RADIUS_RATIO = 0.45;

/** Door floor-contact lines are the strongest wall-depth evidence, so they count twice in cluster medians. */
const GROUND_CONTACT_CLUSTER_WEIGHT = 2;
const GROUND_CONTACT_MIN_DOWNWARD = 0.08;
const HEIGHT_SPAN_MIN_TANGENT_DELTA = 0.12;
const TOP_EDGE_MIN_ABS_TANGENT = 0.06;
/** Wall markers within this azimuth distance share one unified wall radius. */
export const STORY_SCENE_3D_MARKER_WALL_CLUSTER_AZIMUTH_TOLERANCE_DEG = 45;
/** Floor furniture may not sit beyond the wall of the nearest cluster within this azimuth distance. */
export const STORY_SCENE_3D_MARKER_FLOOR_WALL_AZIMUTH_TOLERANCE_DEG = 60;

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
  /** Derived walkable-floor slab; never comes from the vision model, so the image factors are placeholders. */
  floor: { x: [0.5, 60], y: [0.02, 0.12], z: [0.5, 60], imageWidthFactor: 0.6, imageHeightFactor: 0.6, floorDepthRatio: 1 },
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

export type StoryScene3dProjectionMarker = Pick<
  StoryScene3DMarker,
  "anchor" | "position" | "size" | "imageRegion"
> & Partial<Pick<StoryScene3DMarker, "kind" | "yawDeg" | "source">>;

export type StoryScene3dProjectionEnvironment = Pick<StoryScene3DEnvironment, "domeRadius">
  & Partial<Pick<StoryScene3DEnvironment, "projectionCenterHeight" | "panoramaHorizonV" | "yawDeg">>;

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

function resolveProjectionRay(
  region: StoryScene3DMarkerImageRegion,
  anchor: StoryScene3DMarker["anchor"],
  verticalAngles: StoryScene3dMarkerVerticalAngles,
  environment: Partial<Pick<StoryScene3DEnvironment, "yawDeg">>,
): StoryScene3dProjectionRay {
  const latitude = anchor === "floor"
    ? verticalAngles.bottomLatitude
    : verticalAngles.centerLatitude;
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

/**
 * Depth recovery from one equirect box. Each estimator uses a different edge of
 * the box, so a sloppy edge only biases one candidate and the combined median
 * stays usable:
 * - ground contact: the bottom edge lies on the floor (all floor furniture and
 *   doors), giving radius = camera height / tan(|bottom latitude|);
 * - known top height: the top edge sits at the kind's typical total height
 *   (valid for objects standing on the floor, not for windows);
 * - known vertical span: the box covers the kind's typical total height, giving
 *   radius = height / (tan(top) - tan(bottom)).
 * Estimates deliberately depend only on the image region, environment, and the
 * kind policy midpoint — never on the model's own size/position guesses — so
 * repeated projection is idempotent.
 */
export interface StoryScene3dMarkerRadiusEstimate {
  radius: number | null;
  /** True when the strongest cue was a floor-contact bottom edge (doors). */
  groundContact: boolean;
}

function markerPolicy(marker: StoryScene3dProjectionMarker) {
  return (marker.kind && STORY_SCENE_3D_MARKER_SIZE_POLICIES[marker.kind])
    ?? STORY_SCENE_3D_MARKER_SIZE_POLICIES.other;
}

function expectedMarkerHeight(marker: StoryScene3dProjectionMarker): number {
  const range = markerPolicy(marker).y;
  return (range[0] + range[1]) / 2;
}

function combineRadiusCandidates(candidates: number[]): number | null {
  const valid = candidates.filter((value) => Number.isFinite(value) && value > 0);
  if (valid.length === 0) return null;
  const sorted = [...valid].sort((a, b) => a - b);
  if (sorted.length % 2 === 1) {
    return sorted[(sorted.length - 1) / 2];
  }
  const first = sorted[sorted.length / 2 - 1];
  const second = sorted[sorted.length / 2];
  return Math.sqrt(first * second);
}

function estimateMarkerRadiusFromRegion(
  marker: StoryScene3dProjectionMarker,
  environment: StoryScene3dProjectionEnvironment,
): StoryScene3dMarkerRadiusEstimate | null {
  if (!marker.imageRegion || marker.source === "manual" || marker.anchor === "ceiling") {
    return null;
  }
  const projectionCenterHeight = finiteOr(environment.projectionCenterHeight, 1.7);
  const domeRadius = Math.max(MIN_MARKER_RADIUS, finiteOr(environment.domeRadius, 15));
  const angles = resolveMarkerVerticalAngles(marker.imageRegion, resolveHorizonV(environment));
  const expectedHeight = expectedMarkerHeight(marker);
  // Only objects standing on the floor expose their base on the ground line and
  // their top edge at the kind's total height. Windows and wall-mounted boxes
  // float at sill/mount height, so only the vertical-span estimator applies.
  const standsOnFloor = marker.anchor === "floor" || marker.kind === "door";
  const candidates: number[] = [];

  // Ground contact: bottom edge on the floor plane.
  const downward = -Math.sin(angles.bottomLatitude);
  if (standsOnFloor && downward > GROUND_CONTACT_MIN_DOWNWARD) {
    candidates.push(projectionCenterHeight * Math.cos(angles.bottomLatitude) / downward);
  }

  // Known top height: the top edge sits at the kind's typical total height.
  if (standsOnFloor) {
    const tanTop = Math.tan(angles.topLatitude);
    const heightDelta = expectedHeight - projectionCenterHeight;
    if (Math.abs(tanTop) >= TOP_EDGE_MIN_ABS_TANGENT && tanTop * heightDelta > 0) {
      candidates.push(heightDelta / tanTop);
    }
  }

  // Known vertical span: works for every anchor because the camera height cancels out.
  const spanDelta = Math.tan(angles.topLatitude) - Math.tan(angles.bottomLatitude);
  if (spanDelta >= HEIGHT_SPAN_MIN_TANGENT_DELTA) {
    candidates.push(expectedHeight / spanDelta);
  }

  const radius = combineRadiusCandidates(
    candidates.map((value) => clamp(value, MIN_MARKER_RADIUS, domeRadius)),
  );
  return {
    radius,
    groundContact: standsOnFloor && downward > GROUND_CONTACT_MIN_DOWNWARD && marker.kind === "door",
  };
}

/**
 * A wall cluster is one planar wall: all wall markers whose azimuths fall within
 * the tolerance share a single radius so doors and windows on the same wall sit
 * at the same depth. Door floor-contact estimates carry extra weight because a
 * door bottom touching the floor is the most reliable depth cue in the image.
 */
export interface StoryScene3dWallCluster {
  azimuthDeg: number;
  radius: number;
  markerCount: number;
}

function azimuthDistance(a: number, b: number): number {
  return Math.abs(normalizeDegrees(a - b));
}

function weightedMedianRadius(entries: Array<{ radius: number; weight: number }>): number | null {
  const sorted = [...entries].sort((a, b) => a.radius - b.radius);
  const totalWeight = sorted.reduce((sum, entry) => sum + entry.weight, 0);
  if (totalWeight <= 0) return null;
  let cumulative = 0;
  for (const entry of sorted) {
    cumulative += entry.weight;
    if (cumulative * 2 >= totalWeight) {
      return entry.radius;
    }
  }
  return sorted[sorted.length - 1]?.radius ?? null;
}

interface StoryScene3dWallClusterEntry {
  azimuth: number;
  estimate: StoryScene3dMarkerRadiusEstimate | null;
}

export function resolveStoryScene3dWallClusters(
  markers: readonly StoryScene3dProjectionMarker[],
  environment: StoryScene3dProjectionEnvironment,
  fallbackRadius: number,
  options: { azimuthToleranceDeg?: number } = {},
): StoryScene3dWallCluster[] {
  const tolerance = finiteOr(options.azimuthToleranceDeg, STORY_SCENE_3D_MARKER_WALL_CLUSTER_AZIMUTH_TOLERANCE_DEG);
  const entries: StoryScene3dWallClusterEntry[] = markers
    .filter((marker) => marker.anchor === "wall" && marker.source !== "manual" && marker.imageRegion)
    .map((marker) => ({
      azimuth: equirectangularRegionCenterToHorizontalDirection(marker.imageRegion as StoryScene3DMarkerImageRegion, environment).azimuthDeg,
      estimate: estimateMarkerRadiusFromRegion(marker, environment),
    }));
  if (entries.length === 0) return [];

  const azimuths = [...entries].sort((a, b) => a.azimuth - b.azimuth).map((entry) => entry.azimuth);
  // Rotate the circular order so clusters never straddle the sorted ends.
  let splitIndex = 0;
  let largestGap = -1;
  for (let index = 0; index < azimuths.length; index += 1) {
    const next = azimuths[(index + 1) % azimuths.length];
    const gap = index === azimuths.length - 1
      ? azimuths[0] + 360 - azimuths[index]
      : next - azimuths[index];
    if (gap > largestGap) {
      largestGap = gap;
      splitIndex = (index + 1) % azimuths.length;
    }
  }
  const ordered = [
    ...entries.slice(splitIndex),
    ...entries.slice(0, splitIndex),
  ];

  const clusters: StoryScene3dWallClusterEntry[][] = [];
  for (const entry of ordered) {
    const current = clusters[clusters.length - 1];
    if (current?.length) {
      const previousAzimuth = current[current.length - 1].azimuth;
      if (azimuthDistance(entry.azimuth, previousAzimuth) > tolerance) {
        clusters.push([entry]);
        continue;
      }
    }
    if (current) {
      current.push(entry);
    } else {
      clusters.push([entry]);
    }
  }
  // Merge the wrap-around ends when they belong to the same wall.
  if (clusters.length > 1) {
    const first = clusters[0];
    const last = clusters[clusters.length - 1];
    if (azimuthDistance(first[0].azimuth, last[last.length - 1].azimuth) <= tolerance) {
      clusters[clusters.length - 1] = [...last, ...first];
      clusters.shift();
    }
  }

  return clusters.map((members) => {
    const radiusEntries: Array<{ radius: number; weight: number }> = [];
    for (const member of members) {
      if (member.estimate?.radius == null) continue;
      radiusEntries.push({
        radius: member.estimate.radius,
        weight: member.estimate.groundContact ? GROUND_CONTACT_CLUSTER_WEIGHT : 1,
      });
    }
    let sumX = 0;
    let sumZ = 0;
    for (const member of members) {
      const rad = member.azimuth * Math.PI / 180;
      sumX += Math.cos(rad);
      sumZ += Math.sin(rad);
    }
    return {
      azimuthDeg: normalizeDegrees(Math.atan2(sumZ, sumX) * 180 / Math.PI),
      radius: weightedMedianRadius(radiusEntries) ?? fallbackRadius,
      markerCount: members.length,
    };
  });
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

export interface StoryScene3dMarkerProjectionHints {
  /** Unified wall-cluster radius for wall/ceiling markers at this azimuth. */
  wallRadius?: number;
  /** Upper radius clamp for floor markers derived from the wall in their direction. */
  floorRadiusLimit?: number;
}

/**
 * Project an AI marker onto the panorama's direction and calibrate its box
 * against the visible image region. Depth comes from the image box itself:
 * floor markers blend the floor-contact, known-top-height, and known-span
 * estimators, while wall/ceiling markers use the per-marker estimate, the
 * unified wall-cluster radius, or the stable fallback radius in that order.
 */
export function projectStoryScene3dMarkerFromImageRegion(
  marker: StoryScene3dProjectionMarker,
  environment: StoryScene3dProjectionEnvironment,
  maxRadius = finiteOr(environment.domeRadius, 15) * STORY_SCENE_3D_MARKER_FALLBACK_WALL_RADIUS_RATIO,
  hints: StoryScene3dMarkerProjectionHints = {},
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
  const domeRadius = Math.max(MIN_MARKER_RADIUS, finiteOr(environment.domeRadius, 15));
  const verticalAngles = resolveMarkerVerticalAngles(marker.imageRegion, resolveHorizonV(environment));
  const projectionRay = resolveProjectionRay(marker.imageRegion, marker.anchor, verticalAngles, environment);
  const radiusEstimate = estimateMarkerRadiusFromRegion(marker, environment);

  let horizontalRadius: number;
  if (marker.anchor === "floor") {
    const limit = clamp(
      finiteOr(hints.floorRadiusLimit, safeMaxRadius),
      MIN_MARKER_RADIUS,
      safeMaxRadius,
    );
    horizontalRadius = radiusEstimate?.radius != null
      ? clamp(radiusEstimate.radius, 0.25, limit)
      : limit;
  } else {
    const candidate = finiteOr(hints.wallRadius, Number.NaN);
    horizontalRadius = clamp(
      Number.isFinite(candidate)
        ? candidate
        : radiusEstimate?.radius ?? safeMaxRadius,
      MIN_MARKER_RADIUS,
      domeRadius,
    );
  }
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

  // Doors always reach the floor, so anchor their calibrated box on it instead
  // of the region center ray; windows keep the center-ray height.
  const centerY = projectionCenterHeight + Math.tan(verticalAngles.centerLatitude) * horizontalRadius;
  const positionY = marker.kind === "door"
    ? size[1] / 2
    : clamp(centerY, size[1] / 2, MAX_MARKER_HEIGHT);

  return {
    position: [
      projectionRay.direction.x * horizontalRadius,
      positionY,
      projectionRay.direction.z * horizontalRadius,
    ],
    size,
    yawDeg: normalizeDegrees(projectionRay.direction.azimuthDeg),
  };
}

/**
 * Set-level projection: markers are not independent — doors and windows reveal
 * the wall depth for their azimuth sector, and that wall clamps how far floor
 * furniture may sit. Manual markers and markers without an image region keep
 * their stored geometry. The result depends only on image regions and the
 * environment, so repeated normalization stays idempotent.
 */
export function projectStoryScene3dMarkerSetFromImageRegions(
  markers: readonly StoryScene3dProjectionMarker[],
  environment: StoryScene3dProjectionEnvironment,
  options: { maxRadius?: number } = {},
): StoryScene3dMarkerProjection[] {
  const safeMaxRadius = Math.max(
    MIN_MARKER_RADIUS,
    finiteOr(
      options.maxRadius,
      finiteOr(environment.domeRadius, 15) * STORY_SCENE_3D_MARKER_FALLBACK_WALL_RADIUS_RATIO,
    ),
  );
  const clusters = resolveStoryScene3dWallClusters(markers, environment, safeMaxRadius);

  return markers.map((marker) => {
    if (marker.source === "manual" || !marker.imageRegion) {
      return projectStoryScene3dMarkerFromImageRegion(marker, environment, safeMaxRadius);
    }
    const hints: StoryScene3dMarkerProjectionHints = {};
    if (marker.imageRegion) {
      const azimuth = equirectangularRegionCenterToHorizontalDirection(marker.imageRegion, environment).azimuthDeg;
      const nearbyClusters = clusters.filter(
        (cluster) => azimuthDistance(cluster.azimuthDeg, azimuth) <= STORY_SCENE_3D_MARKER_FLOOR_WALL_AZIMUTH_TOLERANCE_DEG,
      );
      if (marker.anchor === "floor") {
        const limit = nearbyClusters.length
          ? Math.min(...nearbyClusters.map((cluster) => cluster.radius))
          : safeMaxRadius;
        hints.floorRadiusLimit = limit;
      } else {
        const ownCluster = clusters.find(
          (cluster) => azimuthDistance(cluster.azimuthDeg, azimuth) <= STORY_SCENE_3D_MARKER_WALL_CLUSTER_AZIMUTH_TOLERANCE_DEG,
        );
        if (ownCluster) {
          hints.wallRadius = ownCluster.radius;
        }
      }
    }
    return projectStoryScene3dMarkerFromImageRegion(marker, environment, safeMaxRadius, hints);
  });
}
