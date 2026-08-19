// 漫剧 studio 投影服务：把「小说（productionKind=comic_drama）+ 自动导演任务 + DramaProject 分镜管线」
// 合并成一份阶段视图。漫剧是编排层，不改动 drama 既有管线与导演链。
// 阶段：novel（写小说）→ storyboard（影视分镜）→ voice（配音）→ video（视频）。
import { prisma } from "../../../db/prisma";
import { AppError } from "../../../middleware/errorHandler";
import { getArchivedTaskIdSet } from "../../task/taskArchive";
import { videoProviderRegistry } from "../video/VideoProviderPort";
import type {
  ComicDramaLinkStats,
  ComicDramaLinksResponse,
  ComicDramaNovelSummary,
  ComicDramaStudioOverview,
} from "@ai-novel/shared/types/comicDrama";

const SCRIPTED_EPISODE_STATUSES = new Set(["scripted", "reviewed", "approved"]);

async function loadLatestDirectorTasksByNovelIds(novelIds: string[]): Promise<Map<string, {
  id: string;
  status: string;
  checkpointSummary: string | null;
  currentItemLabel: string | null;
  progress: number;
}>> {
  const uniqueNovelIds = Array.from(new Set(novelIds.filter((id) => id.trim().length > 0)));
  const result = new Map<string, {
    id: string;
    status: string;
    checkpointSummary: string | null;
    currentItemLabel: string | null;
    progress: number;
  }>();
  if (uniqueNovelIds.length === 0) {
    return result;
  }
  const rows = await prisma.novelWorkflowTask.findMany({
    where: { lane: "auto_director", novelId: { in: uniqueNovelIds } },
    select: {
      id: true,
      novelId: true,
      status: true,
      progress: true,
      currentItemLabel: true,
      checkpointSummary: true,
    },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
  });
  if (rows.length === 0) {
    return result;
  }
  const archivedTaskIds = await getArchivedTaskIdSet("novel_workflow", rows.map((row) => row.id));
  const seenNovelIds = new Set<string>();
  for (const row of rows) {
    if (!row.novelId || archivedTaskIds.has(row.id) || seenNovelIds.has(row.novelId)) {
      continue;
    }
    seenNovelIds.add(row.novelId);
    result.set(row.novelId, {
      id: row.id,
      status: row.status,
      checkpointSummary: row.checkpointSummary,
      currentItemLabel: row.currentItemLabel,
      progress: Math.round((row.progress ?? 0) * 100),
    });
  }
  return result;
}

async function loadDramaStatsByNovelIds(novelIds: string[]): Promise<Map<string, ComicDramaLinkStats>> {
  const uniqueNovelIds = Array.from(new Set(novelIds.filter((id) => id.trim().length > 0)));
  const result = new Map<string, ComicDramaLinkStats>();
  if (uniqueNovelIds.length === 0) {
    return result;
  }
  const projects = await prisma.dramaProject.findMany({
    where: { source: "novel_import", sourceRef: { in: uniqueNovelIds } },
    select: { id: true, title: true, sourceRef: true, status: true, visualStyle: true, updatedAt: true },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
  });
  const seenNovelIds = new Set<string>();
  const latestProjects = projects.filter((project) => {
    const novelId = project.sourceRef ?? "";
    if (!novelId || seenNovelIds.has(novelId)) {
      return false;
    }
    seenNovelIds.add(novelId);
    return true;
  });
  await Promise.all(latestProjects.map(async (project) => {
    const [episodeAggregate, scriptedEpisodeAggregate, storyboardAggregate] = await Promise.all([
      prisma.dramaEpisode.aggregate({ where: { projectId: project.id }, _count: { _all: true } }),
      prisma.dramaEpisode.aggregate({
        where: { projectId: project.id, status: { in: [...SCRIPTED_EPISODE_STATUSES] } },
        _count: { _all: true },
      }),
      prisma.dramaStoryboard.findMany({
        where: { projectId: project.id },
        select: {
          id: true,
          shots: {
            select: {
              keyframeData: true,
              dialogueAudioData: true,
            },
          },
        },
      }),
    ]);
    const shots = storyboardAggregate.flatMap((storyboard) => storyboard.shots);
    const [videoPromptAggregate, videoReadyAggregate] = await Promise.all([
      prisma.dramaVideoPrompt.count({ where: { projectId: project.id } }),
      prisma.dramaVideoPrompt.count({ where: { projectId: project.id, resultUrl: { not: null } } }),
    ]);
    result.set(project.sourceRef ?? "", {
      projectId: project.id,
      projectTitle: project.title,
      status: project.status,
      visualStyle: project.visualStyle ?? null,
      updatedAt: project.updatedAt.toISOString(),
      episodeCount: episodeAggregate._count._all,
      scriptedEpisodeCount: scriptedEpisodeAggregate._count._all,
      storyboardCount: storyboardAggregate.length,
      shotCount: shots.length,
      keyframeReadyCount: shots.filter((shot) => Boolean(shot.keyframeData?.trim())).length,
      audioReadyCount: shots.filter((shot) => Boolean(shot.dialogueAudioData?.trim())).length,
      videoPromptCount: videoPromptAggregate,
      videoReadyCount: videoReadyAggregate,
    });
  }));
  return result;
}

