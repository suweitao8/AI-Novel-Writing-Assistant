import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, open, readFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_INDEXTTS25_ROOT = "D:\\Tools\\yzy-index-tts-2.5-260824";
const DEFAULT_REFERENCE_AUDIO = "测试参考音频.mp3";
const DEFAULT_SPEAKER = "default";
const DEFAULT_WEB_UI_URL = "http://127.0.0.1:9000";
const DEFAULT_LANGUAGE = "ZH";
const AUDIO_EXTENSIONS = new Set([".wav", ".mp3", ".flac", ".m4a", ".ogg", ".webm"]);
const MAX_REFERENCE_AUDIO_BYTES = 10 * 1024 * 1024;
const AUDIO_MIME_TYPES = new Set([
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/flac",
  "audio/x-flac",
  "audio/mp4",
  "audio/x-m4a",
  "audio/ogg",
  "audio/webm",
]);

export interface IndexTTS25SpeechInput {
  text: string;
  speed?: number | null;
  emotion?: string | null;
  /** IndexTTS 的底模/LoRA speaker；不要传剧情角色名。 */
  indexTTS25Speaker?: string | null;
  speaker?: string | null;
  referenceAudioUrl?: string | null;
}

export interface IndexTTS25SpeechConfig {
  baseURL: string;
  apiKey?: string;
  model?: string;
  timeoutMs: number;
}

export interface IndexTTS25SpeechResult {
  bytes: Uint8Array;
  contentType: string;
  request: Record<string, unknown>;
  emotionMode: "text" | "reference";
}

export interface IndexTTS25Health {
  status?: string;
  modelLoaded?: boolean;
  qwenEmotion?: boolean;
}

export interface IndexTTS25VoiceCatalog {
  available: boolean;
  health: IndexTTS25Health | null;
  speakers: string[];
  referenceVoices: string[];
  defaultSpeaker: string;
  defaultReferenceAudio: string;
  apiBaseURL: string;
  webUIUrl: string;
  error?: string;
}

function readEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value || undefined;
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (!value) {
    return fallback;
  }
  if (["1", "true", "yes", "on"].includes(value.toLowerCase())) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(value.toLowerCase())) {
    return false;
  }
  return fallback;
}

function parseNumber(value: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, parsed));
}

function normalizeBaseURL(baseURL: string): string {
  return baseURL.trim().replace(/\/+$/, "");
}

function healthURL(baseURL: string): string {
  return `${normalizeBaseURL(baseURL)}/health`;
}

function ttsURL(baseURL: string): string {
  const normalized = normalizeBaseURL(baseURL);
  return normalized.endsWith("/tts") ? normalized : `${normalized}/tts`;
}

function contentTypeFromExtension(filePath: string): string {
  switch (path.extname(filePath).toLowerCase()) {
    case ".wav":
      return "audio/wav";
    case ".flac":
      return "audio/flac";
    case ".m4a":
      return "audio/mp4";
    case ".ogg":
      return "audio/ogg";
    default:
      return "audio/mpeg";
  }
}

function extensionFromContentType(contentType: string | null | undefined): string {
  const normalized = (contentType ?? "").split(";", 1)[0]?.trim().toLowerCase();
  switch (normalized) {
    case "audio/wav":
    case "audio/x-wav":
      return ".wav";
    case "audio/flac":
    case "audio/x-flac":
      return ".flac";
    case "audio/mp4":
    case "audio/x-m4a":
      return ".m4a";
    case "audio/ogg":
      return ".ogg";
    case "audio/webm":
      return ".webm";
    default:
      return ".mp3";
  }
}

function isAudioExtension(extension: string): boolean {
  return AUDIO_EXTENSIONS.has(extension.toLowerCase());
}

export function getIndexTTS25Root(): string {
  return readEnv("INDEXTTS25_ROOT") || DEFAULT_INDEXTTS25_ROOT;
}

export function getIndexTTS25WebUIUrl(): string {
  return readEnv("INDEXTTS25_WEB_UI_URL") || DEFAULT_WEB_UI_URL;
}

export function getIndexTTS25VoicesDir(root = getIndexTTS25Root()): string {
  return path.join(root, "voices");
}

