import type { ApiResponse } from "@ai-novel/shared/types/api";
import type {
  NovelChapterOutlineItem,
  NovelOutlineExpandDraft,
  NovelOutlineState,
} from "@ai-novel/shared/types/novelOutline";
import { apiClient } from "../client";

export type { NovelChapterOutlineItem, NovelOutlineExpandDraft, NovelOutlineState };

export async function getNovelOutlineState(novelId: string) {
  const { data } = await apiClient.get<ApiResponse<NovelOutlineState>>(
    `/novels/${encodeURIComponent(novelId)}/outline`,
  );
  return data;
}

export async function saveNovelOutline(novelId: string, outline: string) {
  const { data } = await apiClient.put<ApiResponse<NovelOutlineState>>(
    `/novels/${encodeURIComponent(novelId)}/outline`,
    { outline },
  );
  return data;
}

export async function expandNovelOutline(novelId: string, options?: { targetChapterCount?: number }) {
  const { data } = await apiClient.post<ApiResponse<NovelOutlineExpandDraft>>(
    `/novels/${encodeURIComponent(novelId)}/outline/expand`,
    { targetChapterCount: options?.targetChapterCount },
  );
  return data;
}

export type SaveChapterOutlineInput = {
  premise: string;
  chapters: Array<{
    title: string;
    synopsis: string;
    keyEvents: string[];
    characterNames: string[];
    sceneNames: string[];
  }>;
};

export async function saveNovelChapterOutline(novelId: string, input: SaveChapterOutlineInput) {
  const { data } = await apiClient.put<ApiResponse<NovelOutlineState>>(
    `/novels/${encodeURIComponent(novelId)}/outline/chapters`,
    input,
  );
  return data;
}
