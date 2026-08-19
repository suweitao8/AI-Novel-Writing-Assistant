import type { ApiResponse } from "@ai-novel/shared/types/api";
import type {
  VisualStyleAnalysisDraft,
  VisualStyleAnimationSubtype,
  VisualStyleDetail,
  VisualStyleFamily,
  VisualStyleSummary,
} from "@ai-novel/shared/types/visualStyle";
import { apiClient } from "./client";

export type {
  VisualStyleAnalysisDraft,
  VisualStyleAnimationSubtype,
  VisualStyleDetail,
  VisualStyleFamily,
  VisualStyleOrigin,
  VisualStylePreset,
  VisualStyleSummary,
} from "@ai-novel/shared/types/visualStyle";

export interface VisualStyleUpsertPayload {
  key: string;
  label: string;
  name?: string | null;
  styleInstructions: string;
  avoidInstructions: string;
  styleTag: string;
  styleFamily: VisualStyleFamily;
  animationSubtype?: VisualStyleAnimationSubtype | null;
}

export async function listVisualStyles(): Promise<VisualStyleSummary[]> {
  const res = await apiClient.get<ApiResponse<VisualStyleSummary[]>>("/visual-styles");
  return res.data.data ?? [];
}

export async function getVisualStyle(key: string): Promise<VisualStyleDetail | null> {
  const res = await apiClient.get<ApiResponse<VisualStyleDetail | null>>(`/visual-styles/${encodeURIComponent(key)}`);
  return res.data.data ?? null;
}

export async function createVisualStyle(payload: VisualStyleUpsertPayload): Promise<VisualStyleSummary> {
  const res = await apiClient.post<ApiResponse<VisualStyleSummary>>("/visual-styles", payload);
  return res.data.data!;
}

export async function updateVisualStyle(
  id: string,
  payload: Partial<VisualStyleUpsertPayload>,
): Promise<VisualStyleSummary> {
  const res = await apiClient.patch<ApiResponse<VisualStyleSummary>>(`/visual-styles/${id}`, payload);
  return res.data.data!;
}

export async function deleteVisualStyle(id: string): Promise<void> {
  await apiClient.delete(`/visual-styles/${id}`);
}

export async function analyzeVisualStyle(input: {
  imageBase64: string;
  mimeType: string;
  userHint?: string;
}): Promise<VisualStyleAnalysisDraft> {
  const res = await apiClient.post<ApiResponse<VisualStyleAnalysisDraft>>("/visual-styles/analyze", input);
  return res.data.data!;
}
