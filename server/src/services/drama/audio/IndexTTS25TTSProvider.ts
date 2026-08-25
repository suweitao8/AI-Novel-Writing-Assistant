// 将短剧 TTS 请求接入 IndexTTS 2.5 公共音频出口。
// 角色名只保留为业务语义；真正的音色由 referenceAudioUrl/默认参考音频决定。
import type {
  TTSGenerationRequest,
  TTSGenerationResult,
  TTSProviderPort,
} from "./TTSProviderPort";
import { synthesizeAudioSpeech, type AudioSpeechInput } from "../../audio/speechProvider";

export function buildIndexTTS25SpeechInput(input: TTSGenerationRequest): AudioSpeechInput {
  return {
    text: input.text,
    audioType: input.audioType,
    speaker: input.audioType === "narration" ? undefined : (input.speaker ?? input.voiceId ?? undefined),
    indexTTS25Speaker: input.indexTTS25Speaker ?? undefined,
    speed: input.speed ?? undefined,
    emotion: input.emotion ?? undefined,
    referenceAudioUrl: input.referenceAudioUrl ?? undefined,
  };
}

export class IndexTTS25TTSProvider implements TTSProviderPort {
  readonly provider = "indextts25";
  readonly label = "本地 IndexTTS 2.5 配音";
  readonly description = "使用 IndexTTS 2.5 本地语音服务生成角色对白和旁白，不消耗云端额度。";
  readonly costPerSecond = 0;
  readonly currency = process.env.DRAMA_COST_CURRENCY?.trim() || "CNY";

  async synthesize(input: TTSGenerationRequest): Promise<TTSGenerationResult> {
    const result = await synthesizeAudioSpeech(
      buildIndexTTS25SpeechInput(input),
      { provider: "indextts25" },
    );
    return {
      audioUrl: result.dataUrl,
      raw: {
        contentType: result.contentType,
        byteLength: result.byteLength,
      },
    };
  }
}
