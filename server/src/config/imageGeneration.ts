// 默认超时须覆盖 codex 桥（scripts/codex-image-bridge.cjs）900s 的生成预算：
// 角色/场景/道具资产图全走 codex 订阅通道，复杂四视图经常超过 5 分钟，
// 服务端若提前断开，桥里的 codex 进程仍在跑（浪费额度、占并发槽），前端只见超时。
export const DEFAULT_IMAGE_GENERATION_HTTP_TIMEOUT_MS = 900_000;
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
