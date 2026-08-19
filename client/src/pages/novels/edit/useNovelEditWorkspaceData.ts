import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { DirectorSessionState } from "@ai-novel/shared/types/novelDirector";
import type { Chapter, Character } from "@ai-novel/shared/types/novel";
import {
  getChapterAuditReports,
  getChapterPlan,
  getChapterResourceContext,
  getChapterStateSnapshot,
  getChapterTimeline,
  getLatestStateSnapshot,
  getNovelCharacterResources,
  getNovelDetail,
  getNovelPayoffLedger,
  getNovelPipelineJob,
  getNovelQualityReport,
} from "@/api/novel";
import { getActiveAutoDirectorTask } from "@/api/novel/novelWorkflow";
import { getDirectorBookAutomationProjection, getDirectorTaskSnapshot } from "@/api/novel/novelDirector";
import { getAutoDirectorFollowUpDetail } from "@/api/director/autoDirectorFollowUps";
import { getTaskDetail } from "@/api/tasks";
import { queryKeys } from "@/api/queryKeys";
import { useDirectorRealtimeStore } from "@/store/directorRealtimeStore";
import { useNovelEditWorkflow } from "../hooks/useNovelEditWorkflow";
import { tabFromDirectorDisplayStage, tabFromDirectorProgress } from "../novelWorkspaceNavigation";
import {
  buildDisplayAutoDirectorTask,
  shouldAutofocusProjectedDirectorTask,
  shouldPreserveRequestedDirectorTaskId,
} from "./novelEditAutomationStatus";
import { buildWorldInjectionSummary } from "./novelEdit.utils";
import { parsePipelineBackgroundActivities, resolveActiveStructuredOutlineChapterId } from "./novelEditPage.utils";

interface QueryLike<T> {
  data?: { data?: T };
  isSuccess?: boolean;
  isFetched?: boolean;
  isFetchedAfterMount?: boolean;
}

type NovelDetailData = Awaited<ReturnType<typeof getNovelDetail>>["data"];
type QualityReportData = Awaited<ReturnType<typeof getNovelQualityReport>>["data"];
type LatestStateSnapshotData = Awaited<ReturnType<typeof getLatestStateSnapshot>>["data"];
type ChapterStateSnapshotData = Awaited<ReturnType<typeof getChapterStateSnapshot>>["data"];
type PayoffLedgerData = Awaited<ReturnType<typeof getNovelPayoffLedger>>["data"];
type CharacterResourcesData = Awaited<ReturnType<typeof getNovelCharacterResources>>["data"];
type ChapterResourceContextData = Awaited<ReturnType<typeof getChapterResourceContext>>["data"];
type ChapterTimelineData = Awaited<ReturnType<typeof getChapterTimeline>>["data"];
type ChapterPlanData = Awaited<ReturnType<typeof getChapterPlan>>["data"];
type ChapterAuditReportsData = Awaited<ReturnType<typeof getChapterAuditReports>>["data"];
type PipelineJobData = Awaited<ReturnType<typeof getNovelPipelineJob>>["data"];
type ActiveAutoDirectorTaskData = Awaited<ReturnType<typeof getActiveAutoDirectorTask>>["data"];
type BookAutomationProjectionData = NonNullable<Awaited<ReturnType<typeof getDirectorBookAutomationProjection>>["data"]>;

