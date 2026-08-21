import type { LLMProvider } from "@ai-novel/shared/types/llm";
import { getImageModelProvider } from "../../llm/modelCategories";

export type BaseAssetImageKind = "character" | "scene" | "prop";

export const GROK_BUILD_IMAGE_PROVIDER = "grok_build" as const;

export function resolveAssetImageProvider(input: {
  kind: BaseAssetImageKind;
  hasReference: boolean;
}): LLMProvider {
  if (!input.hasReference) {
    return GROK_BUILD_IMAGE_PROVIDER;
  }
  return getImageModelProvider();
}
