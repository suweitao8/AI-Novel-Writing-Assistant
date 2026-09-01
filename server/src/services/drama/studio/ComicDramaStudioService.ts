// 漫剧 studio 投影服务：把「小说（productionKind=comic_drama）+ 自动导演任务 + DramaProject 分镜管线」
// 合并成一份阶段视图。漫剧是编排层，不改动 drama 既有管线与导演链。
// 阶段：novel（写小说）→ storyboard（影视分镜）→ voice（配音）→ video（视频）。
import { prisma } from "../../../db/prisma";
import { AppError } from "../../../middleware/errorHandler";
import { getArchivedTaskIdSet } from "../../task/taskArchive";
import { dramaReadinessService } from "../readiness/DramaReadinessService";
import { videoProviderRegistry } from "../video/VideoProviderPort";
import {
  hasStoryAssetStateImageUrl,
  parseStoryAssetStatesJson,
} from "@ai-novel/shared/types/novelReferenceExtraction";
import type {
  ComicDramaLinkStats,
  ComicDramaLinksResponse,
  ComicDramaNovelSummary,
  ComicDramaStudioOverview,
} from "@ai-novel/shared/types/comicDrama";

const SCRIPTED_EPISODE_STATUSES = new Set(["scripted", "reviewed", "approved"]);

/** 场景状态图 URL：按状态顺序取第一张有图的（默认状态优先），再回落旧版全景 imageData。 */
function resolveNovelSceneImageUrl(scene: { statesJson: string | null; imageData: string | null }): string | null {
  const { states } = parseStoryAssetStatesJson(scene.statesJson);
  for (const state of states) {
    if (hasStoryAssetStateImageUrl(state.image)) {
      return state.image.url;
    }
  }
  if (!scene.imageData?.trim()) {
    return null;
  }
  try {
    const legacy = JSON.parse(scene.imageData) as { url?: unknown };
    return typeof legacy.url === "string" && legacy.url.trim() ? legacy.url : null;
  } catch {
    return null;
  }
}

/**
 * 漫剧卡片预览图解析：用户在设定里显式选择的场景优先（需有图），
 * 未选择时默认取排序第一个有图的场景；都没有图返回 null，卡片回落文字面板。
 */
async function loadPreviewByNovelIds(
  pairs: Array<{ novelId: string; previewSceneId: string | null }>,
): Promise<Map<string, { previewSceneId: string | null; previewImageUrl: string | null }>> {
  const result = new Map<string, { previewSceneId: string | null; previewImageUrl: string | null }>();
  const novelIds = Array.from(new Set(pairs.map((pair) => pair.novelId).filter(Boolean)));
  if (novelIds.length === 0) {
    return result;
  }
  const scenes = await prisma.novelScene.findMany({
    where: { novelId: { in: novelIds } },
    select: { id: true, novelId: true, statesJson: true, imageData: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  const scenesByNovelId = new Map<string, Array<{ id: string; url: string | null }>>();
  for (const scene of scenes) {
    const list = scenesByNovelId.get(scene.novelId) ?? [];
    list.push({ id: scene.id, url: resolveNovelSceneImageUrl(scene) });
    scenesByNovelId.set(scene.novelId, list);
  }
  for (const pair of pairs) {
    const scenesWithUrls = scenesByNovelId.get(pair.novelId) ?? [];
    const chosen = pair.previewSceneId
      ? scenesWithUrls.find((scene) => scene.id === pair.previewSceneId)
      : undefined;
    const effective = (chosen?.url ? chosen : scenesWithUrls.find((scene) => scene.url)) ?? null;
    result.set(pair.novelId, {
      previewSceneId: pair.previewSceneId ?? null,
      previewImageUrl: effective?.url ?? null,
    });
  }
  return result;
}

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
    select: { id: true, title: true, sourceRef: true, status: true, visualStyle: true, previewSceneId: true, updatedAt: true },
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
  const projectIds = latestProjects.map((project) => project.id);
  if (projectIds.length === 0) {
    return result;
  }
  const [
    [episodeGroups, storyboardGroups, videoPromptGroups, videoReadyGroups],
    readinessRows,
    previewByNovelId,
  ] = await Promise.all([
    Promise.all([
      prisma.dramaEpisode.groupBy({
        by: ["projectId", "status"],
        where: { projectId: { in: projectIds } },
        _count: { _all: true },
      }),
      prisma.dramaStoryboard.groupBy({
        by: ["projectId"],
        where: { projectId: { in: projectIds } },
        _count: { _all: true },
      }),
      prisma.dramaVideoPrompt.groupBy({
        by: ["projectId"],
        where: { projectId: { in: projectIds } },
        _count: { _all: true },
      }),
      prisma.dramaVideoPrompt.groupBy({
        by: ["projectId"],
        where: { projectId: { in: projectIds }, status: "succeeded", resultUrl: { not: null } },
        _count: { _all: true },
      }),
    ]),
    Promise.all(projectIds.map(async (projectId) => [
      projectId,
      await dramaReadinessService.getProjectReadiness(projectId),
    ] as const)),
    loadPreviewByNovelIds(latestProjects.map((project) => ({
      novelId: project.sourceRef ?? "",
      previewSceneId: project.previewSceneId ?? null,
    }))),
  ]);
  const episodeCountByProject = new Map<string, number>();
  const scriptedCountByProject = new Map<string, number>();
  for (const group of episodeGroups) {
    episodeCountByProject.set(group.projectId, (episodeCountByProject.get(group.projectId) ?? 0) + group._count._all);
    if (SCRIPTED_EPISODE_STATUSES.has(group.status)) {
      scriptedCountByProject.set(group.projectId, (scriptedCountByProject.get(group.projectId) ?? 0) + group._count._all);
    }
  }
  const storyboardCountByProject = new Map(storyboardGroups.map((group) => [group.projectId, group._count._all]));
  const videoPromptCountByProject = new Map(videoPromptGroups.map((group) => [group.projectId, group._count._all]));
  const videoReadyCountByProject = new Map(videoReadyGroups.map((group) => [group.projectId, group._count._all]));
  const readinessByProject = new Map(readinessRows);
  latestProjects.forEach((project) => {
    const readiness = readinessByProject.get(project.id);
    const preview = previewByNovelId.get(project.sourceRef ?? "");
    result.set(project.sourceRef ?? "", {
      projectId: project.id,
      projectTitle: project.title,
      status: project.status,
      visualStyle: project.visualStyle ?? null,
      updatedAt: project.updatedAt.toISOString(),
      episodeCount: episodeCountByProject.get(project.id) ?? 0,
      scriptedEpisodeCount: scriptedCountByProject.get(project.id) ?? 0,
      storyboardCount: storyboardCountByProject.get(project.id) ?? 0,
      shotCount: readiness?.shotCount ?? 0,
      keyframeReadyCount: readiness?.keyframeReadyCount ?? 0,
      audioReadyCount: readiness?.audioReadyCount ?? 0,
      videoPromptCount: videoPromptCountByProject.get(project.id) ?? 0,
      videoReadyCount: videoReadyCountByProject.get(project.id) ?? 0,
      previewSceneId: preview?.previewSceneId ?? null,
      previewImageUrl: preview?.previewImageUrl ?? null,
    });
  });
  return result;
}

function toVideoProviders() {
  return videoProviderRegistry.listProviders().map((provider) => ({
    id: provider.provider,
    label: provider.label,
    kind: provider.provider,
    isDefault: provider.isDefault,
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
