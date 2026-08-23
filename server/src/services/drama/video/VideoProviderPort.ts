export interface VideoGenerationRequest {
  prompt: string;
  negativePrompt?: string | null;
  aspectRatio: string;
  durationSec?: number | null;
  refImages?: string[];
  // 本地合成通道使用的私有输入：台词配音（dataUrl）与静态分镜画面本地路径。
  // HTTP 通道转发前会剥离这些字段。
  audioDataUrls?: string[];
  localImagePaths?: string[];
}

export interface VideoGenerationResult {
  providerTaskId: string;
  status: "queued" | "running" | "succeeded" | "failed";
  resultUrl?: string;
  failureReason?: string;
  raw?: unknown;
}

export interface VideoProviderPort {
  readonly provider: string;
  readonly label?: string;
  readonly description?: string;
  readonly supportsRefImages?: boolean;
  readonly costPerSecond?: number;
  readonly currency?: string;
  createTask(input: VideoGenerationRequest): Promise<VideoGenerationResult>;
  getTask(providerTaskId: string): Promise<VideoGenerationResult>;
}

import { LocalFfmpegVideoProvider } from "./LocalFfmpegVideoProvider";

export class MockVideoProvider implements VideoProviderPort {
  readonly provider = "mock";
  readonly label = "模拟视频通道";
  readonly description = "用于联调视频生成链路的本地模拟 provider，不会生成真实视频。";
  readonly supportsRefImages = true;
  readonly costPerSecond = normalizeCostValue(process.env.DRAMA_VIDEO_MOCK_COST_PER_SECOND);
  readonly currency = readCostCurrency();

  async createTask(input: VideoGenerationRequest): Promise<VideoGenerationResult> {
    return {
      providerTaskId: `mock_${Date.now()}`,
      status: "queued",
      raw: input,
    };
  }

  async getTask(providerTaskId: string): Promise<VideoGenerationResult> {
    return {
      providerTaskId,
      status: "queued",
    };
  }
}

type VideoProviderStatus = VideoGenerationResult["status"];

function normalizeStatus(value: unknown): VideoProviderStatus {
  const raw = String(value ?? "").trim().toLowerCase();
  if (["success", "succeeded", "completed", "complete", "done", "finished"].includes(raw)) {
    return "succeeded";
  }
  if (["fail", "failed", "error", "cancelled", "canceled"].includes(raw)) {
    return "failed";
  }
  if (["running", "processing", "generating", "in_progress"].includes(raw)) {
    return "running";
  }
  return "queued";
}

function readStringField(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

function normalizeTimeoutMs(value: unknown): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 120000;
}

function normalizeCostValue(value: unknown): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : 0;
}

function readCostCurrency(): string {
  return process.env.DRAMA_COST_CURRENCY?.trim() || "CNY";
}

function normalizeBooleanFlag(value: unknown): boolean {
  const raw = String(value ?? "").trim().toLowerCase();
  return ["1", "true", "yes", "y", "on"].includes(raw);
}

function buildProviderCreateBody(
  input: VideoGenerationRequest,
  supportsRefImages: boolean,
): VideoGenerationRequest {
  const { audioDataUrls: _audioDataUrls, localImagePaths: _localImagePaths, ...rest } = input;
  if (supportsRefImages) {
    return rest;
  }
  const { refImages: _refImages, ...remote } = rest;
  return remote;
}

function normalizeProviderPayload(payload: Record<string, unknown>, fallbackTaskId: string): VideoGenerationResult {
  const status = normalizeStatus(payload.status);
  return {
    providerTaskId: readStringField(payload, ["providerTaskId", "taskId", "id", "requestId"]) ?? fallbackTaskId,
    status,
    resultUrl: readStringField(payload, ["resultUrl", "videoUrl", "url"]),
    failureReason: status === "failed" ? readStringField(payload, ["failureReason", "error", "message"]) : undefined,
    raw: payload,
  };
}

async function readJsonResponse(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  if (!text.trim()) {
    return {};
  }
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { rawText: text };
  }
}

export class HttpVideoProvider implements VideoProviderPort {
  readonly provider: string;
  readonly label: string;
  readonly description?: string;
  readonly supportsRefImages: boolean;
  readonly costPerSecond: number;
  readonly currency: string;

  constructor(private readonly config: {
    provider: string;
    label?: string;
    description?: string;
    createUrl: string;
    statusUrl?: string;
    apiKey?: string;
    timeoutMs?: number;
    supportsRefImages?: boolean;
    costPerSecond?: number;
    currency?: string;
  }) {
    this.provider = config.provider;
    this.label = config.label ?? config.provider;
    this.description = config.description;
    this.supportsRefImages = config.supportsRefImages ?? false;
    this.costPerSecond = normalizeCostValue(config.costPerSecond);
    this.currency = config.currency?.trim() || readCostCurrency();
  }

