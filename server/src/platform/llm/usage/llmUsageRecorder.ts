import { prisma } from "../../../db/prisma";
import type { LlmTokenUsageSnapshot } from "../../../llm/usageTracking";
import type { PromptInvocationMeta } from "../../../prompting/core/promptTypes";
import type { TaskType } from "../../../llm/modelRouter";

export interface LlmUsageRecordInput {
  label: string;
  provider: string;
  model: string;
  // succeeded / failed
  status: "succeeded" | "failed";
  durationMs: number;
  strategy?: string | null;
  taskType?: TaskType | null;
  tokenUsage?: LlmTokenUsageSnapshot | null;
  rawChars?: number | null;
  repairAttempts?: number;
  attemptIndex?: number;
  fallbackUsed?: boolean;
  reasoningForcedOff?: boolean | null;
  errorCategory?: string | null;
  promptMeta?: PromptInvocationMeta | null;
}

function toNonEmptyText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/**
 * 结构化 LLM 调用的统一落账入口。
 *
 * 设计约束：
 * - 只做 fire-and-forget 记录，任何数据库异常都不允许影响主生成链路；
 * - 自动导演通道有自己的 DirectorLlmUsageRecord 归因表，本表是跨通道底账，
 *   两边并存是刻意的：这里的用途是回答“这次任务慢在哪一步”，不做归因结算。
 */
export function recordLlmUsage(input: LlmUsageRecordInput): void {
  const meta = input.promptMeta ?? null;
  const usage = input.tokenUsage ?? null;
  void prisma.llmUsageRecord
    .create({
      data: {
        label: input.label,
        promptId: toNonEmptyText(meta?.promptId),
        promptVersion: toNonEmptyText(meta?.promptVersion),
        taskType: toNonEmptyText(input.taskType ?? meta?.taskType ?? null),
        stage: toNonEmptyText(meta?.stage),
        itemKey: toNonEmptyText(meta?.itemKey),
        taskId: toNonEmptyText(meta?.taskId),
        novelId: toNonEmptyText(meta?.novelId),
        chapterId: toNonEmptyText(meta?.chapterId),
        entrypoint: toNonEmptyText(meta?.entrypoint),
        provider: input.provider,
        model: input.model,
        strategy: toNonEmptyText(input.strategy ?? null),
        status: input.status,
        durationMs: Math.max(0, Math.round(input.durationMs) || 0),
        promptTokens: usage?.promptTokens ?? 0,
        completionTokens: usage?.completionTokens ?? 0,
        totalTokens: usage?.totalTokens ?? 0,
        rawChars: typeof input.rawChars === "number" ? input.rawChars : null,
        repairAttempts: input.repairAttempts ?? 0,
        attemptIndex: input.attemptIndex ?? 0,
        fallbackUsed: input.fallbackUsed ?? false,
        reasoningForcedOff:
          typeof input.reasoningForcedOff === "boolean" ? input.reasoningForcedOff : null,
        errorCategory: toNonEmptyText(input.errorCategory ?? null),
      },
    })
    .catch((error) => {
      // 落账失败只留控制台痕迹，不打断生成任务。
      console.warn(
        `[llm-usage] failed to persist usage record for ${input.label}:`,
        error instanceof Error ? error.message : error,
      );
    });
}
