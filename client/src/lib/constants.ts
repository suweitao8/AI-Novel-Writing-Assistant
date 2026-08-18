const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);
type ViteRuntimeEnv = Partial<ImportMetaEnv> & {
  DEV?: boolean;
  VITE_API_BASE_URL?: string;
  VITE_API_TIMEOUT_MS?: string;
  VITE_APP_VERSION?: string;
};
type BrowserLocation = Pick<Location, "protocol" | "hostname" | "origin">;

function isLoopbackHost(hostname: string | null | undefined): boolean {
  return Boolean(hostname) && LOOPBACK_HOSTS.has(String(hostname).toLowerCase());
}

function trimTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function resolveViteEnv(): ViteRuntimeEnv {
  return (import.meta as ImportMeta & { env?: ViteRuntimeEnv }).env ?? {};
}

const viteEnv = resolveViteEnv();

export const APP_VERSION = viteEnv.VITE_APP_VERSION?.trim() || "0.0.0";

interface ResolveApiBaseUrlInput {
  viteEnv?: ViteRuntimeEnv;
  windowLocation?: BrowserLocation | null;
}

export function resolveApiBaseUrlForEnvironment({
  viteEnv: env = {},
  windowLocation = null,
}: ResolveApiBaseUrlInput): string {
  const configuredBaseUrl = env.VITE_API_BASE_URL?.trim();
  if (!windowLocation) {
    return configuredBaseUrl || "http://localhost:3000/api";
  }

  if (!env.DEV) {
    return configuredBaseUrl || "/api";
  }

  if (!configuredBaseUrl) {
    return "/api";
  }

  try {
    const parsed = new URL(configuredBaseUrl, windowLocation.origin);
    if (!isLoopbackHost(parsed.hostname) || isLoopbackHost(windowLocation.hostname)) {
      return trimTrailingSlash(parsed.toString());
    }
    parsed.hostname = windowLocation.hostname;
    if (!parsed.port) {
      parsed.port = "3000";
    }
    return trimTrailingSlash(parsed.toString());
  } catch {
    return configuredBaseUrl;
  }
}

function resolveApiBaseUrl(): string {
  return resolveApiBaseUrlForEnvironment({
    viteEnv,
    windowLocation: typeof window === "undefined" ? null : window.location,
  });
}

// 开发环境优先把 API 指向当前页面所在主机，避免局域网访问时仍被锁到 localhost。
export const API_BASE_URL = resolveApiBaseUrl();

const DEFAULT_API_TIMEOUT_MS = 10 * 60 * 1000;

function parseApiTimeoutMs(rawValue: string | number | undefined): number {
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed) || parsed < 1000) {
    return DEFAULT_API_TIMEOUT_MS;
  }
  return Math.floor(parsed);
}

export const API_TIMEOUT_MS = parseApiTimeoutMs(viteEnv.VITE_API_TIMEOUT_MS);
