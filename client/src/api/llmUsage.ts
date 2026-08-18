import type { ApiResponse } from "@ai-novel/shared/types/api";
import { apiClient } from "./client";

export interface LlmUsageRecordView {
  id: string;
  label: string;
  promptId: string | null;
  promptVersion: string | null;
  taskType: string | null;
  stage: string | null;
  itemKey: string | null;
  provider: string;
  model: string;
  strategy: string | null;
  status: string;
  durationMs: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  repairAttempts: number;
  fallbackUsed: boolean;
  errorCategory: string | null;
  recordedAt: string;
}

export interface LlmUsageRecordsQuery {
  taskId?: string;
  novelId?: string;
  limit?: number;
}

export async function getLlmUsageRecords(params: LlmUsageRecordsQuery) {
  const searchParams = new URLSearchParams();
  if (params.taskId) {
    searchParams.set("taskId", params.taskId);
  }
  if (params.novelId) {
    searchParams.set("novelId", params.novelId);
  }
  if (params.limit) {
    searchParams.set("limit", String(params.limit));
  }
  const query = searchParams.toString();
  const { data } = await apiClient.get<ApiResponse<LlmUsageRecordView[]>>(
    `/llm/usage-records${query ? `?${query}` : ""}`,
  );
  return data;
}
