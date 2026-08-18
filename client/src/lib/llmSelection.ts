import type { APIKeyStatus, LLMSelectionSettings } from "@/api/settings";
import type { LLMProvider } from "@ai-novel/shared/types/llm";

export interface LLMSelectionValue {
  provider: LLMProvider;
  model: string;
  temperature?: number;
  maxTokens?: number;
}

export function sanitizeModelList(models: unknown): string[] {
  if (!Array.isArray(models)) {
    return [];
  }
  return Array.from(
    new Set(
      models
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter(Boolean),
    ),
  );
}

export function resolveModel(currentModel: string, models: string[]): string {
  const normalizedCurrent = currentModel.trim();
  if (normalizedCurrent) {
    return normalizedCurrent;
  }
  return models[0] ?? "";
}

export function getProviderSelectionModels(config: APIKeyStatus): string[] {
  return sanitizeModelList([config.currentModel, ...(config.models ?? [])]);
}

export function isRunnableProviderConfig(config: APIKeyStatus): boolean {
  return config.isConfigured && config.isActive && getProviderSelectionModels(config).length > 0;
}

export function resolvePreferredLLMSelection(
  preferred: LLMSelectionSettings | LLMSelectionValue | null | undefined,
  providerConfigs: APIKeyStatus[],
  fallback?: Pick<LLMSelectionValue, "temperature" | "maxTokens">,
  preferredProvider?: LLMProvider,
): LLMSelectionSettings | null {
  const runnableProviders = providerConfigs.filter(isRunnableProviderConfig);
  if (runnableProviders.length === 0) {
    return null;
  }

  // 模型统一走文本槽：保存过的选择只有落在文本槽供应商上时才沿用其模型，
  // 否则回退到文本槽当前模型。
  const categoryConfig = preferredProvider
    ? runnableProviders.find((item) => item.provider === preferredProvider)
    : undefined;
  if (categoryConfig) {
    const model = preferred?.provider === categoryConfig.provider
      ? resolveModel(preferred.model ?? "", getProviderSelectionModels(categoryConfig))
      : resolveModel("", getProviderSelectionModels(categoryConfig));
    if (!model) {
      return null;
    }
    return {
      provider: categoryConfig.provider,
      model,
      temperature: preferred?.temperature ?? fallback?.temperature ?? 0.7,
      ...(preferred?.maxTokens !== undefined
        ? { maxTokens: preferred.maxTokens }
        : fallback?.maxTokens !== undefined
          ? { maxTokens: fallback.maxTokens }
          : {}),
    };
  }

  const preferredProviderConfig = preferred?.provider
    ? runnableProviders.find((item) => item.provider === preferred.provider)
    : undefined;
  const selectedConfig = preferredProviderConfig ?? runnableProviders[0];
  const selectedModel = preferredProviderConfig ? preferred?.model ?? "" : "";
  const model = resolveModel(selectedModel, getProviderSelectionModels(selectedConfig));
  if (!model) {
    return null;
  }

  return {
    provider: selectedConfig.provider,
    model,
    temperature: preferred?.temperature ?? fallback?.temperature ?? 0.7,
    ...(preferred?.maxTokens !== undefined
      ? { maxTokens: preferred.maxTokens }
      : fallback?.maxTokens !== undefined
        ? { maxTokens: fallback.maxTokens }
        : {}),
  };
}
