import type {
  StoryScene3DEnvironment,
  StoryScene3DEnvironmentInput,
  StoryScene3DMarker,
  StoryScene3DMarkerAnchor,
  StoryScene3DMarkerImageRegion,
  StoryScene3DMarkerKind,
  StoryScene3DMarkerSet,
} from "@ai-novel/shared/types/comicDrama";
import {
  STORY_SCENE_3D_DEFAULT_PANORAMA_HORIZON_V,
  STORY_SCENE_3D_ENVIRONMENT_LIMITS,
  STORY_SCENE_3D_MARKER_KINDS,
} from "@ai-novel/shared/types/comicDrama";
import {
  projectStoryScene3dMarkerSetFromImageRegions,
  STORY_SCENE_3D_MARKER_FALLBACK_WALL_RADIUS_RATIO,
} from "@ai-novel/shared/utils/scene3dProjection";

export const STORY_SCENE_3D_MARKER_LIMITS = {
  maxMarkers: 48,
  maxRadius: 50,
  positionY: { min: 0, max: 30 },
  size: { min: 0.05, max: 30 },
  confidence: { min: 0, max: 1 },
} as const;

/** 模型粗估距离的合法区间：只用于同方位前后排序，不做精确测距。 */
export const STORY_SCENE_3D_MARKER_APPROX_DISTANCE = {
  min: 0.5,
  max: 20,
} as const;

const MARKER_KINDS = new Set<string>(STORY_SCENE_3D_MARKER_KINDS);
const MARKER_ANCHORS = new Set<StoryScene3DMarkerAnchor>(["floor", "wall", "ceiling"]);

export type StoryScene3dMarkerProjectionEnvironment = Pick<
  StoryScene3DEnvironment,
  "projectionCenterHeight" | "domeRadius"
> & Partial<Pick<StoryScene3DEnvironment, "panoramaHorizonV" | "yawDeg" | "intensity">>;

function finiteOr(value: unknown, fallback: number): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function vec3(value: unknown, fallback: [number, number, number]): [number, number, number] {
  if (!Array.isArray(value) || value.length !== 3) return [...fallback];
  return [
    finiteOr(value[0], fallback[0]),
    finiteOr(value[1], fallback[1]),
    finiteOr(value[2], fallback[2]),
  ];
}

function normalizeImageRegion(value: unknown): StoryScene3DMarkerImageRegion | undefined {
  if (!value || typeof value !== "object") return undefined;
  const region = value as Record<string, unknown>;
  const width = clamp(finiteOr(region.width, 0), 0, 1);
  const height = clamp(finiteOr(region.height, 0), 0, 1);
  return {
    x: clamp(finiteOr(region.x, 0), 0, 1 - width),
    y: clamp(finiteOr(region.y, 0), 0, 1 - height),
    width,
    height,
  };
}

function normalizeEnvironmentSnapshot(value: unknown): StoryScene3DEnvironmentInput | undefined {
  if (!value || typeof value !== "object") return undefined;
  const source = value as Record<string, unknown>;
  const projectionCenterHeight = finiteOr(source.projectionCenterHeight, Number.NaN);
  const domeRadius = finiteOr(source.domeRadius, Number.NaN);
  if (!Number.isFinite(projectionCenterHeight)
    || !Number.isFinite(domeRadius)) {
    return undefined;
  }
  return {
    projectionCenterHeight: clamp(
      projectionCenterHeight,
      STORY_SCENE_3D_ENVIRONMENT_LIMITS.projectionCenterHeight.min,
      STORY_SCENE_3D_ENVIRONMENT_LIMITS.projectionCenterHeight.max,
    ),
    projectionCenterHeightRatio: typeof source.projectionCenterHeightRatio === "number"
      && Number.isFinite(source.projectionCenterHeightRatio)
      ? clamp(
        source.projectionCenterHeightRatio,
        STORY_SCENE_3D_ENVIRONMENT_LIMITS.projectionCenterHeightRatio.min,
        STORY_SCENE_3D_ENVIRONMENT_LIMITS.projectionCenterHeightRatio.max,
      )
      : undefined,
    domeRadius: clamp(
      domeRadius,
      STORY_SCENE_3D_ENVIRONMENT_LIMITS.domeRadius.min,
      STORY_SCENE_3D_ENVIRONMENT_LIMITS.domeRadius.max,
    ),
    panoramaHorizonV: clamp(
      finiteOr(source.panoramaHorizonV, STORY_SCENE_3D_DEFAULT_PANORAMA_HORIZON_V),
      STORY_SCENE_3D_ENVIRONMENT_LIMITS.panoramaHorizonV.min,
      STORY_SCENE_3D_ENVIRONMENT_LIMITS.panoramaHorizonV.max,
    ),
  };
}

