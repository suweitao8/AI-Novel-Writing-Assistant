import type { ApiResponse } from "@ai-novel/shared/types/api";
import type { FirstNovelOnboardingProjection } from "@ai-novel/shared/types/onboarding";
import { apiClient } from "./client";

export async function getFirstNovelOnboarding() {
  const { data } = await apiClient.get<ApiResponse<FirstNovelOnboardingProjection>>("/onboarding/first-novel");
  return data;
}
