import type { LLMProvider } from "@ai-novel/shared/types/llm";
import type { ImageBackground, ImageOutputFormat } from "./types";

export type BaseAssetImageKind = "character" | "scene" | "prop";

export const REFERENCE_IMAGE_PROVIDER = "codex" as const;

/**
 * 角色/道具参考图统一透明底（2026-08-22 用户决定）：底图要能直接叠进分镜首帧，
 * 透明 PNG 是唯一好用的形态。
 */
export const TRANSPARENT_BACKGROUND_KINDS: ReadonlySet<BaseAssetImageKind> = new Set(["character", "prop"]);

/** 透明底资产参考图的生成参数（PNG 才有 alpha 通道）。 */
export const TRANSPARENT_IMAGE_OPTIONS: { background: ImageBackground; outputFormat: ImageOutputFormat } = {
  background: "transparent",
  outputFormat: "png",
};

/**
 * 图片生成统一走 Codex 订阅通道（gpt-5.6-luna agent）：参考图、透明底与任意宽高比
 * 都由 Codex 承载。显式传入的 provider 仍然优先，便于个别调用点指定自定义通道。
 */
export function resolveImageProviderForReferences(
  _hasReference: boolean,
  requestedProvider?: LLMProvider | string,
): LLMProvider {
  const requested = requestedProvider?.trim();
  return requested ? (requested as LLMProvider) : REFERENCE_IMAGE_PROVIDER;
}

export function resolveAssetImageProvider(input: {
  kind: BaseAssetImageKind;
  hasReference: boolean;
}): LLMProvider {
  return resolveImageProviderForReferences(input.hasReference);
}
