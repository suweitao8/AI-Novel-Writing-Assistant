import { synthesizeAudioSpeech, type AudioSpeechType } from "../../audio/speechProvider";
import { VoxCPM2TTSProvider } from "./VoxCPM2TTSProvider";

export interface TTSGenerationRequest {
  text: string;
  /** 语义必须透传到模型：旁白不能被包装成角色对白。 */
  audioType: AudioSpeechType;
  voiceId?: string | null;
  speed?: number | null;
  emotion?: string | null;
  speaker?: string | null;
  /** IndexTTS 2.5 的底模/LoRA speaker，不是剧情角色名。 */
  indexTTS25Speaker?: string | null;
  /** 状态音色试听（data URL/宿主机可访问地址），供支持参考音频的 provider 使用。 */
  referenceAudioUrl?: string | null;
}

export interface TTSGenerationResult {
  audioUrl: string;
  durationSec?: number;
  raw?: unknown;
}

export interface TTSProviderPort {
  readonly provider: string;
  readonly label?: string;
  readonly description?: string;
  readonly costPerSecond?: number;
  readonly currency?: string;
  synthesize(input: TTSGenerationRequest): Promise<TTSGenerationResult>;
}

export class MockTTSProvider implements TTSProviderPort {
  readonly provider = "mock";
  readonly label = "模拟配音通道";
  readonly description = "用于联调短剧配音链路的本地模拟 provider，不会生成真实语音。";
  readonly costPerSecond = normalizeCostValue(process.env.DRAMA_TTS_MOCK_COST_PER_SECOND);
  readonly currency = readCostCurrency();

  async synthesize(_input: TTSGenerationRequest): Promise<TTSGenerationResult> {
    throw new Error("模拟配音通道不生成真实语音，请使用系统音频模型。 ");
  }
}

export function isRealTTSProvider(provider: string | null | undefined): boolean {
  return typeof provider === "string" && provider.trim().length > 0 && provider.trim() !== "mock";
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

function readStringField(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

function readNumberField(record: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = Number(record[key]);
    if (Number.isFinite(value) && value > 0) {
      return value;
    }
  }
  return undefined;
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

export class HttpTTSProvider implements TTSProviderPort {
  readonly provider: string;
  readonly label: string;
  readonly description?: string;
  readonly costPerSecond: number;
  readonly currency: string;

  constructor(private readonly config: {
    provider: string;
    label?: string;
    description?: string;
    synthesizeUrl: string;
    apiKey?: string;
    timeoutMs?: number;
    costPerSecond?: number;
    currency?: string;
  }) {
    this.provider = config.provider;
    this.label = config.label ?? config.provider;
    this.description = config.description;
    this.costPerSecond = normalizeCostValue(config.costPerSecond);
    this.currency = config.currency?.trim() || readCostCurrency();
  }

  async synthesize(input: TTSGenerationRequest): Promise<TTSGenerationResult> {
    const response = await fetch(this.config.synthesizeUrl, {
      method: "POST",
      headers: this.buildHeaders(),
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(normalizeTimeoutMs(this.config.timeoutMs)),
    });
    const payload = await readJsonResponse(response);
    if (!response.ok) {
      throw new Error(`配音通道合成失败：${response.status} ${response.statusText}`);
    }
    const audioUrl = readStringField(payload, ["audioUrl", "url", "resultUrl"]);
    if (!audioUrl) {
      throw new Error("配音通道没有返回音频地址。");
    }
    return {
      audioUrl,
      durationSec: readNumberField(payload, ["durationSec", "duration", "seconds"]),
      raw: payload,
    };
  }

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (this.config.apiKey) {
      headers.Authorization = `Bearer ${this.config.apiKey}`;
    }
    return headers;
  }
}

class TTSProviderRegistry {
  private readonly providers = new Map<string, TTSProviderPort>();

  register(provider: TTSProviderPort): void {
    this.providers.set(provider.provider, provider);
  }

  resolve(provider: string): TTSProviderPort {
    const resolved = this.providers.get(provider);
    if (!resolved) {
      throw new Error(`未注册的配音 provider：${provider}`);
    }
    return resolved;
  }

  listProviders(): Array<{ provider: string; label: string; description?: string; costPerSecond: number; currency: string }> {
    return [...this.providers.values()].map((provider) => ({
      provider: provider.provider,
      label: provider.label ?? provider.provider,
      description: provider.description,
      costPerSecond: provider.costPerSecond ?? 0,
      currency: provider.currency ?? readCostCurrency(),
    }));
  }
}

export const ttsProviderRegistry = new TTSProviderRegistry();
ttsProviderRegistry.register(new MockTTSProvider());

const httpSynthesizeUrl = process.env.DRAMA_TTS_HTTP_SYNTHESIZE_URL?.trim();
if (httpSynthesizeUrl) {
  ttsProviderRegistry.register(new HttpTTSProvider({
    provider: process.env.DRAMA_TTS_HTTP_PROVIDER_ID?.trim() || "http",
    label: process.env.DRAMA_TTS_HTTP_PROVIDER_LABEL?.trim() || "HTTP 配音通道",
    description: process.env.DRAMA_TTS_HTTP_PROVIDER_DESCRIPTION?.trim() || "通过环境变量配置的外部 TTS 服务。",
    synthesizeUrl: httpSynthesizeUrl,
    apiKey: process.env.DRAMA_TTS_HTTP_API_KEY?.trim() || undefined,
    timeoutMs: normalizeTimeoutMs(process.env.DRAMA_TTS_HTTP_TIMEOUT_MS),
    costPerSecond: normalizeCostValue(process.env.DRAMA_TTS_HTTP_COST_PER_SECOND),
    currency: process.env.DRAMA_TTS_HTTP_COST_CURRENCY?.trim() || readCostCurrency(),
  }));
}

ttsProviderRegistry.register(new VoxCPM2TTSProvider());
