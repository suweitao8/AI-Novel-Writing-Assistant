import type { LLMProvider } from "@ai-novel/shared/types/llm";
import type {
  ModelRouteRequestProtocol,
  ModelRouteStructuredResponseFormat,
  ModelRouteTaskType,
} from "@ai-novel/shared/types/novel";
import { prisma } from "../db/prisma";
import { getTextModelProvider, resolveTextModelId } from "./modelCategories";
import { isBuiltInProvider, PROVIDERS } from "./providers";
import type { StructuredOutputStrategy } from "./structuredOutput";

export type TaskType =
  | ModelRouteTaskType
  | "outline_planning"
  | "chapter_drafting"
  | "chapter_review"
  | "chapter_repair"
  | "summary_generation"
  | "chat"
  | "default";

const TASK_TYPE_ALIASES: Partial<Record<TaskType, ModelRouteTaskType>> = {
  outline_planning: "planner",
  chapter_drafting: "writer",
  chapter_review: "review",
  chapter_repair: "repair",
  summary_generation: "summary",
  fact_extraction: "fact_extraction",
};

export const MODEL_ROUTE_TASK_TYPES: ModelRouteTaskType[] = [
  "planner",
  "writer",
  "review",
  "light_review",
  "critical_review",
  "repair",
  "replan",
  "state_resolution",
  "summary",
  "fact_extraction",
  "chat",
];

export interface ResolvedModel {
  provider: LLMProvider;
  model: string;
  temperature: number;
  maxTokens?: number;
  requestProtocol: ModelRouteRequestProtocol;
  structuredResponseFormat: ModelRouteStructuredResponseFormat;
  routeKey: ModelRouteTaskType | "default";
  routeDegraded: boolean;
}

// 任务级默认参数：温度按任务特性区分；provider 与 model 统一来自文本模型槽，
// 用户不再按任务挑选厂商或模型。
const TASK_ROUTE_DEFAULTS: Record<ModelRouteTaskType | "default", {
  temperature: number;
  requestProtocol: ModelRouteRequestProtocol;
  structuredResponseFormat: ModelRouteStructuredResponseFormat;
}> = {
  planner: { temperature: 0.3, requestProtocol: "auto", structuredResponseFormat: "auto" },
  writer: { temperature: 0.8, requestProtocol: "auto", structuredResponseFormat: "auto" },
  review: { temperature: 0.2, requestProtocol: "auto", structuredResponseFormat: "auto" },
  light_review: { temperature: 0.2, requestProtocol: "auto", structuredResponseFormat: "auto" },
  critical_review: { temperature: 0.1, requestProtocol: "auto", structuredResponseFormat: "auto" },
  repair: { temperature: 0.4, requestProtocol: "auto", structuredResponseFormat: "auto" },
  replan: { temperature: 0.2, requestProtocol: "auto", structuredResponseFormat: "auto" },
  state_resolution: { temperature: 0.1, requestProtocol: "auto", structuredResponseFormat: "auto" },
  summary: { temperature: 0.2, requestProtocol: "auto", structuredResponseFormat: "auto" },
  fact_extraction: { temperature: 0.2, requestProtocol: "auto", structuredResponseFormat: "auto" },
  chat: { temperature: 0.7, requestProtocol: "auto", structuredResponseFormat: "auto" },
  default: { temperature: 0.7, requestProtocol: "auto", structuredResponseFormat: "auto" },
};

function normalizeProviderId(value: string | null | undefined): LLMProvider {
  if (typeof value !== "string") {
    return getTextModelProvider();
  }
  const trimmed = value.trim();
  return trimmed || getTextModelProvider();
}

function normalizeMaxTokens(provider: LLMProvider, maxTokens?: number): number | undefined {
  if (typeof maxTokens !== "number" || !Number.isFinite(maxTokens)) {
    return undefined;
  }
  const normalized = Math.floor(maxTokens);
  if (normalized < 1) {
    return undefined;
  }
  // Historical UI defaults persisted 4096 as a placeholder for "use provider defaults".
  if (normalized === 4096) {
    return undefined;
  }
  const providerLimit = isBuiltInProvider(provider) ? PROVIDERS[provider].maxTokens : undefined;
  if (typeof providerLimit === "number") {
    return Math.min(normalized, providerLimit);
  }
  return normalized;
}

export function normalizeRequestProtocol(value?: string | null): ModelRouteRequestProtocol {
  if (value === "openai_compatible" || value === "anthropic") {
    return value;
  }
  return "auto";
}

export function normalizeStructuredResponseFormat(value?: string | null): ModelRouteStructuredResponseFormat {
  if (value === "json_schema" || value === "json_object" || value === "prompt_json") {
    return value;
  }
  return "auto";
}

function normalizeRoutePreferences(input: {
  requestProtocol?: string | null;
  structuredResponseFormat?: string | null;
}): {
  requestProtocol: ModelRouteRequestProtocol;
  structuredResponseFormat: ModelRouteStructuredResponseFormat;
} {
  const requestProtocol = normalizeRequestProtocol(input.requestProtocol);
  const structuredResponseFormat = requestProtocol === "anthropic"
    ? "prompt_json"
    : normalizeStructuredResponseFormat(input.structuredResponseFormat);
  return {
    requestProtocol,
    structuredResponseFormat,
  };
}

export function toStructuredOutputStrategy(
  value: ModelRouteStructuredResponseFormat,
): StructuredOutputStrategy | null {
  return value === "auto" ? null : value;
}

