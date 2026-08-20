import type { ApiResponse } from "@ai-novel/shared/types/api";
import type {
  ChapterDetailOutlineBeat,
  ChapterDetailOutlineDocument,
  ChapterDetailOutlinePayload,
} from "@ai-novel/shared/types/novelChapterDetailOutline";
import type { ChapterReferenceDraftPayload } from "@ai-novel/shared/types/novelChapterReferenceDraft";
import type { ReferenceExtractionPayload } from "@ai-novel/shared/types/novelReferenceExtraction";
import type {
  TimelineCheckReport,
  TimelineContextForChapter,
} from "@ai-novel/shared/types/timeline";
import type {
  ChapterEditorAiRevisionRequest,
  ChapterEditorAiRevisionResponse,
  Chapter,
  ChapterEditorWorkspaceResponse,
  ChapterEditorRewritePreviewRequest,
  ChapterEditorRewritePreviewResponse,
  ChapterStatus,
} from "@ai-novel/shared/types/novel";
import { apiClient } from "../client";

export async function getNovelChapters(id: string) {
  const { data } = await apiClient.get<ApiResponse<Chapter[]>>(`/novels/${id}/chapters`);
  return data;
}

export async function createNovelChapter(
  id: string,
  payload: {
    title: string;
    order: number;
    content?: string;
    expectation?: string;
    chapterStatus?: ChapterStatus;
    targetWordCount?: number;
    conflictLevel?: number;
    revealLevel?: number;
    mustAvoid?: string;
    taskSheet?: string;
    sceneCards?: string;
    repairHistory?: string;
    qualityScore?: number;
    continuityScore?: number;
    characterScore?: number;
    pacingScore?: number;
    riskFlags?: string;
  },
) {
  const { data } = await apiClient.post<ApiResponse<Chapter>>(`/novels/${id}/chapters`, payload);
  return data;
}

export async function updateNovelChapter(
  id: string,
  chapterId: string,
  payload: Partial<{
    title: string;
    order: number;
    content: string;
    expectation: string;
    referenceText: string;
    referenceExtractionJson: string | null;
    chapterStatus: ChapterStatus;
    targetWordCount: number;
    conflictLevel: number;
    revealLevel: number;
    mustAvoid: string;
    taskSheet: string;
    sceneCards: string;
    repairHistory: string;
    qualityScore: number;
    continuityScore: number;
    characterScore: number;
    pacingScore: number;
    riskFlags: string;
  }>,
) {
  const { data } = await apiClient.put<ApiResponse<Chapter>>(`/novels/${id}/chapters/${chapterId}`, payload);
  return data;
}

export async function deleteNovelChapter(id: string, chapterId: string) {
  const { data } = await apiClient.delete<ApiResponse<null>>(`/novels/${id}/chapters/${chapterId}`);
  return data;
}

export async function getChapterTraces(novelId: string, chapterId: string) {
  const { data } = await apiClient.get<ApiResponse<import("@ai-novel/shared/types/agent").AgentRun[]>>(
    `/novels/${novelId}/chapters/${chapterId}/traces`,
  );
  return data;
}

export async function getChapterTimeline(novelId: string, chapterId: string) {
  const { data } = await apiClient.get<ApiResponse<{
    context: TimelineContextForChapter;
    latestReport: TimelineCheckReport | null;
  }>>(`/novels/${novelId}/chapters/${chapterId}/timeline`);
  return data;
}

export async function previewChapterRewrite(
  novelId: string,
  chapterId: string,
  payload: ChapterEditorRewritePreviewRequest,
) {
  const { data } = await apiClient.post<ApiResponse<ChapterEditorRewritePreviewResponse>>(
    `/novels/${novelId}/chapters/${chapterId}/editor/rewrite-preview`,
    payload,
  );
  return data;
}

export async function getChapterEditorWorkspace(novelId: string, chapterId: string) {
  const { data } = await apiClient.get<ApiResponse<ChapterEditorWorkspaceResponse>>(
    `/novels/${novelId}/chapters/${chapterId}/editor/workspace`,
  );
  return data;
}

export async function previewChapterAiRevision(
  novelId: string,
  chapterId: string,
  payload: ChapterEditorAiRevisionRequest,
) {
  const { data } = await apiClient.post<ApiResponse<ChapterEditorAiRevisionResponse>>(
    `/novels/${novelId}/chapters/${chapterId}/editor/ai-revision-preview`,
    payload,
  );
  return data;
}

export async function generateChapterExecutionContract(
  novelId: string,
  chapterId: string,
  payload: Partial<{
    provider: import("@ai-novel/shared/types/llm").LLMProvider;
    model: string;
    temperature: number;
  }> = {},
) {
  const { data } = await apiClient.post<ApiResponse<Chapter>>(
    `/novels/${novelId}/chapters/${chapterId}/execution-contract`,
    payload,
  );
  return data;
}

// AI 从本章参考文本提取角色/场景/道具/世界观建议（纯预览；结果由前端随章节持久化，勾选后创建）
export async function previewChapterReferenceExtract(
  novelId: string,
  chapterId: string,
  referenceText: string,
) {
  const { data } = await apiClient.post<ApiResponse<ReferenceExtractionPayload>>(
    `/novels/${novelId}/chapters/${chapterId}/reference-extract/preview`,
    { referenceText },
  );
  return data;
}

// AI 压缩参考小说原文为本章初稿草稿（不落库，前端确认后写入初稿）
export async function previewChapterReferenceDraft(
  novelId: string,
  chapterId: string,
  referenceText: string,
) {
  const { data } = await apiClient.post<ApiResponse<ChapterReferenceDraftPayload>>(
    `/novels/${novelId}/chapters/${chapterId}/reference-draft/preview`,
    { referenceText },
  );
  return data;
}

// AI 推理单章细纲草稿（不落库，前端预览编辑后另行保存）
export async function previewChapterDetailOutline(novelId: string, chapterId: string) {
  const { data } = await apiClient.post<ApiResponse<{ beats: ChapterDetailOutlineBeat[]; notes: string | null }>>(
    `/novels/${novelId}/chapters/${chapterId}/detail-outline/preview`,
  );
  return data;
}

export async function saveChapterDetailOutline(
  novelId: string,
  chapterId: string,
  payload: ChapterDetailOutlinePayload,
) {
  const { data } = await apiClient.put<ApiResponse<ChapterDetailOutlineDocument>>(
    `/novels/${novelId}/chapters/${chapterId}/detail-outline`,
    payload,
  );
  return data;
}
