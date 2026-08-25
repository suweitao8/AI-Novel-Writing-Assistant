import type { LLMProvider } from "@ai-novel/shared/types/llm";
import type { ImageSceneType } from "@ai-novel/shared/types/image";

export const IMAGE_SIZES = ["512x512", "768x768", "1024x1024", "1024x1536", "1536x864", "1536x1024", "2048x1024"] as const;
export const IMAGE_PROMPT_MODES = ["character_chain", "novel_cover_chain", "direct"] as const;
export const IMAGE_PROMPT_OUTPUT_LANGUAGES = ["zh", "en"] as const;
export const IMAGE_OUTPUT_FORMATS = ["png", "jpeg", "webp"] as const;
export const IMAGE_BACKGROUNDS = ["transparent", "opaque", "auto"] as const;
export const IMAGE_QUALITIES = ["low", "medium", "high", "auto"] as const;
export const IMAGE_MODERATION_LEVELS = ["low", "auto"] as const;

export type ImageSize = (typeof IMAGE_SIZES)[number];
export type ImagePromptMode = (typeof IMAGE_PROMPT_MODES)[number];
export type ImagePromptOutputLanguage = (typeof IMAGE_PROMPT_OUTPUT_LANGUAGES)[number];
export type ImageOutputFormat = (typeof IMAGE_OUTPUT_FORMATS)[number];
export type ImageBackground = (typeof IMAGE_BACKGROUNDS)[number];
export type ImageQuality = (typeof IMAGE_QUALITIES)[number];
export type ImageModerationLevel = (typeof IMAGE_MODERATION_LEVELS)[number];

interface BaseImageGenerationRequest {
  prompt: string;
  negativePrompt?: string;
  stylePreset?: string;
  /** 画面风格注册表标识（visual-style 模块）；提供时优先于 stylePreset 自由文本 */
  styleKey?: string;
  provider?: LLMProvider;
  model?: string;
  size?: ImageSize;
  count?: number;
  seed?: number;
  maxRetries?: number;
  referenceImageAssetIds?: string[];
}

export interface CharacterImageGenerationRequest extends BaseImageGenerationRequest {
  sceneType: Extract<ImageSceneType, "character">;
  baseCharacterId: string;
  promptMode?: Extract<ImagePromptMode, "character_chain" | "direct">;
}

export interface BookAnalysisCharacterImageGenerationRequest extends BaseImageGenerationRequest {
  sceneType: Extract<ImageSceneType, "book_analysis_character">;
  bookAnalysisCharacterId: string;
  promptMode?: Extract<ImagePromptMode, "character_chain" | "direct">;
}

export interface NovelCoverImageGenerationRequest extends BaseImageGenerationRequest {
  sceneType: Extract<ImageSceneType, "novel_cover">;
  novelId: string;
  promptMode?: Extract<ImagePromptMode, "novel_cover_chain" | "direct">;
}

export type ImageGenerationRequest =
  | CharacterImageGenerationRequest
  | BookAnalysisCharacterImageGenerationRequest
  | NovelCoverImageGenerationRequest;

export interface OptimizeCharacterImagePromptRequest {
  sceneType: Extract<ImageSceneType, "character">;
  baseCharacterId: string;
  sourcePrompt: string;
  stylePreset?: string;
  outputLanguage: ImagePromptOutputLanguage;
}

export interface OptimizeBookAnalysisCharacterImagePromptRequest {
  sceneType: Extract<ImageSceneType, "book_analysis_character">;
  bookAnalysisCharacterId: string;
  sourcePrompt: string;
  stylePreset?: string;
  outputLanguage: ImagePromptOutputLanguage;
}

export interface OptimizeNovelCoverImagePromptRequest {
  sceneType: Extract<ImageSceneType, "novel_cover">;
  novelId: string;
  sourcePrompt: string;
  stylePreset?: string;
  outputLanguage: ImagePromptOutputLanguage;
}

export type OptimizeImagePromptRequest =
  | OptimizeCharacterImagePromptRequest
  | OptimizeBookAnalysisCharacterImagePromptRequest
  | OptimizeNovelCoverImagePromptRequest;

export interface ImageProviderGenerateInput {
  sceneType: Extract<ImageSceneType, "character" | "novel_cover" | "chapter_illustration" | "book_analysis_character">;
  provider: LLMProvider;
  model: string;
  prompt: string;
  negativePrompt?: string;
  size: ImageSize;
  count: number;
  seed?: number;
  quality?: ImageQuality;
  background?: ImageBackground;
  outputFormat?: ImageOutputFormat;
  outputCompression?: number;
  moderation?: ImageModerationLevel;
  /** 参考图 URL 列表（支持 http/https、data URL 和服务端相对 URL）。 */
  refImages?: string[];
  /** 参考图本地文件路径列表；有值时按顺序通过 multipart/form-data 上传。 */
  refImagePaths?: string[];
  /** 与实际附件顺序对应的参考图标签，供桥接器建立角色/场景用途清单。 */
  referenceImages?: Array<{ kind: string; label: string }>;
  /** 外部终止信号：abort 时立即中断底层 HTTP 请求（手动终止生成用，不等超时） */
  signal?: AbortSignal;
}

export interface GeneratedImage {
  url: string;
  mimeType?: string;
  width?: number;
  height?: number;
  seed?: number;
  metadata?: Record<string, unknown>;
}

export interface ImageProviderGenerateResult {
  provider: LLMProvider;
  model: string;
  images: GeneratedImage[];
  /** 实际发送给 provider 的参考附件指纹，用于阻止原样回传参考图。 */
  referenceFingerprints?: string[];
}
