export const DEFAULT_AUDIO_SPEECH_HTTP_TIMEOUT_MS = 600_000;
export const MIN_AUDIO_SPEECH_HTTP_TIMEOUT_MS = 30_000;
export const MAX_AUDIO_SPEECH_HTTP_TIMEOUT_MS = 1_800_000;

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

function resolveAudioSpeechHttpTimeoutMs(): number {
  return asInt(
    process.env.AUDIO_SPEECH_HTTP_TIMEOUT_MS,
    DEFAULT_AUDIO_SPEECH_HTTP_TIMEOUT_MS,
    MIN_AUDIO_SPEECH_HTTP_TIMEOUT_MS,
    MAX_AUDIO_SPEECH_HTTP_TIMEOUT_MS,
  );
}

export const audioSpeechConfig = {
  httpTimeoutMs: resolveAudioSpeechHttpTimeoutMs(),
};
