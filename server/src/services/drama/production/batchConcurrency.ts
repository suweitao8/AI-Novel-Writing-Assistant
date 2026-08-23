/**
 * Runs asynchronous batch work with a fixed number of workers.
 *
 * The worker callback owns error handling for each item. Keeping the scheduler
 * generic makes the concurrency limit explicit without changing the lifecycle
 * of the surrounding batch job.
 */
export async function runWithConcurrency<T>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>,
): Promise<void> {
  if (items.length === 0) {
    return;
  }

  const limit = Math.min(items.length, Math.max(1, Math.floor(concurrency)));
  let cursor = 0;

  const runWorker = async () => {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) {
        return;
      }
      await worker(items[index] as T, index);
    }
  };

  await Promise.all(Array.from({ length: limit }, () => runWorker()));
}
