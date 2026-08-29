export interface AnimationKeyframe {
  animationId: string;
  dataUrl: string;
  timeSeconds: number;
  updatedAt: string;
}

export const STORAGE_KEY = "animation-library:keyframes:v1";

type KeyframeListener = (animationId: string) => void;

const keyframes = new Map<string, AnimationKeyframe>();
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
    typeof candidate.timeSeconds !== "number" ||
    !Number.isFinite(candidate.timeSeconds) ||
    candidate.timeSeconds < 0
  ) {
    return fail("动画关键帧时间无效。");
  }

  return {
    animationId,
    dataUrl: candidate.dataUrl,
    timeSeconds: candidate.timeSeconds,
    updatedAt:
      typeof candidate.updatedAt === "string" && candidate.updatedAt
        ? candidate.updatedAt
        : new Date().toISOString(),
  };
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
    const raw = storage.getItem(STORAGE_KEY);
    storageState = "available";
    if (!raw) return;

    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return;

    for (const [animationId, value] of Object.entries(parsed)) {
      const keyframe = normalizeKeyframe(animationId, value, {
        throwOnInvalid: false,
      });
      if (keyframe) keyframes.set(animationId, keyframe);
    }
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
    const serialized = Object.fromEntries(keyframes.entries());
    storage.setItem(STORAGE_KEY, JSON.stringify(serialized));
  } catch {
    storageState = "unavailable";
  }
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

export function getAnimationKeyframe(animationId: string): AnimationKeyframe | null {
  loadFromStorage();
  return keyframes.get(animationId) ?? null;
}

export function setAnimationKeyframe(
  animationId: string,
  dataUrl: string,
  timeSeconds: number,
): AnimationKeyframe {
  loadFromStorage();

  const keyframe = normalizeKeyframe(
    animationId,
    { dataUrl, timeSeconds },
    { throwOnInvalid: true },
  );
  if (!keyframe) throw new Error("动画关键帧数据无效。");

  keyframes.set(animationId, keyframe);
  persist();
  notify(animationId);
  return keyframe;
}

export function clearAnimationKeyframe(animationId: string): void {
  loadFromStorage();
  if (!keyframes.delete(animationId)) return;
  persist();
  notify(animationId);
}

export function subscribeAnimationKeyframes(listener: KeyframeListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
