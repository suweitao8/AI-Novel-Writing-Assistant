/**
 * Shared request/preview contracts for image-generation confirmation flows.
 *
 * These contracts are intentionally owned by the image-generation capability,
 * not by a product-specific API module, because drama, book analysis and
 * retained legacy clients all consume the same preview dialog.
 */
export interface ImageGenerationPreview {
  kind: string;
  title: string;
  prompt: string;
  negativePrompt?: string;
  referenceImages: Array<{ kind: string; label: string; url: string; assetId?: string }>;
  provider: string;
  size: string;
  availableProviders?: Array<{ value: string; label: string }>;
  availableSizes?: string[];
}

export interface ImageGenerationOverrides {
  promptOverride?: string;
  providerOverride?: string;
  sizeOverride?: string;
  negativePromptOverride?: string;
  excludedReferenceImageUrls?: string[];
}
