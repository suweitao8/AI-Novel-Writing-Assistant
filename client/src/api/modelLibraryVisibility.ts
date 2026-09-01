import type { ApiResponse } from "@ai-novel/shared/types/api";

export interface ModelLibraryVisibility {
  hiddenModelIds: string[];
}

export interface ModelLibraryVisibilityChange {
  modelId: string;
  hidden: boolean;
}

export function parseModelLibraryVisibilityResponse(
  response: ApiResponse<unknown>,
): ApiResponse<ModelLibraryVisibility> {
  if (!response.success) return response as ApiResponse<ModelLibraryVisibility>;

  const hiddenModelIds = (
    response.data && typeof response.data === "object"
      ? (response.data as { hiddenModelIds?: unknown }).hiddenModelIds
      : undefined
  );
  if (!Array.isArray(hiddenModelIds) || hiddenModelIds.some((modelId) => typeof modelId !== "string")) {
    throw new Error("模型库可见性响应格式无效。");
  }

  return {
    ...response,
    data: { hiddenModelIds },
  };
}
