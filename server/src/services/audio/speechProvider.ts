// 音频槽位能力模块：对接模型设置中「音频模型」槽位配置的语音合成服务。
// 默认服务为本机 VoxCPM2 桥接（OpenAI /v1/audio/speech 兼容协议）：
// - 请求：POST {baseURL}/audio/speech，body 为 { model, input, metadata }，Bearer 认证；
// - metadata.audio_type 区分 narration（旁白）/ dialogue（对白）/ thought（内心独白），
//   对白类会结合 metadata.speaker 构造角色音色描述；
// - metadata.audio_url 支持传入参考音频（base64 data URL 或宿主机路径）做音色克隆；
// - 响应：成功返回 audio/mpeg 二进制；失败返回 { error } JSON。
// 槽位配置解析顺序与文本/图片槽一致：已保存配置 > 环境变量 > 注册表默认值。
import type { BuiltinLLMProvider } from "@ai-novel/shared/types/llm";
import { audioSpeechConfig } from "../../config/audioSpeech";
import { prisma } from "../../db/prisma";
import { getAudioModelProvider } from "../../llm/modelCategories";
import {
  getProviderEnvApiKey,
  getProviderEnvBaseUrl,
  getProviderEnvModel,
  normalizeBaseURL,
  PROVIDERS,
} from "../../llm/providers";
import { normalizePcm16WavVolume } from "./audioLoudness";

// 本机桥接服务约定的默认访问密钥；本地部署无需用户额外申请。
const DEFAULT_LOCAL_AUDIO_API_KEY = "local-voxcpm2";

export type AudioSpeechType = "narration" | "dialogue" | "thought";

export interface AudioSpeechSlotConfig {
  provider: BuiltinLLMProvider;
  baseURL: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
}

export interface AudioSpeechSlotOverride {
  baseURL?: string;
  apiKey?: string;
  model?: string;
}

export interface AudioSpeechInput {
  text: string;
  audioType?: AudioSpeechType;
  speaker?: string;
  emotion?: string;
  referenceAudioUrl?: string;
  referenceTranscript?: string;
}

export interface AudioSpeechResult {
  audioDataBase64: string;
  contentType: string;
  byteLength: number;
  dataUrl: string;
}

interface AudioKeyRecordLike {
  key?: string | null;
  model?: string | null;
  baseURL?: string | null;
}

function normalizeOptional(value: string | null | undefined): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed || undefined;
}

export async function resolveAudioSpeechSlotConfig(
  override: AudioSpeechSlotOverride = {},
): Promise<AudioSpeechSlotConfig> {
  const provider = getAudioModelProvider();
  const defaults = PROVIDERS[provider];
  let record: AudioKeyRecordLike | null = null;
  try {
    record = await prisma.aPIKey.findUnique({ where: { provider } });
  } catch {
    // 数据库表可能尚未初始化，回落到环境变量与默认值。
  }
  const model = override.model?.trim()
    ?? normalizeOptional(record?.model)
    ?? getProviderEnvModel(provider)
    ?? defaults.defaultModel;
  const baseURL = normalizeBaseURL(override.baseURL?.trim()
    ?? normalizeOptional(record?.baseURL)
    ?? getProviderEnvBaseUrl(provider)
    ?? defaults.baseURL);
  const apiKey = override.apiKey?.trim()
    ?? normalizeOptional(record?.key)
    ?? getProviderEnvApiKey(provider)
    ?? DEFAULT_LOCAL_AUDIO_API_KEY;
  return { provider, baseURL, apiKey, model, timeoutMs: audioSpeechConfig.httpTimeoutMs };
}

function buildSpeechEndpoint(baseURL: string): string {
  const normalized = normalizeBaseURL(baseURL);
  return normalized.endsWith("/audio/speech") ? normalized : `${normalized}/audio/speech`;
}

function buildSpeechMetadata(input: AudioSpeechInput): Record<string, unknown> {
  const metadata: Record<string, unknown> = {
    should_use_prompt_for_emotion: true,
  };
  if (input.audioType) {
    metadata.audio_type = input.audioType;
  }
  if (input.speaker?.trim()) {
    metadata.speaker = input.speaker.trim();
  }
  if (input.emotion?.trim()) {
    metadata.emotion_prompt = input.emotion.trim();
  }
  if (input.referenceAudioUrl?.trim()) {
    metadata.audio_url = input.referenceAudioUrl.trim();
  }
  if (input.referenceTranscript?.trim() && input.referenceAudioUrl?.trim()) {
    metadata.reference_transcript = input.referenceTranscript.trim();
  }
  return metadata;
}

