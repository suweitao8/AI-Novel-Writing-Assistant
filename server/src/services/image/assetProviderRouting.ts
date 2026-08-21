import type { LLMProvider } from "@ai-novel/shared/types/llm";
import { getImageModelProvider } from "../../llm/modelCategories";

export type BaseAssetImageKind = "character" | "scene" | "prop";

export const GROK_BUILD_IMAGE_PROVIDER = "grok_build" as const;
export const REFERENCE_IMAGE_PROVIDER = "codex" as const;

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
  return resolveImageProviderForReferences(input.hasReference, getImageModelProvider());
}
