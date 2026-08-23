export const DEFAULT_DRAMA_REMOTION_CONCURRENCY = 4;
const MAX_DRAMA_REMOTION_CONCURRENCY = 8;

export function resolveDramaRemotionConcurrency(env: Record<string, string | undefined> = process.env): number {
  const raw = env.DRAMA_REMOTION_CONCURRENCY?.trim();
  if (!raw || !/^\d+$/.test(raw)) {
    return DEFAULT_DRAMA_REMOTION_CONCURRENCY;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return DEFAULT_DRAMA_REMOTION_CONCURRENCY;
  }
  return Math.min(MAX_DRAMA_REMOTION_CONCURRENCY, parsed);
}
