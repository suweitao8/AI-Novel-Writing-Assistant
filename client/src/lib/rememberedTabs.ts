export const REMEMBERED_TAB_STORAGE_PREFIX = "ai-novel.remembered-tab.v1";

function getStorage(): Storage | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function createRememberedTabStorageKey(scope: string): string {
  const normalizedScope = scope.trim() || "default";
  return `${REMEMBERED_TAB_STORAGE_PREFIX}:${encodeURIComponent(normalizedScope)}`;
}

export function isRememberedTabValue<T extends string>(value: unknown, values: readonly T[]): value is T {
  return typeof value === "string" && values.includes(value as T);
}

export function readRememberedTab<T extends string>(
  scope: string,
  defaultValue: T,
  values: readonly T[],
): T {
  const storage = getStorage();
  if (!storage) {
    return defaultValue;
  }

  try {
    const value = storage.getItem(createRememberedTabStorageKey(scope));
    return isRememberedTabValue(value, values) ? value : defaultValue;
  } catch {
    return defaultValue;
  }
}

export function writeRememberedTab<T extends string>(
  scope: string,
  value: T,
  values: readonly T[],
): boolean {
  if (!isRememberedTabValue(value, values)) {
    return false;
  }

  const storage = getStorage();
  if (!storage) {
    return false;
  }

  try {
    storage.setItem(createRememberedTabStorageKey(scope), value);
    return true;
  } catch {
    return false;
  }
}

export function clearRememberedTab(scope: string): void {
  const storage = getStorage();
  if (!storage) {
    return;
  }

  try {
    storage.removeItem(createRememberedTabStorageKey(scope));
  } catch {
    // Browser storage can be disabled or unavailable in embedded contexts.
  }
}