export function getIndexTTS25DefaultReferencePath(root = getIndexTTS25Root()): string {
  const configured = readEnv("INDEXTTS25_DEFAULT_REFERENCE_AUDIO");
  if (!configured) {
    return path.join(getIndexTTS25VoicesDir(root), DEFAULT_REFERENCE_AUDIO);
  }
  return path.isAbsolute(configured) ? configured : path.join(getIndexTTS25VoicesDir(root), configured);
}

function parseDataURL(value: string): { bytes: Uint8Array; contentType: string } | null {
  if (!value.startsWith("data:")) {
    return null;
  }
  const commaIndex = value.indexOf(",");
  if (commaIndex < 0) {
    throw new Error("参考音频 data URL 格式无效。");
  }
  const metadata = value.slice(5, commaIndex);
  const payload = value.slice(commaIndex + 1);
  const parts = metadata.split(";");
  const contentType = (parts[0]?.trim() || "audio/mpeg").toLowerCase();
  if (!AUDIO_MIME_TYPES.has(contentType)) {
    throw new Error("参考音频只支持 WAV、MP3、FLAC、M4A、OGG 或 WEBM 音频。");
  }
  if (!parts.includes("base64")) {
    try {
      const bytes = new TextEncoder().encode(decodeURIComponent(payload));
      if (bytes.byteLength > MAX_REFERENCE_AUDIO_BYTES) {
        throw new Error("参考音频不能超过 10 MB。");
      }
      return { bytes, contentType };
    } catch (error) {
      if (error instanceof Error && error.message === "参考音频不能超过 10 MB。") {
        throw error;
      }
      throw new Error("参考音频 data URL 内容无效。");
    }
  }
  if (payload.length % 4 !== 0) {
    throw new Error("参考音频 data URL 的 base64 内容无效。");
  }
  const padding = payload.endsWith("==") ? 2 : payload.endsWith("=") ? 1 : 0;
  const decodedLength = (payload.length / 4) * 3 - padding;
  if (decodedLength > MAX_REFERENCE_AUDIO_BYTES) {
    throw new Error("参考音频不能超过 10 MB。");
  }
  if (!isBase64Payload(payload)) {
    throw new Error("参考音频 data URL 的 base64 内容无效。");
  }
  const bytes = Uint8Array.from(Buffer.from(payload, "base64"));
  if (bytes.byteLength > MAX_REFERENCE_AUDIO_BYTES) {
    throw new Error("参考音频不能超过 10 MB。");
  }
  return { bytes, contentType };
}

function isVoiceLibraryFileName(value: string): boolean {
  return path.basename(value) === value
    && isAudioExtension(path.extname(value))
    && !value.includes("..")
    && !/[\\/]/.test(value);
}

function isBase64Payload(value: string): boolean {
  if (!value || value.length % 4 !== 0) {
    return false;
  }
  const padding = value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0;
  const contentLength = value.length - padding;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    const isBase64Char = (code >= 65 && code <= 90)
      || (code >= 97 && code <= 122)
      || (code >= 48 && code <= 57)
      || code === 43
      || code === 47;
    if (index < contentLength ? !isBase64Char : code !== 61) {
      return false;
    }
  }
  return true;
}

async function readReferenceAudio(referenceAudioUrl: string | undefined): Promise<{
  bytes: Uint8Array;
  contentType: string;
  sourcePath?: string;
}> {
  if (!referenceAudioUrl) {
    const defaultPath = getIndexTTS25DefaultReferencePath();
    if (!existsSync(defaultPath)) {
      throw new Error(`IndexTTS 2.5 默认参考音频不存在：${defaultPath}`);
    }
    const bytes = new Uint8Array(await readFile(defaultPath));
    if (bytes.byteLength > MAX_REFERENCE_AUDIO_BYTES) {
      throw new Error("参考音频不能超过 10 MB。");
    }
    return {
      bytes,
      contentType: contentTypeFromExtension(defaultPath),
      sourcePath: defaultPath,
    };
  }

  const dataURL = parseDataURL(referenceAudioUrl);
  if (dataURL) {
    return dataURL;
  }
  if (!isVoiceLibraryFileName(referenceAudioUrl)) {
    throw new Error("参考音频只能使用音频 data URL 或 IndexTTS 音色库中的文件名。");
  }
  const localPath = path.join(path.resolve(getIndexTTS25VoicesDir()), referenceAudioUrl);
  if (!existsSync(localPath)) {
    throw new Error(`IndexTTS 参考音频不存在：${referenceAudioUrl}`);
  }
  const bytes = new Uint8Array(await readFile(localPath));
  if (bytes.byteLength > MAX_REFERENCE_AUDIO_BYTES) {
    throw new Error("参考音频不能超过 10 MB。");
  }
  return {
    bytes,
    contentType: contentTypeFromExtension(localPath),
    sourcePath: localPath,
  };
}

