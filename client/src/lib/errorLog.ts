// 客户端本地报错日志：所有 toast.error 与未捕获异常都会记入，
// 供"系统设置 → 最近报错日志"展示。数据只存本机 localStorage，不上传。
export interface ErrorLogEntry {
  id: string;
  time: string;
  message: string;
  description?: string;
}

const STORAGE_KEY = "ai-novel.error-log.v1";
const MAX_ENTRIES = 100;
export const ERROR_LOG_UPDATED_EVENT = "ai-novel:error-log-updated";

function safeStorage(): Storage | null {
  try {
    if (typeof window === "undefined" || !window.localStorage) {
      return null;
    }
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readErrorLog(): ErrorLogEntry[] {
  const storage = safeStorage();
  if (!storage) {
    return [];
  }
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((item): item is ErrorLogEntry => (
      Boolean(item)
      && typeof (item as ErrorLogEntry).id === "string"
      && typeof (item as ErrorLogEntry).time === "string"
      && typeof (item as ErrorLogEntry).message === "string"
    )).slice(0, MAX_ENTRIES);
  } catch {
    return [];
  }
}

export function recordErrorLog(message: string, description?: string): void {
  const normalizedMessage = message?.trim();
  if (!normalizedMessage) {
    return;
  }
  const entries = readErrorLog();
  entries.unshift({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    time: new Date().toISOString(),
    message: normalizedMessage.slice(0, 500),
    ...(description?.trim() ? { description: description.trim().slice(0, 1000) } : {}),
  });
  const storage = safeStorage();
  if (!storage) {
    return;
  }
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES)));
    window.dispatchEvent(new CustomEvent(ERROR_LOG_UPDATED_EVENT));
  } catch {
    // 写入失败（隐私模式/配额满）时静默跳过，不影响报错提示本身。
  }
}

export function clearErrorLog(): void {
  const storage = safeStorage();
  if (!storage) {
    return;
  }
  try {
    storage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new CustomEvent(ERROR_LOG_UPDATED_EVENT));
  } catch {
    // 同上，清空失败时静默跳过。
  }
}

/** 记录未捕获异常到本地报错日志；在应用入口调用一次。 */
export function installGlobalErrorCapture(): void {
  if (typeof window === "undefined") {
    return;
  }
  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    recordErrorLog(
      reason instanceof Error ? reason.message : String(reason ?? "未处理的 Promise 异常"),
    );
  });
  window.addEventListener("error", (event) => {
    recordErrorLog(event.message || "页面运行错误");
  });
}