  async createTask(input: VideoGenerationRequest): Promise<VideoGenerationResult> {
    const payload = await this.postJson(
      this.config.createUrl,
      buildProviderCreateBody(input, this.supportsRefImages),
    );
    return normalizeProviderPayload(payload, `http_${Date.now()}`);
  }

  async getTask(providerTaskId: string): Promise<VideoGenerationResult> {
    if (!this.config.statusUrl) {
      return {
        providerTaskId,
        status: "queued",
        raw: { message: "statusUrl is not configured" },
      };
    }
    const url = this.config.statusUrl.replace("{taskId}", encodeURIComponent(providerTaskId));
    const payload = await this.getJson(url);
    return normalizeProviderPayload(payload, providerTaskId);
  }

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (this.config.apiKey) {
      headers.Authorization = `Bearer ${this.config.apiKey}`;
    }
    return headers;
  }

  private async postJson(url: string, body: unknown): Promise<Record<string, unknown>> {
    const response = await fetch(url, {
      method: "POST",
      headers: this.buildHeaders(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(normalizeTimeoutMs(this.config.timeoutMs)),
    });
    const payload = await readJsonResponse(response);
    if (!response.ok) {
      throw new Error(`视频通道创建任务失败：${response.status} ${response.statusText}`);
    }
    return payload;
  }

  private async getJson(url: string): Promise<Record<string, unknown>> {
    const response = await fetch(url, {
      method: "GET",
      headers: this.buildHeaders(),
      signal: AbortSignal.timeout(normalizeTimeoutMs(this.config.timeoutMs)),
    });
    const payload = await readJsonResponse(response);
    if (!response.ok) {
      throw new Error(`视频通道查询任务失败：${response.status} ${response.statusText}`);
    }
    return payload;
  }
}

class VideoProviderRegistry {
  private readonly providers = new Map<string, VideoProviderPort>();

  register(provider: VideoProviderPort): void {
    this.providers.set(provider.provider, provider);
  }

  has(provider: string): boolean {
    return this.providers.has(provider);
  }

  resolve(provider: string): VideoProviderPort {
    const resolved = this.providers.get(provider);
    if (!resolved) {
      throw new Error(`未注册的视频 provider：${provider}`);
    }
    return resolved;
  }

  listProviders(): Array<{
    provider: string;
    label: string;
    description?: string;
    supportsRefImages: boolean;
    costPerSecond: number;
    currency: string;
    isDefault: boolean;
  }> {
    const defaultProvider = resolveDefaultVideoProvider();
    return [...this.providers.values()].map((provider) => ({
      provider: provider.provider,
      label: provider.label ?? provider.provider,
      description: provider.description,
      supportsRefImages: provider.supportsRefImages ?? false,
      costPerSecond: provider.costPerSecond ?? 0,
      currency: provider.currency ?? readCostCurrency(),
      isDefault: provider.provider === defaultProvider,
    }));
  }
}

export const videoProviderRegistry = new VideoProviderRegistry();

export function resolveDefaultVideoProvider(): string {
  const configured = process.env.DRAMA_VIDEO_DEFAULT_PROVIDER?.trim();
  if (configured && videoProviderRegistry.has(configured)) {
    return configured;
  }
  if (videoProviderRegistry.has("local_ffmpeg")) {
    return "local_ffmpeg";
  }
  return "mock";
}

videoProviderRegistry.register(new MockVideoProvider());
videoProviderRegistry.register(new LocalFfmpegVideoProvider());

const httpCreateUrl = process.env.DRAMA_VIDEO_HTTP_CREATE_URL?.trim();
if (httpCreateUrl) {
  videoProviderRegistry.register(new HttpVideoProvider({
    provider: process.env.DRAMA_VIDEO_HTTP_PROVIDER_ID?.trim() || "http",
    label: process.env.DRAMA_VIDEO_HTTP_PROVIDER_LABEL?.trim() || "HTTP 视频通道",
    description: process.env.DRAMA_VIDEO_HTTP_PROVIDER_DESCRIPTION?.trim() || "通过环境变量配置的外部视频生成服务。",
    createUrl: httpCreateUrl,
    statusUrl: process.env.DRAMA_VIDEO_HTTP_STATUS_URL?.trim() || undefined,
    apiKey: process.env.DRAMA_VIDEO_HTTP_API_KEY?.trim() || undefined,
    timeoutMs: normalizeTimeoutMs(process.env.DRAMA_VIDEO_HTTP_TIMEOUT_MS),
    supportsRefImages: normalizeBooleanFlag(process.env.DRAMA_VIDEO_HTTP_SUPPORTS_REF_IMAGES),
    costPerSecond: normalizeCostValue(process.env.DRAMA_VIDEO_HTTP_COST_PER_SECOND),
    currency: process.env.DRAMA_VIDEO_HTTP_COST_CURRENCY?.trim() || readCostCurrency(),
  }));
}