async function cacheReferenceAudio(referenceAudioUrl: string | undefined): Promise<string> {
  const root = getIndexTTS25Root();
  const voicesDir = getIndexTTS25VoicesDir(root);
  const reference = await readReferenceAudio(referenceAudioUrl);
  if (!referenceAudioUrl && path.dirname(reference.sourcePath ?? "") === path.resolve(voicesDir)) {
    return path.basename(reference.sourcePath!);
  }

  await mkdir(voicesDir, { recursive: true });
  const extension = isAudioExtension(path.extname(reference.sourcePath ?? ""))
    ? path.extname(reference.sourcePath!).toLowerCase()
    : extensionFromContentType(reference.contentType);
  const digest = createHash("sha256").update(reference.bytes).digest("hex").slice(0, 32);
  const fileName = `app-${digest}${extension}`;
  const targetPath = path.join(voicesDir, fileName);
  if (!existsSync(targetPath)) {
    try {
      const handle = await open(targetPath, "wx");
      try {
        await handle.writeFile(reference.bytes);
      } finally {
        await handle.close();
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
        throw error;
      }
    }
  }
  return fileName;
}

/**
 * 将上传或生成的参考音频物化到 IndexTTS 音色库。
 * 文件名由内容指纹决定，重复保存只复用已有文件，不覆盖整合包里的原始音频。
 */
export async function persistIndexTTS25ReferenceAudio(referenceAudioUrl: string): Promise<string> {
  const normalized = referenceAudioUrl.trim();
  if (!normalized) {
    throw new Error("参考音频不能为空。");
  }
  const isDataAudio = /^data:audio\//i.test(normalized);
  const isVoiceLibraryFile = path.basename(normalized) === normalized
    && isAudioExtension(path.extname(normalized))
    && !normalized.includes("..")
    && !/[\\/]/.test(normalized);
  if (!isDataAudio && !isVoiceLibraryFile) {
    throw new Error("参考音频只能使用音频 data URL 或 IndexTTS 音色库中的文件名。");
  }
  return cacheReferenceAudio(normalized);
}

