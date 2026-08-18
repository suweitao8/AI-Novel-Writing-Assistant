import type { BuiltinLLMProvider } from "@ai-novel/shared/types/llm";
import { prisma } from "../db/prisma";
import { getProviderEnvModel, PROVIDERS } from "./providers";

// 产品对用户只暴露“文本 / 图片 / 音频”三类模型能力，每类能力对应一个内部槽位：
// - 文本槽承担大纲、正文、审校、修复等全部文字任务；
// - 图片槽承担封面、角色立绘、场景插图等图片生成任务；
// - 音频槽预留给配音与朗读能力，当前未开放。
// 槽位的服务地址、API Key、模型均可编辑：更换供应商时修改槽位配置即可，
// 产品不再提供按“厂商”维度逐个配置的界面。
export const MODEL_CATEGORY_PROVIDERS = {
  text: "opencode",
  image: "codex",
} as const satisfies Record<"text" | "image", BuiltinLLMProvider>;

export type ModelCategoryKey = keyof typeof MODEL_CATEGORY_PROVIDERS;

export function getTextModelProvider(): BuiltinLLMProvider {
  return MODEL_CATEGORY_PROVIDERS.text;
}

export function getImageModelProvider(): BuiltinLLMProvider {
  return MODEL_CATEGORY_PROVIDERS.image;
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
