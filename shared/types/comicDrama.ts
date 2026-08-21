// 漫剧工作流共享类型：漫剧项目（productionKind=comic_drama 的小说）与 drama 分镜管线的阶段投影。
// 漫剧 = 写小说（空白小说流程）→ 影视分镜 → 配音 → 视频，studio 投影把两个 bounded context 的
// 进度合并成一份阶段视图，前端只消费这一层，不直接拼装 Novel 与 DramaProject。

export type ComicDramaStageKey = "novel" | "storyboard" | "voice" | "video";

export interface ComicDramaLinkStats {
  projectId: string;
  projectTitle: string;
  status: string;
  visualStyle: string | null;
  updatedAt: string;
  episodeCount: number;
  scriptedEpisodeCount: number;
  storyboardCount: number;
  shotCount: number;
  keyframeReadyCount: number;
  audioReadyCount: number;
  videoPromptCount: number;
  videoReadyCount: number;
}

export interface ComicDramaLinksResponse {
  links: Record<string, ComicDramaLinkStats | null>;
}

export interface ComicDramaNovelSummary {
  id: string;
  title: string;
  description: string | null;
  productionKind: string;
  narrativeForm: string;
  createdAt: string;
  updatedAt: string;
  chapterCount: number;
  referenceDocument: {
    id: string;
    title: string;
    fileName: string | null;
    charCount: number;
  } | null;
  directorTask: {
    id: string;
    status: string;
    checkpointSummary: string | null;
    currentItemLabel: string | null;
    progress: number;
  } | null;
}

export interface ComicDramaStudioOverview {
  novel: ComicDramaNovelSummary;
  drama: ComicDramaLinkStats | null;
  videoProviders: Array<{ id: string; label: string; kind: string; isDefault: boolean }>;
}
