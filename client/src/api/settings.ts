import type { ApiResponse } from "@ai-novel/shared/types/api";
import type {
  DirectorAutoApprovalPreferenceSettings,
} from "@ai-novel/shared/types/autoDirectorApproval";
import type { DirectorIssuePolicy } from "@ai-novel/shared/types/directorIssue";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import { apiClient } from "./client";

export type EmbeddingProvider = LLMProvider;

export interface APIKeyStatus {
  provider: LLMProvider;
  kind: "builtin" | "custom";
  name: string;
  displayName?: string;
  currentModel: string;
  currentImageModel: string | null;
  currentBaseURL: string;
  models: string[];
  imageModels: string[];
  defaultModel: string;
  defaultImageModel: string | null;
  defaultBaseURL: string;
  requiresApiKey: boolean;
  hasApiKey: boolean;
  isConfigured: boolean;
  isActive: boolean;
  reasoningEnabled: boolean;
  concurrencyLimit: number;
  requestIntervalMs: number;
  supportsImageGeneration: boolean;
}

// 模型按能力类别暴露：文本 / 图片 / 音频。
export type ModelCategoryStatus = APIKeyStatus & {
  usesLocalSubscription: boolean;
};

export interface ModelCategoriesStatus {
  text: ModelCategoryStatus;
  image: ModelCategoryStatus;
  audio: ModelCategoryStatus;
}

export interface RagProviderStatus {
  provider: EmbeddingProvider;
  name: string;
  isConfigured: boolean;
  isActive: boolean;
}

export interface RagEmbeddingModelStatus {
  provider: EmbeddingProvider;
  name: string;
  models: string[];
  defaultModel: string;
  isConfigured: boolean;
  isActive: boolean;
  source: "remote" | "fallback";
}

export interface RagSettingsStatus {
  embeddingProvider: EmbeddingProvider;
  embeddingModel: string;
  collectionVersion: number;
  collectionMode: "auto" | "manual";
  collectionName: string;
  collectionTag: string;
  autoReindexOnChange: boolean;
  embeddingBatchSize: number;
  embeddingTimeoutMs: number;
  embeddingMaxRetries: number;
  embeddingRetryBaseMs: number;
  embeddingConcurrency: number;
  enabled: boolean;
  qdrantUrl: string;
  qdrantApiKeyConfigured: boolean;
  qdrantTimeoutMs: number;
  qdrantUpsertMaxBytes: number;
  qdrantUpsertConcurrency: number;
  chunkSize: number;
  chunkOverlap: number;
  vectorCandidates: number;
  keywordCandidates: number;
  finalTopK: number;
  workerPollMs: number;
  workerMaxAttempts: number;
  workerRetryBaseMs: number;
  httpTimeoutMs: number;
  suggestedCollectionName: string;
  reindexQueuedCount?: number;
  providers: RagProviderStatus[];
}

export interface StyleEngineRuntimeSettingsStatus {
  styleExtractionTimeoutMs: number;
  defaultStyleExtractionTimeoutMs: number;
  minStyleExtractionTimeoutMs: number;
  maxStyleExtractionTimeoutMs: number;
}

export type DramaVideoRenderProfileId = "720p" | "1080p";

export interface DramaVideoRenderProfile {
  id: DramaVideoRenderProfileId;
  width: number;
  height: number;
  fps: 24;
}

export interface DramaVideoRenderProfileSettings {
  profile: DramaVideoRenderProfile;
  options: DramaVideoRenderProfile[];
}

export interface LLMSelectionSettings {
  provider: LLMProvider;
  model: string;
  temperature: number;
  maxTokens?: number;
}

export interface AutoDirectorChannelConfig {
  webhookUrl: string;
  callbackToken: string;
  operatorMapJson: string;
  eventTypes: string[];
}

export interface AutoDirectorChannelSettings {
  baseUrl: string;
  dingtalk: AutoDirectorChannelConfig;
  wecom: AutoDirectorChannelConfig;
}

export interface PendingReviewAutoPromotionSettings {
  enabled: boolean;
  baselineAt: string | null;
  acknowledgementText: string;
}

export interface GlobalNarratorVoiceState {
  description?: string;
  sampleAudioUrl?: string;
  referenceAudioUrl?: string;
  indexTTS25Speaker?: string;
  sampleText?: string;
  sampleSha256?: string;
  source?: "legacy" | "generated" | "manual";
  updatedAt?: string;
}

export async function getGlobalNarratorVoice() {
  const { data } = await apiClient.get<ApiResponse<GlobalNarratorVoiceState>>("/settings/narrator-voice");
  return data;
}

