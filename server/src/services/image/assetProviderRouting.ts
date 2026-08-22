import type { LLMProvider } from "@ai-novel/shared/types/llm";
import { getImageModelProvider } from "../../llm/modelCategories";
import type { ImageBackground, ImageOutputFormat } from "./types";

export type BaseAssetImageKind = "character" | "scene" | "prop";

export const GROK_BUILD_IMAGE_PROVIDER = "grok_build" as const;
export const REFERENCE_IMAGE_PROVIDER = "codex" as const;

/**
 * 角色/道具参考图统一透明底（2026-08-22 用户决定）：底图要能直接叠进分镜首帧，
 * 透明 PNG 是唯一好用的形态，而透明背景只有 Codex 图片通道（订阅额度）做得稳定。
 * 这两类资产参考图不再按「有无参考图」分流，一律走 Codex；场景全景仍按原路由。
 */
export const TRANSPARENT_BACKGROUND_KINDS: ReadonlySet<BaseAssetImageKind> = new Set(["character", "prop"]);

/** 透明底资产参考图的生成参数（PNG 才有 alpha 通道）。 */
export const TRANSPARENT_IMAGE_OPTIONS: { background: ImageBackground; outputFormat: ImageOutputFormat } = {
  background: "transparent",
  outputFormat: "png",
};

/**
 * Grok Build is the default image channel, but its prompt-only bridge cannot
 * consume reference images. Keep reference-backed requests on the compatible
 * Codex image channel instead of letting an edit request fail downstream.
 */
export function resolveImageProviderForReferences(
  hasReference: boolean,
  requestedProvider?: LLMProvider | string,
): LLMProvider {
  const requested = requestedProvider?.trim();
  if (requested) {
    return requested === GROK_BUILD_IMAGE_PROVIDER && hasReference
      ? REFERENCE_IMAGE_PROVIDER
      : requested;
  }
  return hasReference ? REFERENCE_IMAGE_PROVIDER : GROK_BUILD_IMAGE_PROVIDER;
}

export function resolveAssetImageProvider(input: {
  kind: BaseAssetImageKind;
  hasReference: boolean;
}): LLMProvider {
  if (TRANSPARENT_BACKGROUND_KINDS.has(input.kind)) {
    return REFERENCE_IMAGE_PROVIDER;
  }
  // 场景全景要 2:1 等距柱状比例（2026-08-23 用户要求）：grok_build 固定输出 1280x720，
  // 只有 Codex 能按任意宽高比出图，场景图与角色/道具一样统一走 Codex 订阅通道。
  if (input.kind === "scene") {
    return REFERENCE_IMAGE_PROVIDER;
  }
  return resolveImageProviderForReferences(input.hasReference, getImageModelProvider());
}
