// 将模型设置中「音频模型」槽位（本机 VoxCPM2 兼容服务）接入短剧配音链。
// 对白走 dialogue 合成类型，speaker 传入角色名，让本地服务按角色描述音色；
// 情绪提示透传为 emotion_prompt。本地服务不产生云端费用。
import type {
  TTSGenerationRequest,
  TTSGenerationResult,
  TTSProviderPort,
} from "./TTSProviderPort";
import { synthesizeAudioSpeech } from "../../audio/speechProvider";

export class VoxCPM2TTSProvider implements TTSProviderPort {
  readonly provider = "voxcpm2";
  readonly label = "本地 VoxCPM2 配音";
  readonly description = "使用模型设置中音频槽位配置的本地语音服务生成配音，不消耗云端额度。";
  readonly costPerSecond = 0;
  readonly currency = process.env.DRAMA_COST_CURRENCY?.trim() || "CNY";

  async synthesize(input: TTSGenerationRequest): Promise<TTSGenerationResult> {
    const result = await synthesizeAudioSpeech({
      text: input.text,
      audioType: "dialogue",
      speaker: input.speaker ?? input.voiceId ?? undefined,
      emotion: input.emotion ?? undefined,
    });
    return {
      audioUrl: result.dataUrl,
      raw: {
        contentType: result.contentType,
        byteLength: result.byteLength,
      },
    };
  }
}
