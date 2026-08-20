import type { ApiResponse } from "@ai-novel/shared/types/api";
import type { AgentRun, AgentRunDetail } from "@ai-novel/shared/types/agent";
import { apiClient } from "../client";

export async function getAgentRunDetail(id: string) {
  const { data } = await apiClient.get<ApiResponse<AgentRunDetail>>(`/agent-runs/${id}`);
  return data;
}

export async function replayAgentRunFromStep(
  runId: string,
  payload: {
    fromStepId: string;
    mode?: "continue" | "dry_run";
    note?: string;
  },
) {
  const { data } = await apiClient.post<ApiResponse<{
    run: AgentRun;
    steps: AgentRunDetail["steps"];
    approvals: AgentRunDetail["approvals"];
    assistantOutput: string;
  }>>(`/agent-runs/${runId}/replay`, payload);
  return data;
}
