export interface AnimationKeyframe {
  animationId: string;
  dataUrl: string;
  frame: number;
  frameRate: number;
  updatedAt: string;
}

interface LegacyAnimationKeyframe {
  dataUrl: string;
  timeSeconds: number;
  updatedAt?: string;
}

export const STORAGE_KEY = "animation-library:keyframes:v3";
export const LEGACY_STORAGE_KEY = "animation-library:keyframes:v2";

const DEFAULT_FRAME_RATE = 30;
const MAX_FRAME_RATE = 240;

type KeyframeListener = (animationId: string) => void;

const keyframes = new Map<string, AnimationKeyframe>();
const legacyKeyframes = new Map<string, LegacyAnimationKeyframe>();
const listeners = new Set<KeyframeListener>();
let hasLoaded = false;
let storageState: "unknown" | "available" | "unavailable" = "unknown";

function getBrowserStorage(): Storage | null {
  if (typeof window === "undefined") return null;

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function normalizeFrameRate(value: unknown, fallback = DEFAULT_FRAME_RATE): number | null {
  if (typeof value === "number" && Number.isInteger(value) && value > 0 && value <= MAX_FRAME_RATE) {
    return value;
  }
  return fallback > 0 && fallback <= MAX_FRAME_RATE ? Math.round(fallback) : null;
}

function normalizeKeyframe(
  animationId: string,
  value: unknown,
  options: { throwOnInvalid: boolean },
): AnimationKeyframe | null {
  const fail = (message: string): null => {
    if (options.throwOnInvalid) throw new Error(message);
    return null;
  };

  if (!animationId.trim()) return fail("动画关键帧缺少动画 ID。");
  if (!value || typeof value !== "object") return fail("动画关键帧数据无效。");

  const candidate = value as Partial<AnimationKeyframe>;
  if (
    typeof candidate.dataUrl !== "string" ||
    !/^data:image\//i.test(candidate.dataUrl)
  ) {
    return fail("动画关键帧必须是图片数据。");
  }

  if (
    typeof candidate.frame !== "number" ||
    !Number.isInteger(candidate.frame) ||
    candidate.frame < 0
  ) {
    return fail("动画关键帧序号无效。");
  }

  const frameRate = normalizeFrameRate(candidate.frameRate, Number.NaN);
  if (frameRate === null) return fail("动画关键帧帧率无效。");

  return {
    animationId,
    dataUrl: candidate.dataUrl,
    frame: candidate.frame,
    frameRate,
    updatedAt:
      typeof candidate.updatedAt === "string" && candidate.updatedAt
        ? candidate.updatedAt
        : new Date().toISOString(),
  };
}

function normalizeLegacyKeyframe(value: unknown): LegacyAnimationKeyframe | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<LegacyAnimationKeyframe>;
  if (
    typeof candidate.dataUrl !== "string" ||
    !/^data:image\//i.test(candidate.dataUrl) ||
    typeof candidate.timeSeconds !== "number" ||
    !Number.isFinite(candidate.timeSeconds) ||
    candidate.timeSeconds < 0
  ) {
    return null;
  }

  return {
    dataUrl: candidate.dataUrl,
    timeSeconds: candidate.timeSeconds,
    updatedAt:
      typeof candidate.updatedAt === "string" && candidate.updatedAt
        ? candidate.updatedAt
        : undefined,
  };
}

function parseStorageRecord(raw: string | null): Record<string, unknown> {
  if (!raw) return {};

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed as Record<string, unknown>;
  } catch {
    return {};
  }
}

function loadFromStorage(): void {
  if (hasLoaded) return;
  hasLoaded = true;

  const storage = getBrowserStorage();
  if (!storage) {
    storageState = "unavailable";
    return;
  }

  try {
    for (const [animationId, value] of Object.entries(
      parseStorageRecord(storage.getItem(STORAGE_KEY)),
    )) {
      const keyframe = normalizeKeyframe(animationId, value, {
        throwOnInvalid: false,
      });
      if (keyframe) keyframes.set(animationId, keyframe);
    }

    for (const [animationId, value] of Object.entries(
      parseStorageRecord(storage.getItem(LEGACY_STORAGE_KEY)),
    )) {
      const keyframe = normalizeLegacyKeyframe(value);
      if (keyframe) legacyKeyframes.set(animationId, keyframe);
    }

    storageState = "available";
  } catch {
    storageState = "unavailable";
  }
}

function persist(): void {
  if (storageState !== "available") return;

  const storage = getBrowserStorage();
  if (!storage) {
    storageState = "unavailable";
    return;
  }

  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(keyframes.entries())));
    if (legacyKeyframes.size > 0) {
      storage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(Object.fromEntries(legacyKeyframes.entries())));
    } else {
      storage.removeItem(LEGACY_STORAGE_KEY);
    }
  } catch {
    storageState = "unavailable";
  }
}

function migrateLegacyKeyframe(
  animationId: string,
  frameRate: number,
): AnimationKeyframe | null {
  const legacy = legacyKeyframes.get(animationId);
  if (!legacy) return null;

  const safeFrameRate = normalizeFrameRate(frameRate) ?? DEFAULT_FRAME_RATE;
  const keyframe = normalizeKeyframe(
    animationId,
    {
      dataUrl: legacy.dataUrl,
      frame: Math.max(0, Math.round(legacy.timeSeconds * safeFrameRate)),
      frameRate: safeFrameRate,
      updatedAt: legacy.updatedAt,
    },
    { throwOnInvalid: false },
  );
  legacyKeyframes.delete(animationId);
  if (!keyframe) {
    persist();
    return null;
  }

  keyframes.set(animationId, keyframe);
  persist();
  return keyframe;
}

function notify(animationId: string): void {
  for (const listener of listeners) {
    try {
      listener(animationId);
    } catch {
      // A stale UI subscriber must not break persistence for other consumers.
    }
  }
}

export function getAnimationKeyframe(
  animationId: string,
  frameRate = DEFAULT_FRAME_RATE,
): AnimationKeyframe | null {
  loadFromStorage();
  return keyframes.get(animationId) ?? migrateLegacyKeyframe(animationId, frameRate);
}

export function setAnimationKeyframe(
  animationId: string,
  dataUrl: string,
  frame: number,
  frameRate: number,
): AnimationKeyframe {
  loadFromStorage();

  const keyframe = normalizeKeyframe(
    animationId,
    { dataUrl, frame, frameRate },
    { throwOnInvalid: true },
  );
  if (!keyframe) throw new Error("动画关键帧数据无效。");

  keyframes.set(animationId, keyframe);
  legacyKeyframes.delete(animationId);
  persist();
  notify(animationId);
  return keyframe;
}

export function clearAnimationKeyframe(animationId: string): void {
  loadFromStorage();
  const removed = keyframes.delete(animationId) || legacyKeyframes.delete(animationId);
  if (!removed) return;
  persist();
  notify(animationId);
}

export function subscribeAnimationKeyframes(listener: KeyframeListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
