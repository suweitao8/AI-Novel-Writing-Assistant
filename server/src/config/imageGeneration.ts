// 默认超时 3 分钟（2026-08-23 用户决定，同日从 900s 收紧）：超过 3 分钟大概率是环境问题
// （代理断开、桥挂了），快速失败比干等好；断开时本地 codex 桥会同步杀掉 codex 进程，
// 不浪费订阅额度也不占并发槽（scripts/codex-image-bridge.cjs 客户端断开即终止）。
// 需要更长等待可设 IMAGE_GENERATION_HTTP_TIMEOUT_MS（上限 900s）。
export const DEFAULT_IMAGE_GENERATION_HTTP_TIMEOUT_MS = 180_000;
export const MIN_IMAGE_GENERATION_HTTP_TIMEOUT_MS = 30_000;
export const MAX_IMAGE_GENERATION_HTTP_TIMEOUT_MS = 900_000;

function asInt(rawValue: string | undefined, fallback: number, min: number, max: number): number {
  const normalized = rawValue?.trim();
  if (!normalized) {
    return fallback;
  }
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  const value = Math.floor(parsed);
  return Math.max(min, Math.min(max, value));
}

function resolveImageGenerationHttpTimeoutMs(): number {
  const globalTimeoutMs = asInt(
    process.env.LLM_REQUEST_TIMEOUT_MS,
    DEFAULT_IMAGE_GENERATION_HTTP_TIMEOUT_MS,
    MIN_IMAGE_GENERATION_HTTP_TIMEOUT_MS,
    MAX_IMAGE_GENERATION_HTTP_TIMEOUT_MS,
  );
  return asInt(
    process.env.IMAGE_GENERATION_HTTP_TIMEOUT_MS,
    Math.max(globalTimeoutMs, DEFAULT_IMAGE_GENERATION_HTTP_TIMEOUT_MS),
    MIN_IMAGE_GENERATION_HTTP_TIMEOUT_MS,
    MAX_IMAGE_GENERATION_HTTP_TIMEOUT_MS,
  );
}

export const imageGenerationConfig = {
  httpTimeoutMs: resolveImageGenerationHttpTimeoutMs(),
};
