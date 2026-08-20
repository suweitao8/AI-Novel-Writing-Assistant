import type { ApiResponse } from "@ai-novel/shared/types/api";
import type {
  ComicDramaLinkStats,
  ComicDramaLinksResponse,
  ComicDramaStudioOverview,
} from "@ai-novel/shared/types/comicDrama";
import { apiClient } from "../client";

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

// ─── 配音（漫剧工作台配音阶段） ────────────────────────────────────────────────

export type DramaAudioSegmentType = "dialogue" | "narration";
export type DramaAudioSegmentStatus = "ready" | "stale" | "missing";

export interface DramaAudioSegment {
  shotId: string;
  shotOrder: number;
  lineIndex: number;
  type: DramaAudioSegmentType;
  speaker?: string;
  text: string;
  /** 台词行的语气（「角色（语气）：台词」），配音时作为情绪提示 */
  emotion?: string;
  audioUrl?: string;
  durationSec?: number;
  status: DramaAudioSegmentStatus;
}

export interface DramaNarratorVoiceState {
  description: string;
  sampleAudioUrl?: string;
  updatedAt?: string;
}

export interface DramaCharacterVoiceDesignResult {
  characterId: string;
  prompt: string;
  sampleAudioUrl: string;
}

export async function listDramaAudioSegments(projectId: string, order: number): Promise<DramaAudioSegment[]> {
  const { data } = await apiClient.get<ApiResponse<DramaAudioSegment[]>>(
    `/drama/projects/${projectId}/episodes/${order}/audio-segments`,
  );
  return data.data ?? [];
}

export async function regenerateDramaShotAudio(
  projectId: string,
  shotId: string,
  payload: { provider?: string; force?: boolean } = {},
) {
  const { data } = await apiClient.post<ApiResponse<unknown>>(
    `/drama/projects/${projectId}/shots/${shotId}/audio`,
    payload,
  );
  return data;
}

export async function getDramaNarratorVoice(projectId: string): Promise<DramaNarratorVoiceState> {
  const { data } = await apiClient.get<ApiResponse<DramaNarratorVoiceState>>(
    `/drama/projects/${projectId}/narrator-voice`,
  );
  return data.data ?? { description: "" };
}

export async function updateDramaNarratorVoice(projectId: string, description: string): Promise<DramaNarratorVoiceState> {
  const { data } = await apiClient.patch<ApiResponse<DramaNarratorVoiceState>>(
    `/drama/projects/${projectId}/narrator-voice`,
    { description },
  );
  return data.data!;
}

export async function designDramaNarratorVoice(projectId: string, description: string): Promise<DramaNarratorVoiceState> {
  const { data } = await apiClient.post<ApiResponse<DramaNarratorVoiceState>>(
    `/drama/projects/${projectId}/narrator-voice/design`,
    { description },
  );
  return data.data!;
}

export async function designDramaCharacterVoice(
  projectId: string,
  characterId: string,
  prompt: string,
): Promise<DramaCharacterVoiceDesignResult> {
  const { data } = await apiClient.post<ApiResponse<DramaCharacterVoiceDesignResult>>(
    `/drama/projects/${projectId}/characters/${characterId}/voice-design`,
    { prompt },
  );
  return data.data!;
}
