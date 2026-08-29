import type { BuiltinLLMProvider } from "@ai-novel/shared/types/llm";
import { getTextModelProvider } from "../../../../llm/modelCategories";
import {
  getProviderEnvApiKey,
  getProviderEnvBaseUrl,
  getProviderEnvModel,
  providerRequiresApiKey,
  PROVIDERS,
} from "../../../../llm/providers";
import { secretStore } from "../../../../services/settings/secretStore";

export interface CreationEnvironmentReadiness {
  ready: boolean;
  provider: BuiltinLLMProvider;
  model: string | null;
}

function normalize(value: string | null | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized || undefined;
}

export async function getCreationEnvironmentReadiness(): Promise<CreationEnvironmentReadiness> {
  const provider = getTextModelProvider();
  const config = PROVIDERS[provider];
  const record = await secretStore.getProvider(provider);
  const model = normalize(record?.model) ?? getProviderEnvModel(provider) ?? config.defaultModel;
  const baseURL = normalize(record?.baseURL) ?? getProviderEnvBaseUrl(provider) ?? config.baseURL;
  const apiKey = normalize(record?.key) ?? getProviderEnvApiKey(provider);
  const hasRequiredCredential = !providerRequiresApiKey(provider) || Boolean(apiKey);

  return {
    ready: (record?.isActive ?? true) && Boolean(model && baseURL) && hasRequiredCredential,
    provider,
    model: model ?? null,
  };
}
