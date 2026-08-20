import type { ApiResponse } from "@ai-novel/shared/types/api";
import type {
  ChapterDetailOutlineBeat,
  ChapterDetailOutlineDocument,
  ChapterDetailOutlinePayload,
} from "@ai-novel/shared/types/novelChapterDetailOutline";
import type { ChapterReferenceParsePayload } from "@ai-novel/shared/types/novelChapterReferenceParse";
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

export async function getChapterTimeline(novelId: string, chapterId: string) {
  const { data } = await apiClient.get<ApiResponse<{
    context: TimelineContextForChapter;
    latestReport: TimelineCheckReport | null;
  }>>(`/novels/${novelId}/chapters/${chapterId}/timeline`);
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

// 参考文本「解析」：一次调用同时产出分镜初稿与设定提取建议（纯预览，落库由解析流程完成）
export async function previewChapterReferenceParse(
  novelId: string,
  chapterId: string,
  referenceText: string,
) {
  const { data } = await apiClient.post<ApiResponse<ChapterReferenceParsePayload>>(
    `/novels/${novelId}/chapters/${chapterId}/reference-parse/preview`,
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