export async function saveGlobalNarratorVoiceDescription(
  description: string,
  options: { referenceAudioUrl?: string | null; indexTTS25Speaker?: string } = {},
) {
  const { data } = await apiClient.patch<ApiResponse<GlobalNarratorVoiceState>>(
    "/settings/narrator-voice",
    { description, ...options },
  );
  return data;
}

export async function designGlobalNarratorVoice(
  description: string,
  options: { referenceAudioUrl?: string | null; indexTTS25Speaker?: string } = {},
) {
  const { data } = await apiClient.post<ApiResponse<GlobalNarratorVoiceState>>(
    "/settings/narrator-voice/design",
    { description, ...options },
  );
  return data;
}

// ─── 通用环境资产（HDRI 全景环境的状态/提示词/生成图） ───

import type {
  StudioEnvironmentAsset,
  StudioEnvironmentAssetDocument,
  StudioEnvironmentAssetState,
  StudioEnvironmentId,
} from "@ai-novel/shared/types/studioEnvironmentAssets";

export type {
  StudioEnvironmentAsset,
  StudioEnvironmentAssetDocument,
  StudioEnvironmentAssetState,
  StudioEnvironmentId,
} from "@ai-novel/shared/types/studioEnvironmentAssets";

export async function getStudioEnvironmentAssets() {
  const { data } = await apiClient.get<ApiResponse<StudioEnvironmentAssetDocument>>(
    "/settings/environment-assets",
  );
  return data;
}

export async function saveStudioEnvironmentAsset(
  environmentId: StudioEnvironmentId,
  payload: {
    description?: string | null;
    states: Array<Pick<StudioEnvironmentAssetState, "id" | "label" | "description" | "imagePrompt" | "referenceStateId" | "eraStyle" | "timeOfDay" | "weather">>;
  },
) {
  const { data } = await apiClient.put<ApiResponse<StudioEnvironmentAsset>>(
    `/settings/environment-assets/${environmentId}`,
    payload,
  );
  return data;
}

export async function tweakStudioEnvironmentStateImagePrompt(
  environmentId: StudioEnvironmentId,
  payload: { stateLabel?: string; imagePrompt?: string; instruction: string },
) {
  const { data } = await apiClient.post<ApiResponse<{ imagePrompt: string }>>(
    `/settings/environment-assets/${environmentId}/tweak-prompt`,
    payload,
  );
  return data;
}

export async function setActiveStudioEnvironmentState(environmentId: StudioEnvironmentId, stateId: string) {
  const { data } = await apiClient.post<ApiResponse<StudioEnvironmentAsset>>(
    `/settings/environment-assets/${environmentId}/active-state`,
    { stateId },
  );
  return data;
}

export async function generateStudioEnvironmentStateImage(environmentId: StudioEnvironmentId, stateId: string) {
  const { data } = await apiClient.post<ApiResponse<StudioEnvironmentAsset>>(
    `/settings/environment-assets/${environmentId}/states/${stateId}/generate-image`,
    {},
  );
  return data;
}

export async function cancelStudioEnvironmentStateImage(environmentId: StudioEnvironmentId, stateId: string) {
  const { data } = await apiClient.post<ApiResponse<StudioEnvironmentAsset>>(
    `/settings/environment-assets/${environmentId}/states/${stateId}/cancel-image`,
    {},
  );
  return data;
}

export async function dismissStudioEnvironmentStateImageError(
  environmentId: StudioEnvironmentId,
  stateId: string,
  error: string,
  attemptId?: string,
) {
  const { data } = await apiClient.post<ApiResponse<StudioEnvironmentAsset>>(
    `/settings/environment-assets/${environmentId}/states/${stateId}/dismiss-image-error`,
    { error, ...(attemptId ? { attemptId } : {}) },
  );
  return data;
}

export async function getAPIKeySettings() {
  const { data } = await apiClient.get<ApiResponse<APIKeyStatus[]>>("/settings/api-keys");
  return data;
}

export async function getModelCategories() {
  const { data } = await apiClient.get<ApiResponse<ModelCategoriesStatus>>("/settings/model-categories");
  return data;
}

export async function testAudioSpeechConnection(payload: {
  provider: LLMProvider;
  apiKey?: string;
  model?: string;
  baseURL?: string;
}) {
  const { data } = await apiClient.post<
    ApiResponse<{
      latencyMs: number;
      byteLength: number;
      contentType: string;
    }>
  >("/settings/model-categories/audio/test", payload);
  return data;
}

