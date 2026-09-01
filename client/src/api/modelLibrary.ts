import type { ApiResponse } from "@ai-novel/shared/types/api";
import { apiClient } from "./client";
import {
  parseModelLibraryVisibilityResponse,
  type ModelLibraryVisibility,
  type ModelLibraryVisibilityChange,
} from "./modelLibraryVisibility";

export { parseModelLibraryVisibilityResponse } from "./modelLibraryVisibility";
export type { ModelLibraryVisibility, ModelLibraryVisibilityChange } from "./modelLibraryVisibility";

export async function getModelLibraryVisibility(): Promise<ApiResponse<ModelLibraryVisibility>> {
  const { data } = await apiClient.get<ApiResponse<unknown>>("/model-library/visibility");
  return parseModelLibraryVisibilityResponse(data);
}

export async function hideModelLibraryEntry(modelId: string): Promise<ApiResponse<ModelLibraryVisibilityChange>> {
  const { data } = await apiClient.post<ApiResponse<ModelLibraryVisibilityChange>>(
    `/model-library/${encodeURIComponent(modelId)}/hide`,
  );
  return data;
}

export async function restoreModelLibraryEntry(modelId: string): Promise<ApiResponse<ModelLibraryVisibilityChange>> {
  const { data } = await apiClient.delete<ApiResponse<ModelLibraryVisibilityChange>>(
    `/model-library/${encodeURIComponent(modelId)}/hide`,
  );
  return data;
}
