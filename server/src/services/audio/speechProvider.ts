// 音频槽位的唯一语音合成入口。
// 默认 provider 是 VoxCPM2：业务层只传递旁白/对白语义、角色音色描述和参考音频，
// OpenAI 兼容桥接协议由本模块集中处理。IndexTTS 2.5 仍可通过显式 provider
// override 使用，但不会被当前音频槽位或开发启动链隐式调用。
import path from "node:path";
import type { BuiltinLLMProvider } from "@ai-novel/shared/types/llm";
import { audioSpeechConfig } from "../../config/audioSpeech";
import { prisma } from "../../db/prisma";
import { getAudioModelProvider } from "../../llm/modelCategories";
import {
  getProviderDefaultApiKey,
  getProviderEnvApiKey,
  getProviderEnvBaseUrl,
  getProviderEnvModel,
  normalizeBaseURL,
  PROVIDERS,
} from "../../llm/providers";
import { normalizePcm16WavVolume } from "./audioLoudness";
import { synthesizeIndexTTS25 } from "./indexTTS25";

export type AudioSpeechType = "narration" | "dialogue" | "thought";

export interface AudioSpeechSlotConfig {
  provider: BuiltinLLMProvider;
  baseURL: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
}

export interface AudioSpeechSlotOverride {
  provider?: BuiltinLLMProvider;
  baseURL?: string;
  apiKey?: string;
  model?: string;
}

export interface AudioSpeechInput {
  text: string;
  audioType?: AudioSpeechType;
  speaker?: string;
  /** 旧 IndexTTS 设置字段，仅在显式 IndexTTS provider override 下使用。 */
  indexTTS25Speaker?: string;
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
  const provider = override.provider ?? getAudioModelProvider();
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
    ?? getProviderDefaultApiKey(provider)
    ?? "";
  return { provider, baseURL, apiKey, model, timeoutMs: audioSpeechConfig.httpTimeoutMs };
}

function buildSpeechEndpoint(baseURL: string): string {
  const normalized = normalizeBaseURL(baseURL);
  return normalized.endsWith("/audio/speech") ? normalized : `${normalized}/audio/speech`;
}

function readEnvNumber(name: string, fallback: number, min: number, max: number): number {
  const parsed = Number(process.env[name]?.trim());
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, parsed));
}

/** VoxCPM2 只接受 data URL 或宿主机绝对路径，不接受 IndexTTS 的裸音色文件名。 */
export function isVoxCPMReferenceAudio(value: string | null | undefined): value is string {
  if (typeof value !== "string") {
    return false;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return false;
  }
  if (/^data:audio\/[^;,]+;base64,[A-Za-z0-9+/=\r\n]+$/i.test(trimmed)) {
    return true;
  }
  return path.isAbsolute(trimmed);
}

/** 从新样本、旧参考字段中选择 VoxCPM2 能实际读取的参考音频。 */
export function selectVoxCPMReferenceAudio(
  ...candidates: Array<string | null | undefined>
): string | undefined {
  return candidates.find(isVoxCPMReferenceAudio);
}

function buildSpeechMetadata(input: AudioSpeechInput): Record<string, unknown> {
  const metadata: Record<string, unknown> = {
    should_use_prompt_for_emotion: true,
    // VoxCPM 的 cfg 越低生成越自由发散，听感发虚无力（不贴控制前缀与参考音色）；
    // 流匹配步数越低质量越差。默认取比引擎内置默认更强的表达档位，可用环境变量回调。
    cfg_value: readEnvNumber("VOXCPM2_TTS_CFG_VALUE", 2.6, 1, 3),
    inference_timesteps: Math.round(readEnvNumber("VOXCPM2_TTS_INFERENCE_TIMESTEPS", 20, 1, 50)),
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
  const referenceAudioUrl = selectVoxCPMReferenceAudio(input.referenceAudioUrl);
  if (referenceAudioUrl) {
    metadata.audio_url = referenceAudioUrl;
  }
  if (input.referenceTranscript?.trim() && referenceAudioUrl) {
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

async function readAudioBytes(
  response: Response,
  client: { get: (url: string) => Promise<Response> },
): Promise<{ bytes: Uint8Array; contentType: string }> {
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
  const normalizedContentType = contentType.split(";", 1)[0]?.trim() || "audio/mpeg";
  return {
    audioDataBase64,
    contentType: normalizedContentType,
    byteLength: normalizedBytes.byteLength,
    dataUrl: `data:${normalizedContentType};base64,${audioDataBase64}`,
  };
}

async function synthesizeVoxCPM2(
  input: AudioSpeechInput,
  config: AudioSpeechSlotConfig,
): Promise<AudioSpeechResult> {
  const response = await fetch(buildSpeechEndpoint(config.baseURL), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.model,
      input: input.text,
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

  if (config.provider === "indextts25") {
    const result = await synthesizeIndexTTS25(
      {
        text,
        speed: input.speed,
        emotion: input.emotion,
        indexTTS25Speaker: input.indexTTS25Speaker,
        speaker: input.speaker,
        referenceAudioUrl: input.referenceAudioUrl,
      },
      config,
    );
    return toResult(result.bytes, result.contentType);
  }
  if (config.provider !== "voxcpm2") {
    throw new Error(`音频 provider 暂不支持语音合成：${config.provider}`);
  }
  return synthesizeVoxCPM2({ ...input, text }, config);
}

export interface AudioSpeechProbeResult {
  latencyMs: number;
  byteLength: number;
  contentType: string;
}

// 设置页“测试连接”用：合成一句固定短语，验证 VoxCPM2 地址、密钥与模型整体可用。
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