function toVideoProviders() {
  return videoProviderRegistry.listProviders().map((provider) => ({
    id: provider.provider,
    label: provider.label,
    kind: provider.provider,
  }));
}

// 参考小说投影：仅摘要信息（标题/文件名/字数），内容留在知识库文档里按需读取。
async function loadReferenceDocumentByNovelId(novelId: string): Promise<ComicDramaNovelSummary["referenceDocument"]> {
  const novel = await prisma.novel.findUnique({
    where: { id: novelId },
    select: {
      referenceKnowledgeDocumentId: true,
      referenceKnowledgeDocument: {
        select: {
          id: true,
          title: true,
          fileName: true,
          activeVersion: { select: { charCount: true } },
        },
      },
    },
  });
  const document = novel?.referenceKnowledgeDocument;
  if (!document) {
    return null;
  }
  return {
    id: document.id,
    title: document.title,
    fileName: document.fileName,
    charCount: document.activeVersion?.charCount ?? 0,
  };
}

export class ComicDramaStudioService {
  async getLinks(novelIds: string[]): Promise<ComicDramaLinksResponse> {
    const stats = await loadDramaStatsByNovelIds(novelIds);
    const links: Record<string, ComicDramaLinkStats | null> = {};
    for (const novelId of novelIds) {
      links[novelId] = stats.get(novelId) ?? null;
    }
    return { links };
  }

  async getOverview(novelId: string): Promise<ComicDramaStudioOverview> {
    const [novel, chapterAggregate] = await Promise.all([
      prisma.novel.findUnique({
        where: { id: novelId },
        select: {
          id: true,
          title: true,
          description: true,
          productionKind: true,
          narrativeForm: true,
          createdAt: true,
          updatedAt: true,
          _count: { select: { chapters: true } },
        },
      }),
      prisma.chapter.count({
        where: { novelId, AND: [{ content: { not: null } }, { content: { not: "" } }] },
      }),
    ]);
    if (!novel) {
      throw new AppError("没有找到这个漫剧项目。", 404);
    }
    const [directorTaskMap, dramaStats, referenceDocument] = await Promise.all([
      loadLatestDirectorTasksByNovelIds([novelId]),
      loadDramaStatsByNovelIds([novelId]),
      loadReferenceDocumentByNovelId(novelId),
    ]);
    const novelSummary: ComicDramaNovelSummary = {
      id: novel.id,
      title: novel.title,
      description: novel.description,
      productionKind: novel.productionKind,
      narrativeForm: novel.narrativeForm,
      createdAt: novel.createdAt.toISOString(),
      updatedAt: novel.updatedAt.toISOString(),
      chapterCount: chapterAggregate,
      referenceDocument,
      directorTask: directorTaskMap.get(novelId) ?? null,
    };
    return {
      novel: novelSummary,
      drama: dramaStats.get(novelId) ?? null,
      videoProviders: toVideoProviders(),
    };
  }
}

export const comicDramaStudioService = new ComicDramaStudioService();
