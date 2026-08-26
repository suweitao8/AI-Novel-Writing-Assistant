import type { BuiltinLLMProvider } from "@ai-novel/shared/types/llm";
import { prisma } from "../db/prisma";
import { getProviderEnvModel, PROVIDERS } from "./providers";

// 产品对用户只暴露“文本 / 视觉 / 图片 / 音频”四类模型能力，每类能力对应一个内部槽位：
// - 文本槽承担大纲、正文、审校、修复等全部文字任务；
// - 视觉槽承担需要送图理解的任务（空间标记识别、画风识别）；
// - 图片槽承担封面、角色立绘、场景插图等图片生成任务；
// - 音频槽承担角色配音与朗读任务，默认走本机 VoxCPM2 语音服务。
// 槽位的服务地址、API Key、模型均可编辑：更换供应商时修改槽位配置即可，
// 产品不再提供按“厂商”维度逐个配置的界面。
// 文本/视觉/图片槽统一走 Codex 订阅额度：文本与视觉经 codex 桥的 chat completions
// （默认 gpt-5.6-luna + low 推理档 = fast 模式，图片输入走 -i 附件），图片仍走 image_generation 工具。
// 音频保持本机 VoxCPM2，不消耗订阅额度。grok-cli / opencode 通道保留注册，
// 额度恢复后可在设置页切回。
export const MODEL_CATEGORY_PROVIDERS = {
  text: "codex",
  vision: "codex",
  image: "codex",
  audio: "voxcpm2",
} as const satisfies Record<"text" | "vision" | "image" | "audio", BuiltinLLMProvider>;

export type ModelCategoryKey = keyof typeof MODEL_CATEGORY_PROVIDERS;

export function getTextModelProvider(): BuiltinLLMProvider {
  return MODEL_CATEGORY_PROVIDERS.text;
}

export function getVisionModelProvider(): BuiltinLLMProvider {
  return MODEL_CATEGORY_PROVIDERS.vision;
}

export function getImageModelProvider(): BuiltinLLMProvider {
  return MODEL_CATEGORY_PROVIDERS.image;
}

export function getAudioModelProvider(): BuiltinLLMProvider {
  return MODEL_CATEGORY_PROVIDERS.audio;
}

// 本机订阅通道：通过本地桥接服务使用已登录订阅的额度（Grok Build / OpenCode / Codex），
// 用户不需要填写 API Key，计费走订阅而非 API 账户。
const LOCAL_SUBSCRIPTION_PROVIDERS = new Set<BuiltinLLMProvider>(["opencode", "grok-cli", "codex", "grok_build"]);

export function isLocalSubscriptionProvider(provider: BuiltinLLMProvider): boolean {
  return LOCAL_SUBSCRIPTION_PROVIDERS.has(provider);
}

export function isLocalBridgeBaseURL(baseURL: string | null | undefined): boolean {
  if (typeof baseURL !== "string" || !baseURL.trim()) {
    return false;
  }
  return /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?(\/|$)/.test(baseURL.trim());
}

// 文本槽当前生效模型：已保存配置 > 环境变量 > 注册表默认值。
// 全部任务路由（规划、正文、审校、修复等）统一使用这里的模型。
export async function resolveTextModelId(): Promise<string> {
  try {
    const row = await prisma.aPIKey.findUnique({
      where: { provider: MODEL_CATEGORY_PROVIDERS.text },
    });
    const saved = row?.model?.trim();
    if (saved) {
      return saved;
    }
  } catch {
    // table may not exist yet
  }
  return getProviderEnvModel(MODEL_CATEGORY_PROVIDERS.text)
    ?? PROVIDERS[MODEL_CATEGORY_PROVIDERS.text].defaultModel;
}