export async function getRagSettings() {
  const { data } = await apiClient.get<ApiResponse<RagSettingsStatus>>("/settings/rag");
  return data;
}

export async function saveRagSettings(payload: {
  embeddingProvider: EmbeddingProvider;
  embeddingModel: string;
  collectionMode: "auto" | "manual";
  collectionName: string;
  collectionTag: string;
  autoReindexOnChange: boolean;
  embeddingBatchSize: number;
  embeddingTimeoutMs: number;
  embeddingMaxRetries: number;
  embeddingRetryBaseMs: number;
  embeddingConcurrency: number;
  enabled: boolean;
  qdrantUrl: string;
  qdrantApiKey?: string;
  clearQdrantApiKey?: boolean;
  qdrantTimeoutMs: number;
  qdrantUpsertMaxBytes: number;
  qdrantUpsertConcurrency: number;
  chunkSize: number;
  chunkOverlap: number;
  vectorCandidates: number;
  keywordCandidates: number;
  finalTopK: number;
  workerPollMs: number;
  workerMaxAttempts: number;
  workerRetryBaseMs: number;
  httpTimeoutMs: number;
}) {
  const { data } = await apiClient.put<
    ApiResponse<
      Pick<
        RagSettingsStatus,
        | "embeddingProvider"
        | "embeddingModel"
        | "collectionVersion"
        | "collectionMode"
        | "collectionName"
        | "collectionTag"
        | "autoReindexOnChange"
        | "embeddingBatchSize"
        | "embeddingTimeoutMs"
        | "embeddingMaxRetries"
        | "embeddingRetryBaseMs"
        | "embeddingConcurrency"
        | "enabled"
        | "qdrantUrl"
        | "qdrantApiKeyConfigured"
        | "qdrantTimeoutMs"
        | "qdrantUpsertMaxBytes"
        | "qdrantUpsertConcurrency"
        | "chunkSize"
        | "chunkOverlap"
        | "vectorCandidates"
        | "keywordCandidates"
        | "finalTopK"
        | "workerPollMs"
        | "workerMaxAttempts"
        | "workerRetryBaseMs"
        | "httpTimeoutMs"
        | "suggestedCollectionName"
        | "reindexQueuedCount"
      >
    >
  >("/settings/rag", payload);
  return data;
}

export async function getRagEmbeddingModels(provider: EmbeddingProvider) {
  const { data } = await apiClient.get<ApiResponse<RagEmbeddingModelStatus>>(
    `/settings/rag/models/${encodeURIComponent(provider)}`,
  );
  return data;
}

export async function getStyleEngineRuntimeSettings() {
  const { data } = await apiClient.get<ApiResponse<StyleEngineRuntimeSettingsStatus>>("/settings/style-engine-runtime");
  return data;
}

export async function getDramaVideoRenderProfileSettings() {
  const { data } = await apiClient.get<ApiResponse<DramaVideoRenderProfileSettings>>(
    "/settings/drama-video-render-profile",
  );
  return data;
}

export async function getLLMSelectionSetting() {
  const { data } = await apiClient.get<ApiResponse<LLMSelectionSettings | null>>("/settings/llm-selection");
  return data;
}

export async function saveLLMSelectionSetting(payload: LLMSelectionSettings) {
  const { data } = await apiClient.put<ApiResponse<LLMSelectionSettings>>("/settings/llm-selection", payload);
  return data;
}

export async function saveStyleEngineRuntimeSettings(payload: {
  styleExtractionTimeoutMs: number;
}) {
  const { data } = await apiClient.put<ApiResponse<StyleEngineRuntimeSettingsStatus>>(
    "/settings/style-engine-runtime",
    payload,
  );
  return data;
}

export async function saveAPIKeySetting(
  provider: LLMProvider,
  payload: {
    displayName?: string;
    key?: string;
    model?: string;
    imageModel?: string;
    baseURL?: string;
    isActive?: boolean;
    reasoningEnabled?: boolean;
    concurrencyLimit?: number;
    requestIntervalMs?: number;
  },
) {
  const { data } = await apiClient.put<
    ApiResponse<{
      provider: string;
      displayName: string | null;
      model: string | null;
      imageModel: string | null;
      baseURL: string | null;
      isActive: boolean;
      reasoningEnabled: boolean;
      concurrencyLimit: number;
      requestIntervalMs: number;
      models: string[];
      imageModels: string[];
      supportsImageGeneration: boolean;
    }>
  >(`/settings/api-keys/${provider}`, payload);
  return data;
}