async function readErrorMessage(response: Response): Promise<string> {
  const fallback = `${response.status} ${response.statusText}`;
  try {
    const text = await response.text();
    if (!text.trim()) {
      return fallback;
    }
    try {
      const payload = JSON.parse(text) as { error?: unknown; message?: unknown };
      const message = [payload.error, payload.message].find(
        (item): item is string => typeof item === "string" && item.trim().length > 0,
      );
      return message ?? text.slice(0, 200);
    } catch {
      return text.slice(0, 200);
    }
  } catch {
    return fallback;
  }
}

function extractAudioUrl(payload: Record<string, unknown>): string {
  const audio = payload.audio;
  if (typeof audio === "string" && audio.trim()) {
    return audio.trim();
  }
  if (audio && typeof audio === "object") {
    const url = (audio as { url?: unknown }).url;
    if (typeof url === "string" && url.trim()) {
      return url.trim();
    }
  }
  return "";
}

async function readAudioBytes(response: Response, client: { get: (url: string) => Promise<Response> }): Promise<{ bytes: Uint8Array; contentType: string }> {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.toLowerCase().includes("application/json")) {
    const payload = JSON.parse(await response.text()) as Record<string, unknown>;
    const audioUrl = extractAudioUrl(payload);
    if (!audioUrl) {
      throw new Error("语音服务没有返回音频内容。");
    }
    const audioResponse = await client.get(audioUrl);
    if (!audioResponse.ok) {
      throw new Error(`下载语音文件失败：${audioResponse.status} ${audioResponse.statusText}`);
    }
    return {
      bytes: new Uint8Array(await audioResponse.arrayBuffer()),
      contentType: audioResponse.headers.get("content-type") ?? "audio/mpeg",
    };
  }
  return {
    bytes: new Uint8Array(await response.arrayBuffer()),
    contentType: contentType || "audio/mpeg",
  };
}

function toResult(bytes: Uint8Array, contentType: string): AudioSpeechResult {
  // VoxCPM2 的 normalize 参数只规范输入文字，不保证不同音色/控制提示的输出响度；
  // 在公共出口统一 PCM16 WAV 的有效语音响度，避免旁白与角色试听出现明显音量差。
  const normalizedBytes = normalizePcm16WavVolume(bytes);
  if (!normalizedBytes.byteLength) {
    throw new Error("语音服务返回了空音频。");
  }
  const audioDataBase64 = Buffer.from(normalizedBytes).toString("base64");
  const normalizedContentType = contentType.split(";")[0]?.trim() || "audio/mpeg";
  return {
    audioDataBase64,
    contentType: normalizedContentType,
    byteLength: normalizedBytes.byteLength,
    dataUrl: `data:${normalizedContentType};base64,${audioDataBase64}`,
  };
}

export async function synthesizeAudioSpeech(
  input: AudioSpeechInput,
  configOverride: AudioSpeechSlotOverride = {},
): Promise<AudioSpeechResult> {
  const text = input.text.trim();
  if (!text) {
    throw new Error("要合成的文本为空。");
  }
  const config = await resolveAudioSpeechSlotConfig(configOverride);
  if (!config.baseURL) {
    throw new Error("音频模型槽位没有可用的服务地址。");
  }

  const response = await fetch(buildSpeechEndpoint(config.baseURL), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.model,
      input: text,
      metadata: buildSpeechMetadata(input),
    }),
    signal: AbortSignal.timeout(config.timeoutMs),
  });

  if (!response.ok) {
    throw new Error(`语音合成失败：${await readErrorMessage(response)}`);
  }

  const { bytes, contentType } = await readAudioBytes(response, {
    get: async (url) => fetch(url, { signal: AbortSignal.timeout(config.timeoutMs) }),
  });
  return toResult(bytes, contentType);
}

export interface AudioSpeechProbeResult {
  latencyMs: number;
  byteLength: number;
  contentType: string;
}

// 设置页「测试连接」用：合成一句固定短语文，验证服务地址、密钥与模型整体可用。
export async function probeAudioSpeechChannel(
  configOverride: AudioSpeechSlotOverride = {},
): Promise<AudioSpeechProbeResult> {
  const startedAt = Date.now();
  const result = await synthesizeAudioSpeech(
    { text: "音频通道连接测试。", audioType: "narration" },
    configOverride,
  );
  return {
    latencyMs: Date.now() - startedAt,
    byteLength: result.byteLength,
    contentType: result.contentType,
  };
}
