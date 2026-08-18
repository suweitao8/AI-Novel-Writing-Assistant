import type { NovelAutoDirectorTaskSummary } from "@ai-novel/shared/types/novel";
import type { NovelListResponse } from "@/api/novel/shared";
import { canEnterChapterExecution } from "@/lib/novelWorkflowTaskUi";
import { featureFlags } from "@/config/featureFlags";

export type NovelListItem = NovelListResponse["items"][number];
export type NovelListTone = "neutral" | "info" | "success" | "warning" | "danger";

export const DIRECTOR_CREATE_LINK = "/novels/auto-director";
export const SHORT_STORY_CREATE_LINK = featureFlags.creationStudioEnabled
  ? "/create?form=short_story"
  : null;
export const PRIMARY_CREATE_LABEL = "AI 自动导演开书";
export const MANUAL_CREATE_LINK = "/novels/create";
export const NOVEL_LIST_PAGE_SIZE = 24;

export interface NovelListSummaryItem {
  id: string;
  label: string;
  value: number;
  tone: NovelListTone;
}

export function getNovelWorkflowTask(novel: NovelListItem): NovelAutoDirectorTaskSummary | null {
  return novel.narrativeForm === "short_story"
    ? novel.latestCreationStudioTask ?? null
    : novel.latestAutoDirectorTask ?? null;
}

export function getNovelWorkspaceHref(novel: NovelListItem): string {
  if (novel.narrativeForm === "short_story") {
    return `/novels/${novel.id}/story`;
  }
  if (novel.creationExperience === "simple") {
    return `/novels/${novel.id}/simple`;
  }
  const task = novel.latestAutoDirectorTask;
  return task?.id
    ? `/novels/${novel.id}/edit?directorTaskId=${encodeURIComponent(task.id)}`
    : `/novels/${novel.id}/edit`;
}

export function formatTokenCount(value?: number | null): string {
  const normalized = typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.round(value))
    : 0;
  return new Intl.NumberFormat("zh-CN").format(normalized);
}

export function buildNovelListSummary(novels: NovelListItem[]): NovelListSummaryItem[] {
  const running = novels.filter((novel) => {
    const task = getNovelWorkflowTask(novel);
    return task?.status === "queued" || task?.status === "running";
  }).length;
  const waiting = novels.filter((novel) => getNovelWorkflowTask(novel)?.status === "waiting_approval").length;
  const ready = novels.filter((novel) => (
    novel.narrativeForm === "short_story"
      ? getNovelWorkflowTask(novel)?.status === "succeeded"
      : canEnterChapterExecution(getNovelWorkflowTask(novel))
  )).length;
  const issue = novels.filter((novel) => {
    const status = getNovelWorkflowTask(novel)?.status;
    return status === "failed" || status === "cancelled";
  }).length;

  return [
    { id: "running", label: "推进中", value: running, tone: running > 0 ? "info" : "neutral" },
    { id: "waiting", label: "待确认", value: waiting, tone: waiting > 0 ? "warning" : "neutral" },
    { id: "ready", label: "可继续", value: ready, tone: ready > 0 ? "success" : "neutral" },
    { id: "issue", label: "暂停/失败", value: issue, tone: issue > 0 ? "danger" : "neutral" },
  ];
}
