// 将模型设置中「音频模型」槽位（本机 VoxCPM2 兼容服务）接入短剧配音链。
// 对白走 dialogue 合成类型，speaker 传入角色名；旁白保持 narration 语义。
import type {
  TTSGenerationRequest,
  TTSGenerationResult,
  TTSProviderPort,
} from "./TTSProviderPort";
import { synthesizeAudioSpeech, type AudioSpeechInput } from "../../audio/speechProvider";

export function buildVoxCPMSpeechInput(input: TTSGenerationRequest): AudioSpeechInput {
  const audioType = input.audioType;
  return {
    text: input.text,
    audioType,
    speaker: audioType === "narration" ? undefined : (input.speaker ?? input.voiceId ?? undefined),
    emotion: input.emotion ?? undefined,
    referenceAudioUrl: input.referenceAudioUrl ?? undefined,
  };
}

export class VoxCPM2TTSProvider implements TTSProviderPort {
  readonly provider = "voxcpm2";
  readonly label = "本地 VoxCPM2 配音";
  readonly description = "使用模型设置中音频槽位配置的本地语音服务生成配音，不消耗云端额度。";
  readonly costPerSecond = 0;
  readonly currency = process.env.DRAMA_COST_CURRENCY?.trim() || "CNY";

  async synthesize(input: TTSGenerationRequest): Promise<TTSGenerationResult> {
    const result = await synthesizeAudioSpeech(buildVoxCPMSpeechInput(input));
    return {
      audioUrl: result.dataUrl,
      raw: {
        contentType: result.contentType,
        byteLength: result.byteLength,
      },
    };
  }
}
