import type { ApiResponse } from "@ai-novel/shared/types/api";
import type {
  ComicDramaLinkStats,
  ComicDramaLinksResponse,
  ComicDramaStudioOverview,
} from "@ai-novel/shared/types/comicDrama";
import { apiClient } from "./client";

export type { ComicDramaLinkStats, ComicDramaStudioOverview };

export async function getComicDramaLinks(novelIds: string[]) {
  const uniqueIds = Array.from(new Set(novelIds.filter((id) => id.trim().length > 0))).slice(0, 50);
  if (uniqueIds.length === 0) {
    const data: ComicDramaLinksResponse = { links: {} };
    return { success: true, data, message: "" } satisfies ApiResponse<ComicDramaLinksResponse>;
  }
  const { data } = await apiClient.get<ApiResponse<ComicDramaLinksResponse>>("/drama/studio/links", {
    params: { novelIds: uniqueIds.join(",") },
  });
  return data;
}

export async function getComicDramaStudioOverview(novelId: string) {
  const { data } = await apiClient.get<ApiResponse<ComicDramaStudioOverview>>(
    `/drama/studio/${encodeURIComponent(novelId)}/overview`,
  );
  return data;
}

// 删除漫剧项目：服务端会同时清理小说本体与分镜、配音、视频等漫剧数据。
export async function deleteComicDramaByNovel(novelId: string) {
  const { data } = await apiClient.delete<ApiResponse<null>>(
    `/drama/projects/by-novel/${encodeURIComponent(novelId)}`,
  );
  return data;
}