export interface NovelEditWorkspaceDataInput {
  id: string;
  directorTaskId: ReturnType<typeof useNovelEditWorkflow>["directorTaskId"];
  setDirectorTaskId: ReturnType<typeof useNovelEditWorkflow>["setDirectorTaskId"];
  taskPanelOpen: boolean;
  selectedChapterId: string;
  characters: Character[];
  chapters: Chapter[];
  novelDetailQuery: QueryLike<NovelDetailData>;
  qualityReportQuery: QueryLike<QualityReportData>;
  latestStateSnapshotQuery: QueryLike<LatestStateSnapshotData>;
  chapterStateSnapshotQuery: QueryLike<ChapterStateSnapshotData>;
  payoffLedgerQuery: QueryLike<PayoffLedgerData>;
  characterResourcesQuery: QueryLike<CharacterResourcesData>;
  chapterResourceContextQuery: QueryLike<ChapterResourceContextData>;
  chapterTimelineQuery: QueryLike<ChapterTimelineData>;
  chapterPlanQuery: QueryLike<ChapterPlanData>;
  chapterAuditReportsQuery: QueryLike<ChapterAuditReportsData>;
  pipelineJobQuery: QueryLike<PipelineJobData>;
  activeAutoDirectorTaskQuery: QueryLike<ActiveAutoDirectorTaskData> & { isFetchedAfterMount?: boolean };
  bookAutomationQuery: QueryLike<BookAutomationProjectionData>;
}