/**
 * 归一化只负责把模型输出的字段收进合法范围；坐标反算统一放在
 * normalizeStoryScene3dMarkerSet 的集合级投影里做，因为门窗的深度证据
 * 要在同一方位的 marker 之间聚类共享，不能逐个独立投影。
 */
function normalizeMarker(
  raw: unknown,
  index: number,
  maxRadius: number,
): StoryScene3DMarker | null {
  if (!raw || typeof raw !== "object") return null;
  const source = raw as Record<string, unknown>;
  // 历史版本曾把服务端合成的可行走地面薄板持久化进标记集合，这里把它清掉。
  if (source.kind === "floor") return null;
  const kind = typeof source.kind === "string" && MARKER_KINDS.has(source.kind)
    ? source.kind as StoryScene3DMarkerKind
    : "other";
  const anchor = typeof source.anchor === "string" && MARKER_ANCHORS.has(source.anchor as StoryScene3DMarkerAnchor)
    ? source.anchor as StoryScene3DMarkerAnchor
    : "floor";
  const rawSize = vec3(source.size, [1, 1, 1]);
  const size: [number, number, number] = [
    clamp(rawSize[0], STORY_SCENE_3D_MARKER_LIMITS.size.min, STORY_SCENE_3D_MARKER_LIMITS.size.max),
    clamp(rawSize[1], STORY_SCENE_3D_MARKER_LIMITS.size.min, STORY_SCENE_3D_MARKER_LIMITS.size.max),
    clamp(rawSize[2], STORY_SCENE_3D_MARKER_LIMITS.size.min, STORY_SCENE_3D_MARKER_LIMITS.size.max),
  ];
  const rawPosition = vec3(source.position, [0, size[1] / 2, 0]);
  const position: [number, number, number] = [
    clamp(rawPosition[0], -maxRadius, maxRadius),
    anchor === "floor"
      ? size[1] / 2
      : clamp(rawPosition[1], STORY_SCENE_3D_MARKER_LIMITS.positionY.min, STORY_SCENE_3D_MARKER_LIMITS.positionY.max),
    clamp(rawPosition[2], -maxRadius, maxRadius),
  ];
  const label = typeof source.label === "string" && source.label.trim()
    ? source.label.trim().slice(0, 80)
    : `固定物体 ${index + 1}`;
  const marker: StoryScene3DMarker = {
    id: typeof source.id === "string" && source.id.trim() ? source.id.trim().slice(0, 80) : `marker-${index + 1}`,
    kind,
    label,
    anchor,
    position,
    size,
    yawDeg: clamp(finiteOr(source.yawDeg, 0), -180, 180),
    confidence: clamp(
      finiteOr(source.confidence, 0.5),
      STORY_SCENE_3D_MARKER_LIMITS.confidence.min,
      STORY_SCENE_3D_MARKER_LIMITS.confidence.max,
    ),
    source: source.source === "manual" ? "manual" : "ai",
  };
  const approxDistance = Number(source.approxDistanceMeters);
  if (Number.isFinite(approxDistance) && approxDistance > 0) {
    marker.approxDistanceMeters = clamp(
      approxDistance,
      STORY_SCENE_3D_MARKER_APPROX_DISTANCE.min,
      STORY_SCENE_3D_MARKER_APPROX_DISTANCE.max,
    );
  }
  if (source.evidence && typeof source.evidence === "string" && source.evidence.trim()) {
    marker.evidence = source.evidence.trim().slice(0, 240);
  }
  const imageRegion = normalizeImageRegion(source.imageRegion);
  if (imageRegion) {
    marker.imageRegion = imageRegion;
  }
  return marker;
}

