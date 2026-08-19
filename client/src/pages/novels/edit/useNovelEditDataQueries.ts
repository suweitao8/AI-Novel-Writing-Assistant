import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getBaseCharacterList } from "@/api/characters/character";
import { flattenGenreTreeOptions, getGenreTree } from "@/api/story/genre";
import { getActiveAutoDirectorTask } from "@/api/novel/novelWorkflow";
import { getDirectorBookAutomationProjection } from "@/api/novel/novelDirector";
import {
  getChapterAuditReports,
  getChapterPlan,
  getChapterResourceContext,
  getChapterStateSnapshot,
  getChapterTimeline,
  getLatestStateSnapshot,
  getNovelCharacterResources,
  getNovelPayoffLedger,
  getNovelPipelineJob,
  getNovelQualityReport,
  getNovelVolumeWorkspace,
} from "@/api/novel";
import { flattenStoryModeTreeOptions, getStoryModeTree } from "@/api/story/storyMode";
import { getWorldList } from "@/api/world";
import { queryKeys } from "@/api/queryKeys";

interface NovelEditDataQueriesInput {
  id: string;
  selectedChapterId: string;
  currentJobId: string;
  payoffLedgerChapterOrder?: number;
  shouldLoadQualityReport: boolean;
  shouldLoadVolumeWorkspace: boolean;
  shouldLoadLatestState: boolean;
  shouldLoadPayoffLedger: boolean;
  shouldLoadCharacterResources: boolean;
  shouldLoadChapterContext: boolean;
  shouldLoadChapterTimeline: boolean;
}

export function useNovelEditDataQueries(input: NovelEditDataQueriesInput) {
  const {
    id,
    selectedChapterId,
    currentJobId,
    payoffLedgerChapterOrder,
    shouldLoadQualityReport,
    shouldLoadVolumeWorkspace,
    shouldLoadLatestState,
    shouldLoadPayoffLedger,
    shouldLoadCharacterResources,
    shouldLoadChapterContext,
    shouldLoadChapterTimeline,
  } = input;

  const qualityReportQuery = useQuery({
    queryKey: queryKeys.novels.qualityReport(id),
    queryFn: () => getNovelQualityReport(id),
    enabled: Boolean(id && shouldLoadQualityReport),
  });
  const volumeWorkspaceQuery = useQuery({
    queryKey: queryKeys.novels.volumeWorkspace(id),
    queryFn: () => getNovelVolumeWorkspace(id),
    enabled: Boolean(id && shouldLoadVolumeWorkspace),
  });
  const latestStateSnapshotQuery = useQuery({
    queryKey: queryKeys.novels.latestStateSnapshot(id),
    queryFn: () => getLatestStateSnapshot(id),
    enabled: Boolean(id && shouldLoadLatestState),
  });
  const chapterStateSnapshotQuery = useQuery({
    queryKey: queryKeys.novels.chapterStateSnapshot(id, selectedChapterId || "none"),
    queryFn: () => getChapterStateSnapshot(id, selectedChapterId),
    enabled: Boolean(id && selectedChapterId),
  });
  const payoffLedgerQuery = useQuery({
    queryKey: queryKeys.novels.payoffLedger(id, payoffLedgerChapterOrder),
    queryFn: () => getNovelPayoffLedger(id, payoffLedgerChapterOrder),
    enabled: Boolean(id && shouldLoadPayoffLedger),
  });
  const characterResourcesQuery = useQuery({
    queryKey: queryKeys.novels.characterResources(id),
    queryFn: () => getNovelCharacterResources(id),
    enabled: Boolean(id && shouldLoadCharacterResources),
  });
  const chapterResourceContextQuery = useQuery({
    queryKey: queryKeys.novels.characterResourceContext(id, selectedChapterId || "none"),
    queryFn: () => getChapterResourceContext(id, selectedChapterId),
    enabled: Boolean(id && shouldLoadChapterContext),
  });
  const chapterTimelineQuery = useQuery({
    queryKey: queryKeys.novels.chapterTimeline(id, selectedChapterId || "none"),
    queryFn: () => getChapterTimeline(id, selectedChapterId),
    enabled: Boolean(id && shouldLoadChapterTimeline),
  });
  const activeAutoDirectorTaskQuery = useQuery({
    queryKey: queryKeys.novels.autoDirectorTask(id),
    queryFn: () => getActiveAutoDirectorTask(id),
    enabled: Boolean(id),
    refetchInterval: (query) => {
      const task = query.state.data?.data;
      return task && (task.status === "queued" || task.status === "running" || task.status === "waiting_approval")
        ? 4000
        : false;
    },
  });
  const bookAutomationQuery = useQuery({
    queryKey: queryKeys.novels.directorBookAutomation(id),
    queryFn: () => getDirectorBookAutomationProjection(id),
    enabled: Boolean(id),
    retry: false,
    refetchInterval: (query) => {
      const status = query.state.data?.data?.projection.status;
      return status === "queued" || status === "running" || status === "waiting_approval" ? 4000 : false;
    },
  });
  const chapterPlanQuery = useQuery({
    queryKey: queryKeys.novels.chapterPlan(id, selectedChapterId || "none"),
    queryFn: () => getChapterPlan(id, selectedChapterId),
    enabled: Boolean(id && shouldLoadChapterContext),
  });
  const chapterAuditReportsQuery = useQuery({
    queryKey: queryKeys.novels.chapterAuditReports(id, selectedChapterId || "none"),
    queryFn: () => getChapterAuditReports(id, selectedChapterId),
    enabled: Boolean(id && shouldLoadChapterContext),
  });
  const baseCharacterListQuery = useQuery({
    queryKey: queryKeys.baseCharacters.all,
    queryFn: () => getBaseCharacterList(),
  });
  const worldListQuery = useQuery({
    queryKey: queryKeys.worlds.all,
    queryFn: getWorldList,
  });
  const genreTreeQuery = useQuery({
    queryKey: queryKeys.genres.all,
    queryFn: getGenreTree,
  });
  const storyModeTreeQuery = useQuery({
    queryKey: queryKeys.storyModes.all,
    queryFn: getStoryModeTree,
  });
  const genreOptions = useMemo(() => flattenGenreTreeOptions(genreTreeQuery.data?.data ?? []), [genreTreeQuery.data?.data]);
  const storyModeOptions = useMemo(
    () => flattenStoryModeTreeOptions(storyModeTreeQuery.data?.data ?? []),
    [storyModeTreeQuery.data?.data],
  );

  return {
    qualityReportQuery,
    volumeWorkspaceQuery,
    latestStateSnapshotQuery,
    chapterStateSnapshotQuery,
    payoffLedgerQuery,
    characterResourcesQuery,
    chapterResourceContextQuery,
    chapterTimelineQuery,
    activeAutoDirectorTaskQuery,
    bookAutomationQuery,
    chapterPlanQuery,
    chapterAuditReportsQuery,
    baseCharacterListQuery,
    worldListQuery,
    genreOptions,
    storyModeOptions,
  };
}
