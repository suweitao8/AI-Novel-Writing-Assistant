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
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return DEFAULT_DRAMA_KEYFRAME_BATCH_CONCURRENCY;
  }
  return Math.min(
    MAX_DRAMA_KEYFRAME_BATCH_CONCURRENCY,
    Math.max(MIN_DRAMA_KEYFRAME_BATCH_CONCURRENCY, Math.floor(numeric)),
  );
}