function applyOverrides(
  base: ResolvedModel,
  userOverride?: {
    provider?: LLMProvider;
    model?: string;
    temperature?: number;
    maxTokens?: number;
    requestProtocol?: ModelRouteRequestProtocol;
    structuredResponseFormat?: ModelRouteStructuredResponseFormat;
  },
): ResolvedModel {
  const merged: ResolvedModel = {
    ...base,
    ...(userOverride?.provider != null && { provider: userOverride.provider }),
    ...(userOverride?.model != null && { model: userOverride.model }),
    ...(userOverride?.temperature != null && { temperature: userOverride.temperature }),
    ...(userOverride?.maxTokens != null && { maxTokens: userOverride.maxTokens }),
    ...(userOverride?.requestProtocol != null && { requestProtocol: userOverride.requestProtocol }),
    ...(userOverride?.structuredResponseFormat != null && {
      structuredResponseFormat: userOverride.structuredResponseFormat,
    }),
  };
  const routePreferences = normalizeRoutePreferences({
    requestProtocol: merged.requestProtocol,
    structuredResponseFormat: merged.structuredResponseFormat,
  });
  return {
    ...merged,
    ...routePreferences,
    maxTokens: normalizeMaxTokens(merged.provider, merged.maxTokens),
    routeKey: merged.routeKey,
    routeDegraded: merged.routeDegraded,
  };
}

function normalizeTaskType(taskType: TaskType): ModelRouteTaskType | "default" {
  const aliased = TASK_TYPE_ALIASES[taskType];
  if (aliased) {
    return aliased;
  }
  if (taskType === "default") {
    return "default";
  }
  if (MODEL_ROUTE_TASK_TYPES.includes(taskType as ModelRouteTaskType)) {
    return taskType as ModelRouteTaskType;
  }
  return "default";
}

export async function resolveModel(
  taskType: TaskType,
  userOverride?: {
    provider?: LLMProvider;
    model?: string;
    temperature?: number;
    maxTokens?: number;
    requestProtocol?: ModelRouteRequestProtocol;
    structuredResponseFormat?: ModelRouteStructuredResponseFormat;
  },
): Promise<ResolvedModel> {
  const normalizedTaskType = normalizeTaskType(taskType);
  const defaults = TASK_ROUTE_DEFAULTS[normalizedTaskType] ?? TASK_ROUTE_DEFAULTS.default;
  // 槽位化后所有任务的 provider/model 一律来自文本槽，避免历史路由把任务
  // 钉在已不再使用的供应商上（例如回退到未配置的 DeepSeek）。
  const provider = getTextModelProvider();
  const model = await resolveTextModelId();

  let temperature = defaults.temperature;
  let maxTokens: number | undefined;
  let routePreferences = {
    requestProtocol: defaults.requestProtocol,
    structuredResponseFormat: defaults.structuredResponseFormat,
  };

  try {
    const row = await prisma.modelRouteConfig.findUnique({
      where: { taskType: normalizedTaskType },
    });
    if (row) {
      // 路由行只保留温度与结构化协议偏好，provider/model 不再从路由行读取。
      temperature = row.temperature;
      maxTokens = normalizeMaxTokens(provider, row.maxTokens ?? undefined);
      routePreferences = normalizeRoutePreferences({
        requestProtocol: "requestProtocol" in row ? row.requestProtocol : null,
        structuredResponseFormat: "structuredResponseFormat" in row ? row.structuredResponseFormat : null,
      });
    }
  } catch {
    // table may not exist yet
  }

  return applyOverrides({
    provider,
    model,
    temperature,
    maxTokens,
    ...routePreferences,
    routeKey: normalizedTaskType,
    routeDegraded: false,
  }, userOverride);
}

export async function listModelRouteConfigs(): Promise<Array<{
  taskType: string;
  provider: string;
  model: string;
  temperature: number;
  maxTokens: number | null;
  requestProtocol: ModelRouteRequestProtocol;
  structuredResponseFormat: ModelRouteStructuredResponseFormat;
}>> {
  try {
    // 返回各任务当前生效的解析结果（统一指向文本槽），而不是原始路由行。
    return await Promise.all(MODEL_ROUTE_TASK_TYPES.map(async (taskType) => {
      const resolved = await resolveModel(taskType);
      return {
        taskType,
        provider: resolved.provider,
        model: resolved.model,
        temperature: resolved.temperature,
        maxTokens: resolved.maxTokens ?? null,
        requestProtocol: resolved.requestProtocol,
        structuredResponseFormat: resolved.structuredResponseFormat,
      };
    }));
  } catch {
    return [];
  }
}

export async function upsertModelRouteConfig(
  taskType: string,
  data: {
    provider: string;
    model: string;
    temperature?: number;
    maxTokens?: number | null;
    requestProtocol?: string | null;
    structuredResponseFormat?: string | null;
  },
): Promise<void> {
  const normalizedTaskType = normalizeTaskType(taskType as TaskType);
  const provider = normalizeProviderId(data.provider);
  const normalizedMaxTokens = normalizeMaxTokens(provider, data.maxTokens ?? undefined) ?? null;
  const {
    requestProtocol,
    structuredResponseFormat,
  } = normalizeRoutePreferences({
    requestProtocol: data.requestProtocol,
    structuredResponseFormat: data.structuredResponseFormat,
  });
  await prisma.modelRouteConfig.upsert({
    where: { taskType: normalizedTaskType },
    create: {
      taskType: normalizedTaskType,
      provider,
      model: data.model,
      temperature: data.temperature ?? 0.7,
      maxTokens: normalizedMaxTokens,
      requestProtocol,
      structuredResponseFormat,
    },
    update: {
      provider,
      model: data.model,
      temperature: data.temperature ?? 0.7,
      maxTokens: normalizedMaxTokens,
      requestProtocol,
      structuredResponseFormat,
    },
  });
}