export function useNovelEditWorkspaceData(input: NovelEditWorkspaceDataInput) {
  const {
    id,
    directorTaskId,
    setDirectorTaskId,
    taskPanelOpen,
    selectedChapterId,
    characters,
    chapters,
    novelDetailQuery,
    qualityReportQuery,
    latestStateSnapshotQuery,
    chapterStateSnapshotQuery,
    payoffLedgerQuery,
    characterResourcesQuery,
    chapterResourceContextQuery,
    chapterTimelineQuery,
    chapterPlanQuery,
    chapterAuditReportsQuery,
    pipelineJobQuery,
    activeAutoDirectorTaskQuery,
    bookAutomationQuery,
  } = input;

  const coreCharacterCount = useMemo(
    () => characters.filter((item) => /主角|反派/.test(item.role)).length,
    [characters],
  );
  const bible = novelDetailQuery.data?.data?.bible;
  const plotBeats = novelDetailQuery.data?.data?.plotBeats ?? [];
  const maxOrder = useMemo(
    () => chapters.reduce((max, chapter) => Math.max(max, chapter.order), 1),
    [chapters],
  );
  const worldInjectionSummary = useMemo(
    () => buildWorldInjectionSummary(novelDetailQuery.data?.data?.world),
    [novelDetailQuery.data?.data?.world],
  );
  const qualitySummary = qualityReportQuery.data?.data?.summary;
  const chapterQualityReport = useMemo(() => (qualityReportQuery.data?.data?.chapterReports ?? []).find((item) => item.chapterId === selectedChapterId), [qualityReportQuery.data?.data?.chapterReports, selectedChapterId]);
  const chapterPlan = chapterPlanQuery.data?.data ?? null;
  const chapterTimeline = chapterTimelineQuery.data?.data ?? null;
  const latestStateSnapshot = latestStateSnapshotQuery.data?.data ?? null;
  const chapterStateSnapshot = chapterStateSnapshotQuery.data?.data ?? null;
  const payoffLedger = payoffLedgerQuery.data?.data ?? null;
  const characterResources = characterResourcesQuery.data?.data?.items ?? [];
  const pendingCharacterResourceProposals = characterResourcesQuery.data?.data?.pendingProposals ?? [];
  const chapterResourceContext = chapterResourceContextQuery.data?.data ?? null;
  const chapterAuditReports = chapterAuditReportsQuery.data?.data ?? [];
  const pipelineBackgroundActivities = useMemo(
    () => parsePipelineBackgroundActivities(pipelineJobQuery.data?.data?.payload ?? null),
    [pipelineJobQuery.data?.data?.payload],
  );
  const hasValidatedActiveAutoDirectorTask = activeAutoDirectorTaskQuery.isFetchedAfterMount;
  const latestAutoDirectorTask = hasValidatedActiveAutoDirectorTask
    ? activeAutoDirectorTaskQuery.data?.data ?? null
    : null;
  const activeDirectorTask = latestAutoDirectorTask?.status === "cancelled"
    ? null
    : latestAutoDirectorTask;
  const activeAutoDirectorTask = activeDirectorTask;
  const bookAutomationProjection = bookAutomationQuery.data?.data?.projection ?? null;
  const requestedDirectorTaskId = directorTaskId
    || activeAutoDirectorTask?.id
    || (shouldAutofocusProjectedDirectorTask(bookAutomationProjection) ? bookAutomationProjection?.latestTask?.id : "")
    || "";
  const requestedDirectorTaskQuery = useQuery({
    queryKey: queryKeys.tasks.detail("novel_workflow", requestedDirectorTaskId || "none"),
    queryFn: () => getTaskDetail("novel_workflow", requestedDirectorTaskId),
    enabled: Boolean(requestedDirectorTaskId),
    retry: false,
  });
  const requestedDirectorTask = requestedDirectorTaskQuery.data?.data ?? null;
  const visibleDirectorTask = useMemo(
    () => {
      const sourceTask = requestedDirectorTask ?? activeAutoDirectorTask;
      if (!directorTaskId && !taskPanelOpen && sourceTask?.status === "cancelled") {
        return null;
      }
      return buildDisplayAutoDirectorTask(sourceTask, bookAutomationProjection);
    },
    [activeAutoDirectorTask, bookAutomationProjection, directorTaskId, requestedDirectorTask, taskPanelOpen],
  );
  const displayAutoDirectorTask = visibleDirectorTask;
  const actionTargetDirectorTaskId = visibleDirectorTask?.id ?? "";
  const selectedDirectorTaskId = visibleDirectorTask?.id ?? requestedDirectorTaskId;
  useEffect(() => {
    if (!id || !activeAutoDirectorTaskQuery.isSuccess) {
      return;
    }
    const canonicalDirectorTaskId = activeAutoDirectorTask?.id ?? "";
    if (!canonicalDirectorTaskId && taskPanelOpen && directorTaskId) {
      return;
    }
    if (!canonicalDirectorTaskId && directorTaskId && !requestedDirectorTaskQuery.isFetched) {
      return;
    }
    if (!canonicalDirectorTaskId && shouldPreserveRequestedDirectorTaskId({
      directorTaskId,
      requestedTask: requestedDirectorTask,
    })) {
      return;
    }
    if (directorTaskId === canonicalDirectorTaskId) {
      return;
    }
    setDirectorTaskId(canonicalDirectorTaskId);
  }, [
    activeAutoDirectorTask?.id,
    activeAutoDirectorTaskQuery.isSuccess,
    directorTaskId,
    id,
    requestedDirectorTask,
    requestedDirectorTaskQuery.isFetched,
    setDirectorTaskId,
    taskPanelOpen,
  ]);
  useEffect(() => {
    if (!id || !activeAutoDirectorTaskQuery.isSuccess) {
      return;
    }
    useDirectorRealtimeStore.getState().setFromAutoDirectorTask(id, activeAutoDirectorTask);
  }, [id, activeAutoDirectorTask, activeAutoDirectorTaskQuery.isSuccess]);
  const activeDirectorSession = useMemo(() => {
    if (
      !activeAutoDirectorTask
      || (
        activeAutoDirectorTask.status !== "queued"
        && activeAutoDirectorTask.status !== "running"
        && activeAutoDirectorTask.status !== "waiting_approval"
      )
    ) {
      return null;
    }
    const raw = activeAutoDirectorTask?.meta.directorSession;
    if (!raw || typeof raw !== "object") {
      return null;
    }
    return raw as DirectorSessionState;
  }, [activeAutoDirectorTask]);
  const chapterPendingCharacterResourceProposals = useMemo(
    () => pendingCharacterResourceProposals.filter((proposal) => !selectedChapterId || proposal.chapterId === selectedChapterId),
    [pendingCharacterResourceProposals, selectedChapterId],
  );
  const directorTaskSnapshotQuery = useQuery({
    queryKey: queryKeys.tasks.directorTaskSnapshot(selectedDirectorTaskId || "none"),
    queryFn: () => getDirectorTaskSnapshot(selectedDirectorTaskId),
    enabled: Boolean(selectedDirectorTaskId),
    retry: false,
    refetchInterval: () => (
      displayAutoDirectorTask && (
        displayAutoDirectorTask.status === "queued"
        || displayAutoDirectorTask.status === "running"
        || displayAutoDirectorTask.status === "waiting_approval"
      )
        ? 4000
        : false
    ),
  });
  const activeDirectorSnapshot = directorTaskSnapshotQuery.data?.data?.snapshot ?? null;
  const activeStructuredOutlineChapterId = useMemo(
    () => resolveActiveStructuredOutlineChapterId(activeDirectorSnapshot),
    [activeDirectorSnapshot],
  );
  const activeDirectorRuntimeSnapshot = activeDirectorSnapshot?.runtime ?? null;
  const activeDirectorRuntimeProjection = activeDirectorSnapshot?.projection ?? null;
  const activeDirectorDashboardView = activeDirectorSnapshot?.dashboardView ?? null;
  const activeDirectorRuntimeHardBlocked = activeDirectorDashboardView?.mode === "failed"
    || activeDirectorDashboardView?.mode === "recovering"
    || (
      activeDirectorDashboardView?.mode !== "running"
      && activeDirectorRuntimeProjection?.status === "blocked"
    );
  const activeDirectorRuntimeBlockedReason = activeDirectorDashboardView?.userActionReason?.trim()
    || activeDirectorRuntimeProjection?.blockedReason?.trim()
    || activeDirectorRuntimeProjection?.detail?.trim()
    || null;
  const activeAutoDirectorFollowUpQuery = useQuery({
    queryKey: queryKeys.autoDirectorFollowUps.detail(selectedDirectorTaskId || "none"),
    queryFn: () => getAutoDirectorFollowUpDetail(selectedDirectorTaskId),
    enabled: Boolean(selectedDirectorTaskId),
    retry: false,
    refetchInterval: () => (
      displayAutoDirectorTask && (
        displayAutoDirectorTask.status === "queued"
        || displayAutoDirectorTask.status === "running"
        || displayAutoDirectorTask.status === "waiting_approval"
      )
        ? 4000
        : false
    ),
  });
  const activeAutoDirectorFollowUp = activeAutoDirectorFollowUpQuery.data?.data ?? null;
  const workflowCurrentTab = useMemo(
    () => {
      const displayStageTab = tabFromDirectorDisplayStage(activeDirectorSnapshot?.displayState.stageKey ?? null);
      if (displayStageTab) {
        return displayStageTab;
      }
      return tabFromDirectorProgress({
        currentStage: activeAutoDirectorTask?.currentStage,
        currentItemKey: activeAutoDirectorTask?.currentItemKey,
        checkpointType: activeAutoDirectorTask?.checkpointType,
        reviewScope: activeDirectorSession?.reviewScope ?? null,
        status: activeAutoDirectorTask?.status,
      });
    },
    [
      activeDirectorSnapshot?.displayState.stageKey,
      activeAutoDirectorTask?.checkpointType,
      activeAutoDirectorTask?.currentItemKey,
      activeAutoDirectorTask?.currentStage,
      activeDirectorSession?.reviewScope,
      activeAutoDirectorTask?.status,
    ],
  );

  return {
    coreCharacterCount,
    bible,
    plotBeats,
    maxOrder,
    worldInjectionSummary,
    qualitySummary,
    chapterQualityReport,
    chapterPlan,
    chapterTimeline,
    latestStateSnapshot,
    chapterStateSnapshot,
    payoffLedger,
    characterResources,
    pendingCharacterResourceProposals,
    chapterResourceContext,
    chapterAuditReports,
    pipelineBackgroundActivities,
    activeAutoDirectorTask,
    bookAutomationProjection,
    visibleDirectorTask,
    displayAutoDirectorTask,
    actionTargetDirectorTaskId,
    activeDirectorSession,
    chapterPendingCharacterResourceProposals,
    activeDirectorSnapshot,
    activeStructuredOutlineChapterId,
    activeDirectorRuntimeSnapshot,
    activeDirectorRuntimeHardBlocked,
    activeDirectorRuntimeBlockedReason,
    activeAutoDirectorFollowUp,
    workflowCurrentTab,
  };
}
