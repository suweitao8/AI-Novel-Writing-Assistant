import { useCallback, useEffect, useMemo } from "react";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getAPIKeySettings,
  getModelCategories,
  saveLLMSelectionSetting,
} from "@/api/settings";
import { queryKeys } from "@/api/queryKeys";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  getProviderSelectionModels,
  isRunnableProviderConfig,
  resolveModel,
} from "@/lib/llmSelection";
import { useLLMStore } from "@/store/llmStore";
import SearchableSelect from "./SearchableSelect";

export interface LLMSelectorValue {
  provider: LLMProvider;
  model: string;
  temperature?: number;
  maxTokens?: number;
}

interface LLMSelectorProps {
  value?: LLMSelectorValue;
  onChange?: (value: LLMSelectorValue) => void;
  showModel?: boolean;
  showParameters?: boolean;
  showCompactTemperature?: boolean;
  compact?: boolean;
  showBadge?: boolean;
  showHelperText?: boolean;
  className?: string;
}

function clampTemperature(value: number): number {
  return Math.min(2, Math.max(0, value));
}

function clampMaxTokens(value: number): number {
  return Math.min(32768, Math.max(256, Math.floor(value)));
}

// 模型选择器只暴露文本模型槽的模型列表；供应商是内部实现，不再让用户挑选。
export default function LLMSelector({
  value,
  onChange,
  showModel = true,
  showParameters = false,
  showCompactTemperature = false,
  compact = false,
  showBadge = true,
  showHelperText = true,
  className,
}: LLMSelectorProps) {
  const store = useLLMStore();
  const queryClient = useQueryClient();
  const currentValue = value ?? {
    provider: store.provider,
    model: store.model,
    temperature: store.temperature,
    maxTokens: store.maxTokens,
  };

  const resolvedTemperature = currentValue.temperature ?? store.temperature;
  const resolvedMaxTokens = currentValue.maxTokens ?? store.maxTokens;

  const apiKeySettingsQuery = useQuery({
    queryKey: queryKeys.settings.apiKeys,
    queryFn: getAPIKeySettings,
    staleTime: 5 * 60 * 1000,
  });

  const modelCategoriesQuery = useQuery({
    queryKey: queryKeys.settings.modelCategories,
    queryFn: getModelCategories,
    staleTime: 5 * 60 * 1000,
  });

  const saveSelectionMutation = useMutation({
    mutationFn: saveLLMSelectionSetting,
    onSuccess: (response) => {
      queryClient.setQueryData(queryKeys.settings.llmSelection, response);
    },
  });

  const textProvider = modelCategoriesQuery.data?.data?.text?.provider;

  const categoryConfig = useMemo(() => {
    const runnableConfigs = (apiKeySettingsQuery.data?.data ?? []).filter(isRunnableProviderConfig);
    return runnableConfigs.find((item) => item.provider === textProvider) ?? runnableConfigs[0];
  }, [apiKeySettingsQuery.data?.data, textProvider]);

  const models = useMemo(() => {
    const providerModels = categoryConfig ? getProviderSelectionModels(categoryConfig) : [];
    const currentModel = currentValue.model.trim();
    if (!currentModel || providerModels.includes(currentModel)) {
      return providerModels;
    }
    return [currentModel, ...providerModels];
  }, [categoryConfig, currentValue.model]);

  const resolvedModel = useMemo(
    () => resolveModel(currentValue.model, models),
    [currentValue.model, models],
  );
  const hasModel = Boolean(categoryConfig && models.length > 0);
  const shouldWaitForGlobalHydration = !value && !onChange && !store.hasHydratedSelection;

  const updateValue = useCallback((next: LLMSelectorValue) => {
    const normalizedModel = resolveModel(next.model, models);
    const normalizedTemperature = next.temperature !== undefined
      ? clampTemperature(next.temperature)
      : undefined;
    const normalizedMaxTokens = next.maxTokens !== undefined
      ? clampMaxTokens(next.maxTokens)
      : undefined;
    const normalizedNext: LLMSelectorValue = {
      ...next,
      model: normalizedModel,
      temperature: normalizedTemperature,
      maxTokens: normalizedMaxTokens,
    };
    if (onChange) {
      onChange(normalizedNext);
      return;
    }
    store.setSelection({
      provider: normalizedNext.provider,
      model: normalizedNext.model,
      temperature: normalizedNext.temperature,
      maxTokens: normalizedNext.maxTokens,
    });
    saveSelectionMutation.mutate({
      provider: normalizedNext.provider,
      model: normalizedNext.model,
      temperature: normalizedNext.temperature ?? store.temperature,
      ...(normalizedNext.maxTokens !== undefined ? { maxTokens: normalizedNext.maxTokens } : {}),
    });
  }, [models, onChange, saveSelectionMutation, store]);

  useEffect(() => {
    if (shouldWaitForGlobalHydration) {
      return;
    }
    if (!categoryConfig) {
      return;
    }
    if (currentValue.provider === categoryConfig.provider && resolvedModel === currentValue.model) {
      return;
    }
    updateValue({
      provider: categoryConfig.provider,
      model: resolvedModel,
      temperature: resolvedTemperature,
      maxTokens: resolvedMaxTokens,
    });
  }, [
    categoryConfig,
    currentValue.model,
    currentValue.provider,
    resolvedMaxTokens,
    resolvedModel,
    resolvedTemperature,
    shouldWaitForGlobalHydration,
    updateValue,
  ]);

  const onModelChange = (model: string) => {
    if (!categoryConfig) {
      return;
    }
    updateValue({
      provider: categoryConfig.provider,
      model,
      temperature: resolvedTemperature,
      maxTokens: resolvedMaxTokens,
    });
  };

  const renderTemperatureInput = (inputClassName?: string, inputWrapperClassName?: string) => (
    <label
      className={cn(
        "flex h-9 shrink-0 items-center gap-1.5 rounded-md border border-input bg-background px-2 text-xs text-muted-foreground shadow-sm",
        inputWrapperClassName,
      )}
      title="温度越高越发散；结构规划建议使用 0.3～0.7"
    >
      <span>温度</span>
      <Input
        aria-label="模型温度"
        type="number"
        step="0.1"
        min={0}
        max={2}
        value={resolvedTemperature}
        className={cn("h-7 w-14 border-0 bg-transparent px-1 text-center text-xs text-foreground shadow-none focus-visible:ring-1", inputClassName)}
        onChange={(event) => {
          const parsed = Number(event.target.value);
          if (!Number.isFinite(parsed)) {
            return;
          }
          if (!categoryConfig) {
            return;
          }
          updateValue({
            provider: categoryConfig.provider,
            model: resolvedModel,
            temperature: parsed,
            maxTokens: resolvedMaxTokens,
          });
        }}
        onBlur={() => {
          if (!categoryConfig) {
            return;
          }
          updateValue({
            provider: categoryConfig.provider,
            model: resolvedModel,
            temperature: clampTemperature(resolvedTemperature),
            maxTokens: resolvedMaxTokens,
          });
        }}
        disabled={!hasModel}
      />
    </label>
  );

  return (
    <div className={cn("space-y-2", compact && "space-y-1", className)}>
      <div className={cn("flex min-w-0 items-center gap-2", compact ? "flex-nowrap gap-1.5" : "flex-wrap")}>
        {showBadge ? <Badge variant="secondary">模型</Badge> : null}
        {showModel ? (
          <SearchableSelect
            value={resolvedModel}
            onValueChange={onModelChange}
            options={models.map((model) => ({ value: model }))}
            placeholder={hasModel ? "选择文本模型" : "暂无可用模型"}
            searchPlaceholder="搜索模型"
            emptyText="没有可用模型"
            className={cn(compact ? "w-[240px] lg:w-[280px]" : "w-full sm:max-w-[320px]")}
            triggerClassName={compact ? "h-9 px-2.5" : undefined}
            disabled={!hasModel}
          />
        ) : null}

        {showCompactTemperature ? renderTemperatureInput() : null}
      </div>

      {showHelperText && !hasModel && !apiKeySettingsQuery.isLoading ? (
        <div className="text-xs text-muted-foreground">
          还没有可用的文本模型，请先到系统设置的模型设置里完成配置。
        </div>
      ) : null}

      {showParameters ? (
        <div className="grid gap-2 md:grid-cols-2">
          {renderTemperatureInput("h-8 w-full md:w-24", "w-full justify-between md:w-auto md:justify-start px-3")}

          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">最大 Tokens (留空 = 不限制)</span>
            <Input
              type="number"
              step="1"
              min={256}
              max={32768}
              value={resolvedMaxTokens ?? ""}
              disabled={!hasModel}
              onChange={(event) => {
                if (!event.target.value.trim()) {
                  if (categoryConfig) {
                    updateValue({
                      provider: categoryConfig.provider,
                      model: resolvedModel,
                      temperature: resolvedTemperature,
                      maxTokens: undefined,
                    });
                  }
                  return;
                }
                const parsed = Number(event.target.value);
                if (!Number.isFinite(parsed)) {
                  return;
                }
                if (!categoryConfig) {
                  return;
                }
                updateValue({
                  provider: categoryConfig.provider,
                  model: resolvedModel,
                  temperature: resolvedTemperature,
                  maxTokens: parsed,
                });
              }}
              onBlur={() => {
                if (!categoryConfig) {
                  return;
                }
                if (resolvedMaxTokens === undefined) {
                  updateValue({
                    provider: categoryConfig.provider,
                    model: resolvedModel,
                    temperature: resolvedTemperature,
                    maxTokens: undefined,
                  });
                  return;
                }
                updateValue({
                  provider: categoryConfig.provider,
                  model: resolvedModel,
                  temperature: resolvedTemperature,
                  maxTokens: clampMaxTokens(resolvedMaxTokens),
                });
              }}
            />
          </label>
        </div>
      ) : null}
    </div>
  );
}
