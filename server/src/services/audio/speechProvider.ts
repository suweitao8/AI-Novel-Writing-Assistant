// 音频槽位的唯一语音合成入口：IndexTTS 2.5 本地 API。
// 业务层只传递旁白/对白语义、角色音色描述和参考音频，协议细节由 indexTTS25 适配器负责。
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
import { synthesizeIndexTTS25 } from "./indexTTS25";

const DEFAULT_LOCAL_AUDIO_API_KEY = "local-indextts25";

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
  speed?: number;
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

function toResult(bytes: Uint8Array, contentType: string): AudioSpeechResult {
  const normalizedBytes = normalizePcm16WavVolume(bytes);
  if (!normalizedBytes.byteLength) {
    throw new Error("语音服务返回了空音频。");
  }
  const audioDataBase64 = Buffer.from(normalizedBytes).toString("base64");
  const normalizedContentType = contentType.split(";", 1)[0]?.trim() || "audio/wav";
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
  const result = await synthesizeIndexTTS25(
    {
      text,
      speed: input.speed,
      emotion: input.emotion,
      speaker: input.speaker,
      referenceAudioUrl: input.referenceAudioUrl,
    },
    config,
  );
  return toResult(result.bytes, result.contentType);
}

export interface AudioSpeechProbeResult {
  latencyMs: number;
  byteLength: number;
  contentType: string;
}

// 设置页“测试连接”用：合成一句固定短语，验证 IndexTTS 地址、参考音频和模型整体可用。
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
