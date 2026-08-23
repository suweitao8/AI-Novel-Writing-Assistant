export interface StartupProbeResult {
  ready: boolean;
  diagnostic?: string;
}

export async function probeStartupHealth(
  url: string,
  signal: AbortSignal,
  fetchImpl: typeof fetch = fetch,
): Promise<StartupProbeResult> {
  try {
    const response = await fetchImpl(url, {
      cache: "no-store",
      signal,
    });
    if (response.ok) {
      return { ready: true };
    }
    if (response.status === 404) {
      return {
        ready: false,
        diagnostic: "服务地址未提供健康检查（HTTP 404）。",
      };
    }
    return {
      ready: false,
      diagnostic: `本地创作服务返回错误（HTTP ${response.status}）。`,
    };
  } catch {
    return {
      ready: false,
      diagnostic: "本地创作服务没有响应。",
    };
  }
}
