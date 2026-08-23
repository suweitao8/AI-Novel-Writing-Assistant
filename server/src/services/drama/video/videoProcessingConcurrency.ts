const MIN_DRAMA_VIDEO_CONCURRENCY = 1;
const MAX_DRAMA_VIDEO_CONCURRENCY = 8;

export const DEFAULT_DRAMA_VIDEO_PREPARATION_CONCURRENCY = 3;
export const DEFAULT_DRAMA_VIDEO_MEDIA_COPY_CONCURRENCY = 4;

export function resolveDramaVideoPreparationConcurrency(
  env: Record<string, string | undefined> = process.env,
): number {
  return resolveDramaVideoConcurrency(
    env.DRAMA_VIDEO_PREPARATION_CONCURRENCY,
    DEFAULT_DRAMA_VIDEO_PREPARATION_CONCURRENCY,
  );
}

export function resolveDramaVideoMediaCopyConcurrency(
  env: Record<string, string | undefined> = process.env,
): number {
  return resolveDramaVideoConcurrency(
    env.DRAMA_VIDEO_MEDIA_COPY_CONCURRENCY,
    DEFAULT_DRAMA_VIDEO_MEDIA_COPY_CONCURRENCY,
  );
}

/**
 * Runs independent video-processing work without letting completion order affect
 * the ordered media timeline. The first worker error is rethrown after active
 * workers finish, so callers can safely clean the whole temporary directory.
 */
export async function mapDramaVideoTasksInOrder<T, Result>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<Result>,
): Promise<Result[]> {
  if (items.length === 0) {
    return [];
  }

  const limit = Math.min(items.length, normalizeConcurrency(concurrency));
  const results = new Array<Result>(items.length);
  let cursor = 0;
  let firstError: unknown = null;

  const runWorker = async () => {
    while (!firstError) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) {
        return;
      }
      try {
        results[index] = await worker(items[index] as T, index);
      } catch (error) {
        firstError ??= error;
        return;
      }
    }
  };

  await Promise.all(Array.from({ length: limit }, () => runWorker()));
  if (firstError) {
    throw firstError;
  }
  return results;
}

function resolveDramaVideoConcurrency(value: string | undefined, fallback: number): number {
  const normalized = value?.trim();
  if (!normalized || !/^\d+$/.test(normalized)) {
    return fallback;
  }
  const parsed = Number.parseInt(normalized, 10);
  return Number.isInteger(parsed) && parsed > 0
    ? normalizeConcurrency(parsed)
    : fallback;
}

function normalizeConcurrency(value: number): number {
  return Math.max(MIN_DRAMA_VIDEO_CONCURRENCY, Math.min(MAX_DRAMA_VIDEO_CONCURRENCY, Math.floor(value)));
}