export function normalizeStoryScene3dMarkerSet(
  input: unknown,
  options: {
    maxRadius?: number;
    environment?: StoryScene3dMarkerProjectionEnvironment;
  } = {},
): StoryScene3DMarkerSet | null {
  if (!input || typeof input !== "object") return null;
  const source = input as Record<string, unknown>;
  const rawMarkers = Array.isArray(source.markers) ? source.markers : [];
  const maxRadius = clamp(
    finiteOr(options.maxRadius, options.environment?.domeRadius
      ? options.environment.domeRadius * STORY_SCENE_3D_MARKER_FALLBACK_WALL_RADIUS_RATIO
      : STORY_SCENE_3D_MARKER_LIMITS.maxRadius),
    1,
    STORY_SCENE_3D_MARKER_LIMITS.maxRadius,
  );
  const markers = rawMarkers
    .slice(0, STORY_SCENE_3D_MARKER_LIMITS.maxMarkers)
    .map((marker, index) => normalizeMarker(marker, index, maxRadius))
    .filter((marker): marker is StoryScene3DMarker => Boolean(marker));
  const usedIds = new Set<string>();
  for (const [index, marker] of markers.entries()) {
    const baseId = (marker.id || `marker-${index + 1}`).slice(0, 72);
    let uniqueId = baseId;
    let suffix = 2;
    while (usedIds.has(uniqueId)) {
      uniqueId = `${baseId}-${suffix}`;
      suffix += 1;
    }
    usedIds.add(uniqueId);
    marker.id = uniqueId.slice(0, 80);
  }
  if (options.environment && markers.length > 0) {
    const projections = projectStoryScene3dMarkerSetFromImageRegions(markers, options.environment);
    for (const [index, projection] of projections.entries()) {
      const marker = markers[index];
      if (!marker || marker.source === "manual" || !marker.imageRegion) continue;
      marker.position = projection.position;
      marker.size = projection.size;
      marker.yawDeg = projection.yawDeg;
    }
  }
  const status = source.status === "error" || source.status === "stale" ? source.status : "ready";
  const result: StoryScene3DMarkerSet = {
    schemaVersion: 1,
    status,
    markers,
  };
  const sourceEnvironment = normalizeEnvironmentSnapshot(source.sourceEnvironment);
  if (sourceEnvironment) {
    result.sourceEnvironment = sourceEnvironment;
  }
  if (typeof source.sourceImageArtifactId === "string" && source.sourceImageArtifactId.trim()) {
    result.sourceImageArtifactId = source.sourceImageArtifactId.trim().slice(0, 160);
  }
  if (typeof source.sourceImageGeneratedAt === "string" && source.sourceImageGeneratedAt.trim()) {
    result.sourceImageGeneratedAt = source.sourceImageGeneratedAt.trim().slice(0, 80);
  }
  if (typeof source.analyzedAt === "string" && source.analyzedAt.trim()) {
    result.analyzedAt = source.analyzedAt.trim().slice(0, 80);
  }
  if (typeof source.analysisNote === "string" && source.analysisNote.trim()) {
    result.analysisNote = source.analysisNote.trim().slice(0, 500);
  }
  if (typeof source.error === "string" && source.error.trim()) {
    result.error = source.error.trim().slice(0, 600);
  }
  return result;
}

export function parseStoryScene3dMarkerSet(
  raw: string | null | undefined,
  options?: {
    maxRadius?: number;
    environment?: StoryScene3dMarkerProjectionEnvironment;
  },
): StoryScene3DMarkerSet | null {
  if (!raw?.trim()) return null;
  try {
    return normalizeStoryScene3dMarkerSet(JSON.parse(raw), options);
  } catch {
    return null;
  }
}

export function serializeStoryScene3dMarkerSet(
  input: unknown,
  options?: {
    maxRadius?: number;
    environment?: StoryScene3dMarkerProjectionEnvironment;
  },
): string | null {
  const normalized = normalizeStoryScene3dMarkerSet(input, options);
  return normalized ? JSON.stringify(normalized) : null;
}

/**
 * Give legacy AI marker sets a current environment snapshot only when every
 * marker has image evidence that can be deterministically projected again.
 * Manual or coordinate-only legacy data stays stale and must be re-identified.
 */
export function adoptLegacyStoryScene3dMarkerEnvironment(
  markerSet: StoryScene3DMarkerSet | null | undefined,
  environment: StoryScene3DEnvironmentInput | null | undefined,
): StoryScene3DMarkerSet | null {
  if (!markerSet || !environment || markerSet.status !== "ready" || markerSet.sourceEnvironment) {
    return markerSet ?? null;
  }
  if (markerSet.markers.length === 0 || markerSet.markers.some((marker) => (
    marker.source === "manual" || !marker.imageRegion
  ))) {
    return markerSet;
  }
  return {
    ...markerSet,
    sourceEnvironment: {
      projectionCenterHeight: environment.projectionCenterHeight,
      ...(environment.projectionCenterHeightRatio != null
        ? { projectionCenterHeightRatio: environment.projectionCenterHeightRatio }
        : {}),
      domeRadius: environment.domeRadius,
      panoramaHorizonV: environment.panoramaHorizonV ?? STORY_SCENE_3D_DEFAULT_PANORAMA_HORIZON_V,
    },
  };
}
