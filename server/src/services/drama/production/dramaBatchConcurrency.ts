/**
 * Short-drama image batch concurrency policy.
 *
 * The local image bridges can run at most four image requests safely for the
 * current production setup. Keep this policy separate from the generic worker
 * pool so persisted job progress and resumed jobs use the same normalization.
 */
export const MIN_DRAMA_KEYFRAME_BATCH_CONCURRENCY = 1;
export const MAX_DRAMA_KEYFRAME_BATCH_CONCURRENCY = 4;
export const DEFAULT_DRAMA_KEYFRAME_BATCH_CONCURRENCY = MAX_DRAMA_KEYFRAME_BATCH_CONCURRENCY;

export function normalizeDramaKeyframeBatchConcurrency(value: unknown): number {
  if (value === null || (typeof value === "string" && value.trim() === "")) {
    return DEFAULT_DRAMA_KEYFRAME_BATCH_CONCURRENCY;
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return DEFAULT_DRAMA_KEYFRAME_BATCH_CONCURRENCY;
  }
  return Math.min(
    MAX_DRAMA_KEYFRAME_BATCH_CONCURRENCY,
    Math.max(MIN_DRAMA_KEYFRAME_BATCH_CONCURRENCY, Math.floor(numeric)),
  );
}

/**
 * Short-drama TTS batch concurrency policy: how many shots a batch voice job
 * advances at once. Each shot's lines additionally share the process-wide
 * synthesis gate, so shot-level workers only add pipeline overlap and never
 * multiply the load on the local speech service.
 */
export const MIN_DRAMA_TTS_BATCH_CONCURRENCY = 1;
export const MAX_DRAMA_TTS_BATCH_CONCURRENCY = 4;
export const DEFAULT_DRAMA_TTS_BATCH_CONCURRENCY = 2;

export function normalizeDramaTtsBatchConcurrency(value: unknown): number {
  if (value === null || (typeof value === "string" && value.trim() === "")) {
    return DEFAULT_DRAMA_TTS_BATCH_CONCURRENCY;
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return DEFAULT_DRAMA_TTS_BATCH_CONCURRENCY;
  }
  return Math.min(
    MAX_DRAMA_TTS_BATCH_CONCURRENCY,
    Math.max(MIN_DRAMA_TTS_BATCH_CONCURRENCY, Math.floor(numeric)),
  );
}
