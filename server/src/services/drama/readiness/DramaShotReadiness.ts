import { safeJsonParse } from "../utils/json";

export type DramaVisualKind = "video" | "keyframe" | "placeholder";

export interface DramaAudioLineProjection {
  lineIndex: number;
  status?: string;
  audioUrl?: string;
}

export interface DramaAudioProjection {
  status?: string;
  lines?: DramaAudioLineProjection[];
}

export interface DramaVisualReadinessInput {
  videoReady: boolean;
  keyframeReady: boolean;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isDataAudioUrl(value: unknown): value is string {
  return isNonEmptyString(value) && value.trim().startsWith("data:audio/");
}

export function isDramaKeyframeReady(raw: string | null | undefined): boolean {
  const data = safeJsonParse<{ status?: unknown; url?: unknown } | null>(raw, null);
  return data?.status === "done" && isNonEmptyString(data.url);
}

export function isDramaAudioReady(
  projection: DramaAudioProjection | null | undefined,
  expectedLines: Array<{ lineIndex: number }>,
): boolean {
  if (expectedLines.length === 0) {
    return true;
  }
  if (!projection || projection.status !== "ready" || !Array.isArray(projection.lines)) {
    return false;
  }

  const expectedIndexes = new Set(expectedLines.map((line) => line.lineIndex));
  if (expectedIndexes.size !== expectedLines.length || projection.lines.length !== expectedIndexes.size) {
    return false;
  }

  const actualByIndex = new Map(projection.lines.map((line) => [line.lineIndex, line]));
  if (actualByIndex.size !== projection.lines.length) {
    return false;
  }
  for (const lineIndex of expectedIndexes) {
    const line = actualByIndex.get(lineIndex);
    if (!line || line.status !== "ready" || !isDataAudioUrl(line.audioUrl)) {
      return false;
    }
  }
  return true;
}

export function classifyDramaVisual(input: DramaVisualReadinessInput): DramaVisualKind {
  if (input.videoReady) {
    return "video";
  }
  if (input.keyframeReady) {
    return "keyframe";
  }
  return "placeholder";
}