export async function refreshProviderModelList(provider: LLMProvider) {
  const { data } = await apiClient.post<
    ApiResponse<{
      provider: string;
      models: string[];
      currentModel: string;
    }>
  >(`/settings/api-keys/${provider}/refresh-models`);
  return data;
}

export async function getAutoDirectorChannelSettings() {
  const { data } = await apiClient.get<ApiResponse<AutoDirectorChannelSettings>>("/settings/auto-director/channels");
  return data;
}

export async function saveAutoDirectorChannelSettings(payload: Partial<AutoDirectorChannelSettings>) {
  const { data } = await apiClient.put<ApiResponse<AutoDirectorChannelSettings>>("/settings/auto-director/channels", payload);
  return data;
}

export async function getAutoDirectorIssuePolicy() {
  const { data } = await apiClient.get<ApiResponse<DirectorIssuePolicy>>(
    "/settings/auto-director/issue-policy",
  );
  return data;
}

export async function saveAutoDirectorIssuePolicy(payload: DirectorIssuePolicy) {
  const { data } = await apiClient.put<ApiResponse<DirectorIssuePolicy>>(
    "/settings/auto-director/issue-policy",
    payload,
  );
  return data;
}

export async function getAutoDirectorApprovalPreferenceSettings() {
  const { data } = await apiClient.get<ApiResponse<DirectorAutoApprovalPreferenceSettings>>(
    "/settings/auto-director/approval-preferences",
  );
  return data;
}

export async function saveAutoDirectorApprovalPreferenceSettings(payload: {
  approvalPointCodes: string[];
}) {
  const { data } = await apiClient.put<ApiResponse<DirectorAutoApprovalPreferenceSettings>>(
    "/settings/auto-director/approval-preferences",
    payload,
  );
  return data;
}

export async function getPendingReviewAutoPromotionSettings() {
  const { data } = await apiClient.get<ApiResponse<PendingReviewAutoPromotionSettings>>(
    "/settings/auto-director/pending-review-auto-promotion",
  );
  return data;
}

export async function savePendingReviewAutoPromotionSettings(payload: {
  enabled: boolean;
  acknowledgedRisks?: boolean;
  confirmationText?: string;
}) {
  const { data } = await apiClient.put<ApiResponse<PendingReviewAutoPromotionSettings>>(
    "/settings/auto-director/pending-review-auto-promotion",
    payload,
  );
  return data;
}

export async function testLLMConnection(payload: {
  provider: LLMProvider;
  apiKey?: string;
  model?: string;
  baseURL?: string;
  probeMode?: "plain" | "structured" | "both";
}) {
  const { data } = await apiClient.post<
    ApiResponse<{
      success: boolean;
      model: string;
      latency: number;
      plain: {
        ok: boolean;
        latency: number | null;
        error: string | null;
      } | null;
      structured: {
        ok: boolean;
        latency: number | null;
        error: string | null;
        strategy: string | null;
        reasoningForcedOff: boolean;
        fallbackAvailable: boolean;
        fallbackUsed: boolean;
        errorCategory: string | null;
        nativeJsonObject: boolean;
        nativeJsonSchema: boolean;
        profileFamily: string | null;
      } | null;
    }>
  >("/llm/test", payload);
  return data;
}

export type DramaAssetStyleKind = "character" | "scene" | "prop";

export interface DramaAssetArtStyleSetting {
  kind: DramaAssetStyleKind;
  label: string;
  summary: string;
  prompt: string;
  defaultPrompt: string;
  formatInstructions: string;
  fixedAvoidInstructions: string;
  customized: boolean;
}

export interface DramaAssetArtStyleSettingsData {
  styles: DramaAssetArtStyleSetting[];
}

export async function getDramaAssetArtStyles() {
  const { data } = await apiClient.get<ApiResponse<DramaAssetArtStyleSettingsData>>("/settings/drama-asset-styles");
  return data;
}

export async function saveDramaVideoRenderProfileSettings(payload: {
  profile: DramaVideoRenderProfileId;
}) {
  const { data } = await apiClient.put<ApiResponse<DramaVideoRenderProfileSettings>>(
    "/settings/drama-video-render-profile",
    payload,
  );
  return data;
}

export async function updateDramaAssetArtStyle(kind: DramaAssetStyleKind, payload: { prompt: string }) {
  const { data } = await apiClient.put<ApiResponse<{ setting: DramaAssetArtStyleSetting }>>(
    `/settings/drama-asset-styles/${kind}`,
    payload,
  );
  return data;
}
