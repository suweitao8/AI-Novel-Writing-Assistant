export interface AnimationTrackTimingLike {
  inputs?: readonly {
    components?: unknown;
    data?: unknown;
  }[];
}

export const DEFAULT_ANIMATION_FRAME_RATE = 30;
export const DEFAULT_PREVIEW_FRAME_FRACTION = 0.5;

const MIN_FRAME_RATE = 1;
const MAX_FRAME_RATE = 240;

function normalizeFrameRate(value: number, fallback = DEFAULT_ANIMATION_FRAME_RATE): number {
  const safeFallback = Number.isFinite(fallback) && fallback >= MIN_FRAME_RATE
    ? Math.min(Math.round(fallback), MAX_FRAME_RATE)
    : DEFAULT_ANIMATION_FRAME_RATE;
  if (!Number.isFinite(value) || value < MIN_FRAME_RATE) return safeFallback;
  return Math.min(Math.round(value), MAX_FRAME_RATE);
}

function normalizeDuration(durationSeconds: number): number {
  return Number.isFinite(durationSeconds) && durationSeconds > 0 ? durationSeconds : 0;
}

export function getAnimationFrameCount(durationSeconds: number, frameRate: number): number {
  const duration = normalizeDuration(durationSeconds);
  const fps = normalizeFrameRate(frameRate);
  return Math.max(1, Math.round(duration * fps) + 1);
}

export function getDefaultAnimationFrame(durationSeconds: number, frameRate: number): number {
  const lastFrame = getAnimationFrameCount(durationSeconds, frameRate) - 1;
  return Math.round(lastFrame * DEFAULT_PREVIEW_FRAME_FRACTION);
}

export function clampAnimationFrame(frame: number, lastFrame: number): number {
  const safeLastFrame = Number.isFinite(lastFrame) && lastFrame > 0
    ? Math.floor(lastFrame)
    : 0;
  if (!Number.isFinite(frame)) return 0;
  return Math.min(Math.max(Math.round(frame), 0), safeLastFrame);
}

export function frameToSeconds(
  frame: number,
  frameRate: number,
  durationSeconds: number,
): number {
  const duration = normalizeDuration(durationSeconds);
  const fps = normalizeFrameRate(frameRate);
  const lastFrame = getAnimationFrameCount(duration, fps) - 1;
  const safeFrame = clampAnimationFrame(frame, lastFrame);
  return Math.min(duration, safeFrame / fps);
}

export function secondsToFrame(
  seconds: number,
  frameRate: number,
  durationSeconds: number,
): number {
  const duration = normalizeDuration(durationSeconds);
  const fps = normalizeFrameRate(frameRate);
  const lastFrame = getAnimationFrameCount(duration, fps) - 1;
  if (!Number.isFinite(seconds)) return 0;
  return clampAnimationFrame(Math.max(0, seconds) * fps, lastFrame);
}

function asFiniteNumbers(value: unknown): number[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is number => typeof item === "number" && Number.isFinite(item));
  }
  if (ArrayBuffer.isView(value)) {
    return Array.from(value as unknown as ArrayLike<number>).filter((item) => Number.isFinite(item));
  }
  return [];
}

export function inferAnimationFrameRate(
  track: AnimationTrackTimingLike,
  fallback: number,
): number {
  const deltas: number[] = [];
  for (const input of track?.inputs ?? []) {
    if (input?.components !== 1) continue;
    const times = asFiniteNumbers(input.data);
    for (let index = 1; index < times.length; index += 1) {
      const delta = times[index] - times[index - 1];
      if (delta > 1e-5 && Number.isFinite(delta)) deltas.push(delta);
    }
  }
  if (deltas.length === 0) return normalizeFrameRate(fallback);
  deltas.sort((left, right) => left - right);
  const middle = Math.floor(deltas.length / 2);
  const median = deltas.length % 2 === 1
    ? deltas[middle]
    : (deltas[middle - 1] + deltas[middle]) / 2;
  const inferred = 1 / median;
  if (!Number.isFinite(inferred) || inferred < MIN_FRAME_RATE || inferred > MAX_FRAME_RATE) {
    return normalizeFrameRate(fallback);
  }
  return normalizeFrameRate(inferred, fallback);
}