export async function readIndexTTS25Health(
  baseURL: string,
  timeoutMs: number,
): Promise<IndexTTS25Health | null> {
  try {
    const response = await fetch(healthURL(baseURL), {
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) {
      return null;
    }
    const payload = await response.json() as Record<string, unknown>;
    return {
      status: typeof payload.status === "string" ? payload.status : undefined,
      modelLoaded: payload.model_loaded === true,
      qwenEmotion: payload.qwen_emo === true,
    };
  } catch {
    return null;
  }
}

async function readJsonEndpoint(baseURL: string, endpoint: string, timeoutMs: number): Promise<unknown> {
  const response = await fetch(`${normalizeBaseURL(baseURL)}${endpoint}`, {
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) {
    throw new Error(`${endpoint} ${response.status} ${response.statusText}`);
  }
  return response.json();
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.trim());
}

/** 读取 IndexTTS 网页工作台和 API 共享的 speaker/参考音频目录。 */
export async function listIndexTTS25Catalog(
  baseURL: string,
  timeoutMs: number,
): Promise<IndexTTS25VoiceCatalog> {
  const health = await readIndexTTS25Health(baseURL, timeoutMs);
  const errors: string[] = [];
  let speakers: string[] = [];
  let referenceVoices: string[] = [];

  try {
    const payload = await readJsonEndpoint(baseURL, "/speakers", timeoutMs) as Record<string, unknown>;
    speakers = readStringArray(payload.speakers);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }

  try {
    const payload = await readJsonEndpoint(baseURL, "/voices", timeoutMs) as Record<string, unknown>;
    referenceVoices = readStringArray(payload.voices);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }

  return {
    available: Boolean(health),
    health,
    speakers: speakers.length > 0 ? speakers : [DEFAULT_SPEAKER],
    referenceVoices,
    defaultSpeaker: readEnv("INDEXTTS25_SPEAKER") || DEFAULT_SPEAKER,
    defaultReferenceAudio: path.basename(getIndexTTS25DefaultReferencePath()),
    apiBaseURL: normalizeBaseURL(baseURL),
    webUIUrl: getIndexTTS25WebUIUrl(),
    ...(errors.length > 0 ? { error: errors.join("；") } : {}),
  };
}

export function buildIndexTTS25Request(
  input: IndexTTS25SpeechInput,
  referenceAudio: string,
  health: IndexTTS25Health | null,
): Record<string, unknown> {
  const text = input.text.trim();
  const emotion = input.emotion?.trim() || undefined;
  const useEmotionText = Boolean(emotion && health?.qwenEmotion);
  const speed = Number(input.speed);
  const durationFactor = Number.isFinite(speed) && speed > 0
    ? Math.max(0.5, Math.min(2, 1 / speed))
    : 1;
  const request: Record<string, unknown> = {
    // 项目里的 speaker 是剧情角色名；IndexTTS 的 speaker 是底模/LoRA 名称，
    // 不能把“林澈”之类的角色名直接发给它，否则会被判定为不存在的 LoRA。
    speaker: input.indexTTS25Speaker?.trim() || readEnv("INDEXTTS25_SPEAKER") || DEFAULT_SPEAKER,
    audio: referenceAudio,
    text,
    lang: (readEnv("INDEXTTS25_LANGUAGE") || DEFAULT_LANGUAGE).toUpperCase(),
    fp16: parseBoolean(readEnv("INDEXTTS25_FP16"), true),
    duration_factor: durationFactor,
    diffusion_steps: Math.round(parseNumber(readEnv("INDEXTTS25_DIFFUSION_STEPS"), 25, 1, 100)),
    emo_control_method: useEmotionText ? 3 : 0,
    return_type: "file",
  };
  if (useEmotionText) {
    request.emo_text = emotion;
  }
  return request;
}

async function readErrorMessage(response: Response): Promise<string> {
  const fallback = `${response.status} ${response.statusText}`;
  const text = await response.text().catch(() => "");
  if (!text.trim()) {
    return fallback;
  }
  try {
    const payload = JSON.parse(text) as Record<string, unknown>;
    const detail = [payload.detail, payload.error, payload.message]
      .find((value): value is string => typeof value === "string" && value.trim().length > 0);
    return detail || text.slice(0, 240);
  } catch {
    return text.slice(0, 240);
  }
}

export async function synthesizeIndexTTS25(
  input: IndexTTS25SpeechInput,
  config: IndexTTS25SpeechConfig,
): Promise<IndexTTS25SpeechResult> {
  const text = input.text.trim();
  if (!text) {
    throw new Error("要合成的文本为空。");
  }
  const referenceAudio = await cacheReferenceAudio(input.referenceAudioUrl?.trim() || undefined);
  const health = input.emotion?.trim()
    ? await readIndexTTS25Health(config.baseURL, config.timeoutMs)
    : null;
  const request = buildIndexTTS25Request({ ...input, text }, referenceAudio, health);
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (config.apiKey?.trim()) {
    headers.Authorization = `Bearer ${config.apiKey.trim()}`;
  }
  const response = await fetch(ttsURL(config.baseURL), {
    method: "POST",
    headers,
    body: JSON.stringify(request),
    signal: AbortSignal.timeout(config.timeoutMs),
  });
  if (!response.ok) {
    throw new Error(`IndexTTS 2.5 语音合成失败：${await readErrorMessage(response)}`);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!bytes.byteLength) {
    throw new Error("IndexTTS 2.5 返回了空音频。");
  }
  return {
    bytes,
    contentType: response.headers.get("content-type")?.split(";", 1)[0]?.trim() || "audio/wav",
    request,
    emotionMode: request.emo_control_method === 3 ? "text" : "reference",
  };
}
