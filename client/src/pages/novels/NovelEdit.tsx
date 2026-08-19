import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BOOK_ANALYSIS_SECTIONS } from "@ai-novel/shared/types/bookAnalysis";
import type { DirectorContinuationMode, DirectorLockScope, DirectorSessionState, DirectorStepCalibrationAction } from "@ai-novel/shared/types/novelDirector";
import { extractDirectorTaskSeedPayloadFromMeta } from "@ai-novel/shared/types/novelDirector";
import type { AutoDirectorAction, AutoDirectorMutationActionCode } from "@ai-novel/shared/types/autoDirectorFollowUp";
import type { DirectorBookAutomationAction, DirectorDashboardMode, DirectorTaskSnapshot } from "@ai-novel/shared/types/directorRuntime";
import type { NovelExportDownloadFormat, NovelExportScope } from "@ai-novel/shared/types/novelExport";
import type {
  Chapter,
  PipelineRepairMode,
  PipelineRunMode,
  ReviewIssue,
  VolumeBeatSheet,
  VolumeCritiqueReport,
  VolumePlan,
  VolumeRebalanceDecision,
  VolumeStrategyPlan,
} from "@ai-novel/shared/types/novel";
import NovelEditView from "./components/NovelEditView";
import NovelProductionExperienceHandoff from "./components/NovelProductionExperienceHandoff";
import type { LLMSelectorValue } from "@/components/common/LLMSelector";
import { getBaseCharacterList } from "@/api/characters/character";
import { flattenGenreTreeOptions, getGenreTree } from "@/api/story/genre";
import { acceptManualChangesAndContinueDirector, calibrateDirectorStep, getDirectorBookAutomationProjection, getDirectorTaskSnapshot } from "@/api/novel/novelDirector";
import { continueNovelWorkflow, getActiveAutoDirectorTask } from "@/api/novel/novelWorkflow";
import { archiveTask, cancelTask, getTaskDetail, retryTask } from "@/api/tasks";
import { executeAutoDirectorFollowUpAction, getAutoDirectorFollowUpDetail } from "@/api/director/autoDirectorFollowUps";
import {
  auditNovelChapter,
  backfillNovelCharacterResources,
  confirmCharacterResourceProposal,
  extractChapterResources,
  rejectCharacterResourceProposal,
  getChapterTimeline,
  getChapterResourceContext,
  generateChapterPlan,
  getChapterAuditReports,
  getChapterPlan,
  getChapterStateSnapshot,
  getLatestStateSnapshot,
  getNovelCharacterResources,
  getNovelPayoffLedger,
  getNovelDetail,
  setNovelCreationExperience,
  downloadNovelExport,
  getNovelPipelineJob,
  getNovelVolumeWorkspace,
  getNovelQualityReport,
  replanNovel,
} from "@/api/novel";
import { flattenStoryModeTreeOptions, getStoryModeTree } from "@/api/story/storyMode";
import { getWorldList } from "@/api/world";
import { queryKeys } from "@/api/queryKeys";
import { toast } from "@/components/ui/toast";
import { useSSE } from "@/hooks/useSSE";
import { useDirectorChapterTitleRepair } from "@/hooks/useDirectorChapterTitleRepair";
import { useLLMStore } from "@/store/llmStore";
import { useDirectorRealtimeStore } from "@/store/directorRealtimeStore";
import { buildWorldInjectionSummary } from "./edit/novelEdit.utils";
import type { QuickCharacterCreatePayload } from "./components/characterPanel.utils";
import type { ChapterExecutionBackgroundActivity } from "./components/chapter/chapterExecution.shared";
import type { ChapterExecutionStrategy } from "./planning/chapterExecution.utils";
import { useNovelCharacterMutations } from "./hooks/useNovelCharacterMutations";
import { useChapterExecutionActions } from "./hooks/useChapterExecutionActions";
import { useNovelContinuationSources } from "./hooks/useNovelContinuationSources";
import { useNovelEditChapterRuntime } from "./hooks/useNovelEditChapterRuntime";
import { useNovelEditMutations } from "./hooks/useNovelEditMutations";
import { useNovelEditInitialization } from "./hooks/useNovelEditInitialization";
import { useNovelWorldSlice } from "./hooks/useNovelWorldSlice";
import { useNovelStoryMacro } from "./hooks/useNovelStoryMacro";
import { useNovelVolumePlanning } from "./hooks/volumePlanning/useNovelVolumePlanning";
import { useVolumeVersionControl } from "./hooks/useVolumeVersionControl";
import { useNovelEditWorkflow } from "./hooks/useNovelEditWorkflow";
import { buildNovelEditPlanningTabs } from "./edit/novelEditPlanningTabs";
import type { ChapterReviewResult } from "./planning/chapterPlanning.shared";
import type { NovelEditTakeoverState, NovelTaskDrawerState } from "./components/NovelEditView.types";
import NovelExistingProjectTakeoverDialog from "./components/takeover/NovelExistingProjectTakeoverDialog";
import { syncNovelWorkflowStageSilently, workflowStageFromTab } from "./novelWorkflow.client";
import { isNovelWorkspaceFlowTab, scopeFromWorkspaceTab, tabFromDirectorDisplayStage, tabFromDirectorProgress, tabFromScope, type NovelWorkspaceFlowTab } from "./novelWorkspaceNavigation";
import { resolveChapterTitleWarning } from "@/lib/directorTaskNotice";
import { resolveInternalNavigationTarget } from "@/lib/internalNavigation";
import { resolveDirectorContinueMode, resolveWorkflowContinuationFeedback } from "@/lib/novelWorkflowContinuation";
import {
  getDirectorCockpitActionHref,
  getDirectorCockpitContinuationMode,
  isDirectorCockpitContinuationAction,
} from "@/lib/directorCockpitActions";
import { canCancelDirectorTask, getCandidateSelectionLink } from "@/lib/novelWorkflowTaskUi";
import { syncAutoDirectorTaskCache } from "@/lib/taskQueryCache";
import {
  buildContinueAutoExecutionActionLabel,
  buildReplanAndContinueActionLabel,
  buildTakeoverDescription,
  buildTakeoverTitle,
  formatTakeoverCheckpoint,
  resolveAutoExecutionScopeLabel,
} from "./edit/novelEditTakeover.shared";
import {
  buildDisplayAutoDirectorTask,
  canArchiveCompletedAutoDirectorTask,
  resolveTakeoverDialogContextTaskId,
  resolveAutomationActionText,
  resolveTakeoverModeFromAutomation,
  shouldPreserveRequestedDirectorTaskId,
  shouldAutofocusProjectedDirectorTask,
} from "./edit/novelEditAutomationStatus";
import {
  createDownload,
  parsePipelineBackgroundActivities,
  resolveActiveStructuredOutlineChapterId,
} from "./edit/novelEditPage.utils";
import { useNovelDirectorTakeoverLogic } from "./edit/useNovelDirectorTakeoverLogic";
import { useNovelCharacterResourceProposals } from "./edit/useNovelCharacterResourceProposals";
import { useNovelEditWorkspaceData } from "./edit/useNovelEditWorkspaceData";
import { useStructuredOutlineWorkspaceSync } from "./edit/useStructuredOutlineWorkspaceSync";
import NovelEditStepTakeoverEntry from "./edit/NovelEditStepTakeoverEntry";
import { useNovelEditStreams } from "./edit/useNovelEditStreams";
import { useNovelEditDataQueries } from "./edit/useNovelEditDataQueries";
import {
  DEFAULT_ESTIMATED_CHAPTER_COUNT,
  createDefaultNovelBasicFormState,
  patchNovelBasicForm,
} from "./novelBasicInfo.shared";
import { useStructuredOutlineWorkspaceStore } from "./stores/useStructuredOutlineWorkspaceStore";
import {
  applyVolumeChapterBatch,
  buildVolumePlanningReadiness,
  buildOutlinePreviewFromVolumes,
  buildStructuredPreviewFromVolumes,
  buildVolumeSyncPreview,
  type ExistingOutlineChapter,
  type VolumeSyncOptions,
} from "./planning/volumePlan.utils";

export default function NovelEdit() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const llm = useLLMStore();
  const queryClient = useQueryClient();
  const {
    activeTab,
    setActiveTab,
    directorTaskId,
    setDirectorTaskId,
    selectedChapterId,
    setSelectedChapterId,
    selectedVolumeId,
    setSelectedVolumeId,
    workflowTaskId,
    taskPanelOpen,
    clearTaskPanelOpen,
  } = useNovelEditWorkflow(id);
  const [retryOverride, setRetryOverride] = useState<LLMSelectorValue>({
    provider: llm.provider,
    model: llm.model,
    temperature: llm.temperature,
  });
  const [basicForm, setBasicForm] = useState(() => createDefaultNovelBasicFormState());
  const [volumeDraft, setVolumeDraft] = useState<VolumePlan[]>([]);
  const [volumeStrategyPlan, setVolumeStrategyPlan] = useState<VolumeStrategyPlan | null>(null);
  const [volumeCritiqueReport, setVolumeCritiqueReport] = useState<VolumeCritiqueReport | null>(null);
  const [volumeBeatSheets, setVolumeBeatSheets] = useState<VolumeBeatSheet[]>([]);
  const [volumeRebalanceDecisions, setVolumeRebalanceDecisions] = useState<VolumeRebalanceDecision[]>([]);
  const [volumeGenerationMessage, setVolumeGenerationMessage] = useState("");
  const [outlineOptimizeInstruction, setOutlineOptimizeInstruction] = useState("");
  const [outlineOptimizePreview, setOutlineOptimizePreview] = useState("");
  const [outlineOptimizeMode, setOutlineOptimizeMode] = useState<"full" | "selection">("full");
  const [outlineOptimizeSourceText, setOutlineOptimizeSourceText] = useState("");
  const [structuredOptimizeInstruction, setStructuredOptimizeInstruction] = useState("");
  const [structuredOptimizePreview, setStructuredOptimizePreview] = useState("");
  const [structuredOptimizeMode, setStructuredOptimizeMode] = useState<"full" | "selection">("full");
  const [structuredOptimizeSourceText, setStructuredOptimizeSourceText] = useState("");
  const [volumeSyncOptions, setVolumeSyncOptions] = useState<VolumeSyncOptions>({
    preserveContent: true,
    applyDeletes: false,
  });
  const [currentJobId, setCurrentJobId] = useState("");
  const [pipelineForm, setPipelineForm] = useState({
    startOrder: 1,
    endOrder: DEFAULT_ESTIMATED_CHAPTER_COUNT,
    maxRetries: 1,
    runMode: "fast" as PipelineRunMode,
    autoReview: true,
    autoRepair: true,
    skipCompleted: true,
    qualityThreshold: 75,
    repairMode: "light_repair" as PipelineRepairMode,
  });
  const [reviewResult, setReviewResult] = useState<ChapterReviewResult | null>(null);
  const [pipelineMessage, setPipelineMessage] = useState("");
  const [structuredMessage, setStructuredMessage] = useState("");
  const [chapterOperationMessage, setChapterOperationMessage] = useState("");
  const [chapterStrategy, setChapterStrategy] = useState<ChapterExecutionStrategy>({ runMode: "fast", wordSize: "medium", conflictLevel: 60, pace: "balanced", aiFreedom: "medium" });
  const [activeChapterStream, setActiveChapterStream] = useState<{ chapterId: string; chapterLabel: string } | null>(null);
  const [activeRepairStream, setActiveRepairStream] = useState<{ chapterId: string; chapterLabel: string } | null>(null);
  const [characterMessage, setCharacterMessage] = useState("");
  const [repairBeforeContent, setRepairBeforeContent] = useState("");
  const [repairAfterContent, setRepairAfterContent] = useState("");
  const [selectedCharacterId, setSelectedCharacterId] = useState("");
  const [selectedBaseCharacterId, setSelectedBaseCharacterId] = useState("");
  const [quickCharacterForm, setQuickCharacterForm] = useState({
    name: "",
    role: "主角",
  });
  const [characterForm, setCharacterForm] = useState({
    name: "",
    role: "",
    gender: "unknown" as "male" | "female" | "other" | "unknown",
    personality: "",
    background: "",
    development: "",
    appearance: "",
    physique: "",
    attireStyle: "",
    signatureDetail: "",
    voiceTexture: "",
    presenceImpression: "",
    currentState: "",
    currentGoal: "",
  });
  const shouldLoadVolumeWorkspace = activeTab === "outline" || activeTab === "structured";
  const shouldLoadStoryMacro = activeTab === "story_macro";
  const shouldLoadWorldSlice = activeTab === "basic" || activeTab === "world";
  const shouldLoadQualityReport = activeTab === "pipeline";
  const shouldLoadLatestState = activeTab === "chapter" || activeTab === "pipeline";
  const shouldLoadPayoffLedger = activeTab === "structured" || activeTab === "chapter" || activeTab === "pipeline";
  const shouldLoadCharacterResources = activeTab === "character" || activeTab === "chapter" || activeTab === "pipeline";
  const shouldLoadChapterContext = activeTab === "chapter" && Boolean(selectedChapterId);
  const shouldLoadChapterTimeline = activeTab === "chapter" && Boolean(selectedChapterId);

  const novelDetailQuery = useQuery({
    queryKey: queryKeys.novels.detail(id),
    queryFn: () => getNovelDetail(id),
    enabled: Boolean(id),
  });
  const switchToSimpleMutation = useMutation({
    mutationFn: () => setNovelCreationExperience(id, "simple"),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.novels.detail(id) });
      navigate(`/novels/${id}/simple`, { replace: true });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "切换模式失败，请重试。"),
  });

  useEffect(() => {
    if (novelDetailQuery.data?.data?.creationExperience === "simple") {
      navigate(`/novels/${id}/simple`, { replace: true });
    }
  }, [id, navigate, novelDetailQuery.data?.data?.creationExperience]);
  const payoffLedgerChapterOrder = useMemo(() => {
    const orders = novelDetailQuery.data?.data?.chapters?.map((chapter) => chapter.order) ?? [];
    return orders.length > 0 ? Math.max(...orders) : undefined;
  }, [novelDetailQuery.data?.data?.chapters]);

  const {
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
  } = useNovelEditDataQueries({
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
  });

  const {
    sourceBookAnalysesQuery,
    sourceNovelOptions,
    sourceKnowledgeOptions,
    sourceNovelBookAnalysisOptions,
  } = useNovelContinuationSources(id, {
    writingMode: basicForm.writingMode,
    continuationSourceType: basicForm.continuationSourceType,
    sourceNovelId: basicForm.sourceNovelId,
    sourceKnowledgeDocumentId: basicForm.sourceKnowledgeDocumentId,
  });

  const { tab: storyMacroTab } = useNovelStoryMacro({
    novelId: id,
    enabled: shouldLoadStoryMacro,
    llm,
  });
  const {
    worldSliceMessage,
    novelWorldView,
    novelWorldSyncDiff,
    worldSliceView,
    isLoadingNovelWorld,
    isImportingNovelWorld,
    isGeneratingNovelWorld,
    isCreatingManualNovelWorld,
    isSavingNovelWorldToLibrary,
    isLoadingNovelWorldSyncDiff,
    isSyncingNovelWorld,
    isRefreshingWorldSlice,
    isSavingWorldSliceOverrides,
    importNovelWorld,
    createManualNovelWorld,
    generateNovelWorld,
    saveNovelWorldToLibrary,
    syncNovelWorld,
    refreshWorldSlice,
    saveWorldSliceOverrides,
  } = useNovelWorldSlice({
    novelId: id,
    enabled: shouldLoadWorldSlice,
    llm,
    queryClient,
    onNovelWorldImported: (worldId) => setBasicForm((prev) => ({ ...prev, worldId })),
  });
  const pipelineJobQuery = useQuery({
    queryKey: queryKeys.novels.pipelineJob(id, currentJobId || "none"),
    queryFn: () => getNovelPipelineJob(id, currentJobId),
    enabled: Boolean(id && currentJobId),
    refetchInterval: (query) => {
      const status = query.state.data?.data?.status;
      if (status === "queued" || status === "running") {
        return 1500;
      }
      return false;
    },
  });
  const exportNovelMutation = useMutation({
    mutationFn: async (input: {
      format: NovelExportDownloadFormat;
      scope: NovelExportScope;
      novelTitle: string;
    }) => {
      const exported = await downloadNovelExport(id, input.format, input.scope, input.novelTitle);
      return {
        ...exported,
        scope: input.scope,
        format: input.format,
      };
    },
    onSuccess: ({ blob, fileName, scope }) => {
      createDownload(blob, fileName);
      toast.success(scope === "full" ? "整本书导出已开始。" : "当前步骤导出已开始。");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "导出失败。");
    },
  });

  const chapters = useMemo(() => novelDetailQuery.data?.data?.chapters ?? [], [novelDetailQuery.data?.data?.chapters]);
  const outlineSyncChapters = useMemo<ExistingOutlineChapter[]>(
    () => chapters.map((chapter) => ({
      id: chapter.id,
      order: chapter.order,
      title: chapter.title,
      content: chapter.content ?? "",
      expectation: chapter.expectation ?? "",
      targetWordCount: chapter.targetWordCount ?? null,
      conflictLevel: chapter.conflictLevel ?? null,
      revealLevel: chapter.revealLevel ?? null,
      mustAvoid: chapter.mustAvoid ?? null,
      taskSheet: chapter.taskSheet ?? null,
    })),
    [chapters],
  );
  const selectedChapter = useMemo(
    () => chapters.find((item) => item.id === selectedChapterId),
    [chapters, selectedChapterId],
  );
  const characters = novelDetailQuery.data?.data?.characters ?? [];
  const baseCharacters = baseCharacterListQuery.data?.data ?? [];
  const selectedCharacter = useMemo(
    () => characters.find((item) => item.id === selectedCharacterId),
    [characters, selectedCharacterId],
  );
  const selectedBaseCharacter = useMemo(
    () => baseCharacters.find((item) => item.id === selectedBaseCharacterId),
    [baseCharacters, selectedBaseCharacterId],
  );
  const exportNovelTitle = useMemo(
    () => basicForm.title.trim() || novelDetailQuery.data?.data?.title?.trim() || id,
    [basicForm.title, novelDetailQuery.data?.data?.title, id],
  );
  const currentExportScope = isNovelWorkspaceFlowTab(activeTab) && activeTab !== "world" ? activeTab : null;
  const importedBaseCharacterIds = useMemo(
    () => new Set(
      characters
        .map((item) => item.baseCharacterId)
        .filter((item): item is string => Boolean(item)),
    ),
    [characters],
  );
  const hasCharacters = characters.length > 0;
  const savedVolumeWorkspace = volumeWorkspaceQuery.data?.data ?? null;
  const {
    normalizedVolumeDraft,
    hasUnsavedVolumeDraft,
    generationNotice,
    readiness,
    volumeCountGuidance,
    customVolumeCountEnabled,
    customVolumeCountInput,
    onCustomVolumeCountEnabledChange,
    onCustomVolumeCountInputChange,
    onApplyCustomVolumeCount,
    onRestoreSystemRecommendedVolumeCount,
    isGeneratingStrategy,
    isCritiquingStrategy,
    isGeneratingSkeleton,
    isGeneratingBeatSheet,
    isGeneratingChapterList,
    generatingChapterListVolumeId,
    generatingChapterListBeatKey,
    generatingChapterListMode,
    isGeneratingChapterDetail,
    isGeneratingChapterDetailBundle,
    generatingChapterDetailMode,
    generatingChapterDetailChapterId,
    startStrategyGeneration,
    startStrategyCritique,
    startSkeletonGeneration,
    startBeatSheetGeneration,
    startChapterListGeneration,
    startChapterDetailGeneration,
    startChapterDetailBundleGeneration,
    handleVolumeFieldChange,
    handleOpenPayoffsChange,
    handleAddVolume,
    handleRemoveVolume,
    handleMoveVolume,
    handleChapterFieldChange,
    handleChapterNumberChange,
    handleChapterPayoffRefsChange,
    handleAddChapter,
    handleRemoveChapter,
    handleMoveChapter,
  } = useNovelVolumePlanning({
    novelId: id,
    hasCharacters,
    llm,
    estimatedChapterCount: basicForm.estimatedChapterCount,
    volumeDraft,
    strategyPlan: volumeStrategyPlan,
    critiqueReport: volumeCritiqueReport,
    beatSheets: volumeBeatSheets,
    rebalanceDecisions: volumeRebalanceDecisions,
    savedWorkspace: savedVolumeWorkspace,
    setVolumeDraft,
    setStrategyPlan: setVolumeStrategyPlan,
    setCritiqueReport: setVolumeCritiqueReport,
    setBeatSheets: setVolumeBeatSheets,
    setRebalanceDecisions: setVolumeRebalanceDecisions,
    setVolumeGenerationMessage,
    setStructuredMessage,
  });
  const volumeSyncPreview = useMemo(
    () => buildVolumeSyncPreview(normalizedVolumeDraft, outlineSyncChapters, volumeSyncOptions),
    [normalizedVolumeDraft, outlineSyncChapters, volumeSyncOptions],
  );
  const {
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
  } = useNovelEditWorkspaceData({
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
  });
  const {
    takeover,
    taskDrawerActions,
    isTakeoverDismissed,
    openAutoDirectorTaskCenter,
    handleTaskDrawerProjectionAction,
    handleDrawerFollowUpAction,
    executeFollowUpActionMutation,
    retryAutoDirectorWithCurrentModelMutation,
    retryAutoDirectorWithTaskModelMutation,
    isTaskDrawerOpen,
    setIsTaskDrawerOpen,
    openAuditIssueIds,
  } = useNovelDirectorTakeoverLogic({
    id,
    llm,
    activeTab,
    setActiveTab,
    selectedChapterId,
    setSelectedChapterId,
    setSelectedVolumeId,
    setDirectorTaskId,
    taskPanelOpen,
    characters,
    chapters,
    novelDetailQuery,
    activeAutoDirectorTask,
    activeDirectorSnapshot,
    activeDirectorSession,
    bookAutomationProjection,
    visibleDirectorTask,
    displayAutoDirectorTask,
    actionTargetDirectorTaskId,
    activeAutoDirectorFollowUp,
    chapterAuditReports,
    payoffLedgerChapterOrder,
    hasUnsavedVolumeDraft,
    workflowCurrentTab,
    setRetryOverride,
  });

  useNovelEditInitialization({
    detail: novelDetailQuery.data?.data,
    chapters,
    characters,
    baseCharacters,
    basicForm,
    selectedCharacter,
    selectedChapterId,
    selectedCharacterId,
    selectedBaseCharacterId,
    sourceNovelBookAnalysisOptions,
    sourceBookAnalysesLoading: sourceBookAnalysesQuery.isLoading,
    sourceBookAnalysesFetching: sourceBookAnalysesQuery.isFetching,
    hydrateVolumeDraftFromDetail: !shouldLoadVolumeWorkspace,
    setBasicForm,
    setVolumeDraft,
    setPipelineForm,
    setSelectedChapterId,
    setSelectedCharacterId,
    setSelectedBaseCharacterId,
    setCharacterForm,
  });

  useEffect(() => {
    const workspace = volumeWorkspaceQuery.data?.data;
    if (!workspace) {
      return;
    }
    setVolumeDraft(workspace.volumes ?? []);
    setVolumeStrategyPlan(workspace.strategyPlan ?? null);
    setVolumeCritiqueReport(workspace.critiqueReport ?? null);
    setVolumeBeatSheets(workspace.beatSheets ?? []);
    setVolumeRebalanceDecisions(workspace.rebalanceDecisions ?? []);
  }, [volumeWorkspaceQuery.data?.data]);

  useStructuredOutlineWorkspaceSync({
    id,
    activeTab,
    selectedVolumeId,
    selectedChapterId,
    activeStructuredOutlineChapterId,
    normalizedVolumeDraft,
  });
  useEffect(() => {
    if (!id) {
      return;
    }
    if (
      activeAutoDirectorTask
      && (
        activeAutoDirectorTask.status === "queued"
        || activeAutoDirectorTask.status === "running"
        || activeAutoDirectorTask.status === "waiting_approval"
      )
    ) {
      return;
    }
    const labels: Record<string, string> = {
      basic: "项目设定已打开",
      story_macro: "故事宏观规划已打开",
      character: "角色准备已打开",
      outline: "卷战略 / 卷骨架已打开",
      structured: "节奏 / 拆章已打开",
      chapter: selectedChapter ? `正在查看第${selectedChapter.order}章执行面板` : "章节执行已打开",
      pipeline: "质量修复 / 流水线已打开",
    };
    void syncNovelWorkflowStageSilently({
      novelId: id,
      stage: workflowStageFromTab(activeTab),
      itemLabel: labels[activeTab] ?? "小说主流程已打开",
      chapterId: activeTab === "chapter" ? selectedChapterId || undefined : undefined,
      volumeId: activeTab === "structured" || activeTab === "outline" ? selectedVolumeId || undefined : undefined,
      status: "waiting_approval",
    });
  }, [activeAutoDirectorTask, activeTab, id, selectedChapter?.order, selectedChapterId, selectedVolumeId]);

  const outlineText = useMemo(
    () => buildOutlinePreviewFromVolumes(normalizedVolumeDraft),
    [normalizedVolumeDraft],
  );
  const structuredDraftText = useMemo(
    () => buildStructuredPreviewFromVolumes(normalizedVolumeDraft),
    [normalizedVolumeDraft],
  );
  const draftVolumeDocument = useMemo(() => ({
    novelId: id,
    workspaceVersion: "v2" as const,
    volumes: normalizedVolumeDraft,
    strategyPlan: volumeStrategyPlan,
    critiqueReport: volumeCritiqueReport,
    beatSheets: volumeBeatSheets,
    rebalanceDecisions: volumeRebalanceDecisions,
    readiness: buildVolumePlanningReadiness({
      volumes: normalizedVolumeDraft,
      strategyPlan: volumeStrategyPlan,
      critiqueReport: volumeCritiqueReport,
      beatSheets: volumeBeatSheets,
    }),
    derivedOutline: outlineText,
    derivedStructuredOutline: structuredDraftText,
    source: savedVolumeWorkspace?.source ?? "volume",
    activeVersionId: savedVolumeWorkspace?.activeVersionId ?? null,
  }), [
    id,
    normalizedVolumeDraft,
    outlineText,
    savedVolumeWorkspace?.activeVersionId,
    savedVolumeWorkspace?.source,
    structuredDraftText,
    volumeBeatSheets,
    volumeCritiqueReport,
    volumeRebalanceDecisions,
    volumeStrategyPlan,
  ]);

  const {
    confirmCharacterResourceProposalMutation,
    rejectCharacterResourceProposalMutation,
    extractChapterResourcesMutation,
    backfillCharacterResourcesMutation,
  } = useNovelCharacterResourceProposals({ id, llm, selectedChapterId });

  const {
    invalidateNovelDetail,
    chapterSSE,
    bibleSSE,
    beatsSSE,
    repairSSE,
  } = useNovelEditStreams({
    id,
    setChapterOperationMessage,
    setActiveChapterStream,
    setRepairAfterContent,
    setActiveRepairStream,
  });

  const {
    saveBasicMutation,
    saveOutlineMutation,
    saveStructuredMutation,
    optimizeOutlineMutation,
    optimizeStructuredMutation,
    syncStructuredChaptersMutation,
    createChapterMutation,
    deleteManualChapterMutation,
    runPipelineMutation,
    reviewMutation,
    hookMutation,
  } = useNovelEditMutations({
    id,
    basicForm,
    hasCharacters,
    outlineText,
    outlineOptimizeInstruction,
    setOutlineOptimizePreview,
    setOutlineOptimizeMode,
    setOutlineOptimizeSourceText,
    structuredDraftText,
    structuredOptimizeInstruction,
    setStructuredOptimizePreview,
    setStructuredOptimizeMode,
    setStructuredOptimizeSourceText,
    volumeDocument: draftVolumeDocument,
    llm,
    pipelineForm,
    selectedChapterId,
    chapterCount: novelDetailQuery.data?.data?.chapters?.length ?? 0,
    chapters,
    setActiveTab,
    setSelectedChapterId,
    setCurrentJobId,
    setPipelineMessage,
    setStructuredMessage,
    setReviewResult,
    queryClient,
    invalidateNovelDetail,
  });

  const {
    characterTimelineQuery,
    syncTimelineMutation,
    syncAllTimelineMutation,
    evolveCharacterMutation,
    generateVisibleProfileMutation,
    applyVisibleProfileMutation,
    generateBatchVisibleProfilesMutation,
    applyBatchVisibleProfilesMutation,
    worldCheckMutation,
    saveCharacterMutation,
    importBaseCharacterMutation,
    quickCreateCharacterMutation,
    deleteCharacterMutation,
    generateSupplementalCharacterMutation,
    applySupplementalCharacterMutation,
  } = useNovelCharacterMutations({
    id,
    selectedCharacterId,
    selectedBaseCharacter,
    characters,
    pipelineForm,
    llm,
    characterForm,
    quickCharacterForm,
    queryClient,
    setCharacterMessage,
    setSelectedCharacterId,
    setQuickCharacterForm,
  });

  const {
    volumeMessage,
    volumeVersions,
    selectedVersionId,
    setSelectedVersionId,
    diffResult,
    impactResult,
    createDraftVersionMutation,
    activateVersionMutation,
    freezeVersionMutation,
    diffMutation,
    analyzeDraftImpactMutation,
    analyzeVersionImpactMutation,
    loadSelectedVersionToDraft,
  } = useVolumeVersionControl({
    novelId: id,
    draftDocument: draftVolumeDocument,
    setDraftVolumes: setVolumeDraft,
    setStrategyPlan: setVolumeStrategyPlan,
    setCritiqueReport: setVolumeCritiqueReport,
    setBeatSheets: setVolumeBeatSheets,
    setRebalanceDecisions: setVolumeRebalanceDecisions,
    queryClient,
    invalidateNovelDetail,
  });

  const goToCharacterTab = () => setActiveTab("character");
  const goToStructuredTab = () => setActiveTab("structured");
  const {
    generateChapterPlanMutation,
    replanChapterMutation,
    fullAuditMutation,
    reviewActionKind,
    runChapterReview,
    handleGenerateSelectedChapter,
    handleAbortChapterStream,
    handleAbortRepair,
    chapterExecutionActions,
  } = useNovelEditChapterRuntime({
    novelId: id,
    llm,
    selectedChapterId,
    selectedChapter,
    chapterStrategy,
    reviewResult,
    openAuditIssueIds,
    queryClient,
    invalidateNovelDetail,
    setChapterOperationMessage,
    setReviewResult,
    setRepairBeforeContent,
    setRepairAfterContent,
    setActiveChapterStream,
    setActiveRepairStream,
    chapterSSE,
    repairSSE,
  });


  const { basicTab, outlineTab, structuredTab } = buildNovelEditPlanningTabs({
    id,
    basicForm,
    genreOptions,
    storyModeOptions,
    worldOptions: worldListQuery.data?.data ?? [],
    sourceNovelOptions,
    sourceKnowledgeOptions,
    sourceNovelBookAnalysisOptions,
    isLoadingSourceNovelBookAnalyses: sourceBookAnalysesQuery.isLoading,
    availableBookAnalysisSections: [...BOOK_ANALYSIS_SECTIONS],
    novelWorldView,
    novelWorldSyncDiff,
    worldSliceView,
    worldSliceMessage,
    isLoadingNovelWorld,
    isImportingNovelWorld,
    isGeneratingNovelWorld,
    isCreatingManualNovelWorld,
    isSavingNovelWorldToLibrary,
    isLoadingNovelWorldSyncDiff,
    isSyncingNovelWorld,
    isRefreshingWorldSlice,
    isSavingWorldSliceOverrides,
    onBasicFormChange: (patch) => setBasicForm((prev) => patchNovelBasicForm(prev, patch)),
    onSaveBasic: () => saveBasicMutation.mutate(),
    onImportNovelWorld: importNovelWorld,
    onCreateManualNovelWorld: createManualNovelWorld,
    onGenerateNovelWorld: generateNovelWorld,
    onSaveNovelWorldToLibrary: saveNovelWorldToLibrary,
    onSyncNovelWorld: syncNovelWorld,
    onRefreshWorldSlice: refreshWorldSlice,
    onSaveWorldSliceOverrides: saveWorldSliceOverrides,
    isSavingBasic: saveBasicMutation.isPending,
    projectQuickStart: undefined,
    basicDirectorTakeoverEntry: undefined,
    storyMacroDirectorTakeoverEntry: undefined,
    outlineDirectorTakeoverEntry: undefined,
    structuredDirectorTakeoverEntry: undefined,
    worldInjectionSummary,
    hasCharacters,
    hasUnsavedVolumeDraft,
    generationNotice,
    readiness,
    volumeCountGuidance,
    customVolumeCountEnabled,
    customVolumeCountInput,
    onCustomVolumeCountEnabledChange,
    onCustomVolumeCountInputChange,
    onApplyCustomVolumeCount,
    onRestoreSystemRecommendedVolumeCount,
    strategyPlan: volumeStrategyPlan,
    critiqueReport: volumeCritiqueReport,
    isGeneratingStrategy,
    onGenerateStrategy: startStrategyGeneration,
    isCritiquingStrategy,
    onCritiqueStrategy: startStrategyCritique,
    isGeneratingSkeleton,
    onGenerateSkeleton: startSkeletonGeneration,
    onGoToCharacterTab: goToCharacterTab,
    onGoToStructuredTab: goToStructuredTab,
    latestStateSnapshot,
    payoffLedger,
    characterResources,
    outlineText,
    structuredDraftText,
    volumes: normalizedVolumeDraft,
    onVolumeFieldChange: handleVolumeFieldChange,
    onOpenPayoffsChange: handleOpenPayoffsChange,
    onAddVolume: handleAddVolume,
    onRemoveVolume: handleRemoveVolume,
    onMoveVolume: handleMoveVolume,
    onSaveOutline: () => saveOutlineMutation.mutate(),
    isSavingOutline: saveOutlineMutation.isPending,
    volumeMessage: volumeGenerationMessage || volumeMessage,
    volumeVersions,
    selectedVersionId,
    onSelectedVersionChange: setSelectedVersionId,
    onCreateDraftVersion: () => createDraftVersionMutation.mutate(),
    isCreatingDraftVersion: createDraftVersionMutation.isPending,
    onLoadSelectedVersionToDraft: loadSelectedVersionToDraft,
    onActivateVersion: () => activateVersionMutation.mutate(),
    isActivatingVersion: activateVersionMutation.isPending,
    onFreezeVersion: () => freezeVersionMutation.mutate(),
    isFreezingVersion: freezeVersionMutation.isPending,
    onLoadVersionDiff: () => diffMutation.mutate(),
    isLoadingVersionDiff: diffMutation.isPending,
    diffResult,
    onAnalyzeDraftImpact: () => analyzeDraftImpactMutation.mutate(),
    isAnalyzingDraftImpact: analyzeDraftImpactMutation.isPending,
    onAnalyzeVersionImpact: () => analyzeVersionImpactMutation.mutate(),
    isAnalyzingVersionImpact: analyzeVersionImpactMutation.isPending,
    impactResult,
    beatSheets: volumeBeatSheets,
    rebalanceDecisions: volumeRebalanceDecisions,
    isGeneratingBeatSheet,
    onGenerateBeatSheet: startBeatSheetGeneration,
    isGeneratingChapterList,
    generatingChapterListVolumeId,
    generatingChapterListBeatKey,
    generatingChapterListMode,
    onGenerateChapterList: startChapterListGeneration,
    isGeneratingChapterDetail,
    isGeneratingChapterDetailBundle,
    generatingChapterDetailMode,
    generatingChapterDetailChapterId,
    onGenerateChapterDetail: startChapterDetailGeneration,
    onGenerateChapterDetailBundle: startChapterDetailBundleGeneration,
    syncPreview: volumeSyncPreview,
    syncOptions: volumeSyncOptions,
    onSyncOptionsChange: (patch) => setVolumeSyncOptions((prev) => ({ ...prev, ...patch })),
    onApplySync: (options) => syncStructuredChaptersMutation.mutate(options),
    isApplyingSync: syncStructuredChaptersMutation.isPending,
    syncMessage: structuredMessage,
    chapters: outlineSyncChapters,
    onChapterFieldChange: handleChapterFieldChange,
    onChapterNumberChange: handleChapterNumberChange,
    onChapterPayoffRefsChange: handleChapterPayoffRefsChange,
    onAddChapter: handleAddChapter,
    onRemoveChapter: handleRemoveChapter,
    onMoveChapter: handleMoveChapter,
    onApplyBatch: (patch) => {
      setVolumeDraft((prev) => applyVolumeChapterBatch(prev, patch));
    },
    onSaveStructured: () => saveStructuredMutation.mutate(),
    isSavingStructured: saveStructuredMutation.isPending,
  });
  const chapterTab = {
    novelId: id,
    worldInjectionSummary,
    hasCharacters,
    chapters,
    selectedChapterId,
    selectedChapter,
    onSelectChapter: setSelectedChapterId,
    onGoToCharacterTab: goToCharacterTab,
    onCreateChapter: () => createChapterMutation.mutate(),
    isCreatingChapter: createChapterMutation.isPending,
    onRemoveChapter: (chapter: Chapter) => {
      const confirmed = window.confirm(`确认移除「第${chapter.order}章 ${chapter.title || "未命名章节"}」吗？该章节尚未开始写作，移除后不可恢复。`);
      if (confirmed) {
        deleteManualChapterMutation.mutate(chapter.id);
      }
    },
    removingChapterId: deleteManualChapterMutation.isPending
      ? deleteManualChapterMutation.variables ?? null
      : null,
    chapterOperationMessage,
    strategy: chapterStrategy,
    onStrategyChange: (field: "runMode" | "wordSize" | "conflictLevel" | "pace" | "aiFreedom", value: string | number) =>
      setChapterStrategy((prev) => ({ ...prev, [field]: value } as ChapterExecutionStrategy)),
    onApplyStrategy: chapterExecutionActions.applyStrategy,
    isApplyingStrategy: chapterExecutionActions.isPatchingChapter,
    onGenerateSelectedChapter: handleGenerateSelectedChapter,
    onRewriteChapter: chapterExecutionActions.rewriteChapter,
    onExpandChapter: chapterExecutionActions.expandChapter,
    onCompressChapter: chapterExecutionActions.compressChapter,
    onSummarizeChapter: chapterExecutionActions.summarizeChapter,
    onGenerateTaskSheet: chapterExecutionActions.generateTaskSheet,
    onGenerateSceneCards: chapterExecutionActions.generateSceneCards,
    onGenerateChapterPlan: () => generateChapterPlanMutation.mutate(),
    onReplanChapter: () => replanChapterMutation.mutate(),
    onRunFullAudit: () => runChapterReview("full_audit"),
    onCheckContinuity: chapterExecutionActions.checkContinuity,
    onCheckCharacterConsistency: chapterExecutionActions.checkCharacterConsistency,
    onCheckPacing: chapterExecutionActions.checkPacing,
    onAutoRepair: chapterExecutionActions.autoRepair,
    onStrengthenConflict: chapterExecutionActions.strengthenConflict,
    onEnhanceEmotion: chapterExecutionActions.enhanceEmotion,
    onUnifyStyle: chapterExecutionActions.unifyStyle,
    onAddDialogue: chapterExecutionActions.addDialogue,
    onAddDescription: chapterExecutionActions.addDescription,
    isGeneratingTaskSheet: chapterExecutionActions.isGeneratingTaskSheet,
    isGeneratingSceneCards: chapterExecutionActions.isGeneratingSceneCards,
    isSummarizingChapter: chapterExecutionActions.isSummarizingChapter,
    reviewActionKind,
    repairActionKind: chapterExecutionActions.repairActionKind,
    generationActionKind: chapterExecutionActions.generationActionKind,
    isReviewingChapter: fullAuditMutation.isPending,
    isRepairingChapter: repairSSE.isStreaming,
    reviewResult,
    replanRecommendation: reviewResult?.replanRecommendation ?? null,
    lastReplanResult: replanChapterMutation.data?.data ?? null,
    chapterPlan,
    latestStateSnapshot,
    chapterStateSnapshot,
    chapterTimeline,
    isLoadingChapterTimeline: chapterTimelineQuery.isLoading || chapterTimelineQuery.isFetching,
    chapterResourceContext,
    isLoadingChapterResourceContext: chapterResourceContextQuery.isLoading || chapterResourceContextQuery.isFetching,
    resourceWorkflowMode: activeDirectorSession ? ("auto_director" as const) : ("manual" as const),
    pendingCharacterResourceProposals: chapterPendingCharacterResourceProposals,
    onExtractChapterResources: () => extractChapterResourcesMutation.mutate(),
    isExtractingChapterResources: extractChapterResourcesMutation.isPending,
    onConfirmCharacterResourceProposal: (proposalId: string) => confirmCharacterResourceProposalMutation.mutate(proposalId),
    onRejectCharacterResourceProposal: (proposalId: string) => rejectCharacterResourceProposalMutation.mutate(proposalId),
    confirmingCharacterResourceProposalId: confirmCharacterResourceProposalMutation.isPending
      ? confirmCharacterResourceProposalMutation.variables ?? ""
      : "",
    rejectingCharacterResourceProposalId: rejectCharacterResourceProposalMutation.isPending
      ? rejectCharacterResourceProposalMutation.variables ?? ""
      : "",
    chapterAuditReports,
    backgroundSyncActivities: pipelineBackgroundActivities,
    isGeneratingChapterPlan: generateChapterPlanMutation.isPending,
    isReplanningChapter: replanChapterMutation.isPending,
    isRunningFullAudit: fullAuditMutation.isPending && reviewActionKind === "full_audit",
    chapterQualityReport,
    chapterRuntimePackage: chapterSSE.runtimePackage,
    repairStreamContent: repairSSE.content,
    isRepairStreaming: repairSSE.isStreaming,
    repairStreamingChapterId: activeRepairStream?.chapterId ?? null,
    repairStreamingChapterLabel: activeRepairStream?.chapterLabel ?? null,
    repairRunStatus: repairSSE.latestRun,
    onAbortRepair: handleAbortRepair,
    streamContent: chapterSSE.content,
    isStreaming: chapterSSE.isStreaming,
    streamingChapterId: activeChapterStream?.chapterId ?? null,
    streamingChapterLabel: activeChapterStream?.chapterLabel ?? null,
    chapterRunStatus: chapterSSE.latestRun,
    onAbortStream: handleAbortChapterStream,
    directorTakeoverEntry: undefined,
  };
  const pipelineTab = { novelId: id, worldInjectionSummary, hasCharacters, onGoToCharacterTab: goToCharacterTab, pipelineForm, onPipelineFormChange: (field: "startOrder" | "endOrder" | "maxRetries" | "runMode" | "autoReview" | "autoRepair" | "skipCompleted" | "qualityThreshold" | "repairMode", value: number | boolean | string) => setPipelineForm((prev) => ({ ...prev, [field]: value } as typeof prev)), maxOrder, onGenerateBible: () => void bibleSSE.start(`/novels/${id}/bible/generate`, { provider: llm.provider, model: llm.model, temperature: 0.6 }), onAbortBible: bibleSSE.abort, isBibleStreaming: bibleSSE.isStreaming, bibleStreamContent: bibleSSE.content, onGenerateBeats: () => void beatsSSE.start(`/novels/${id}/beats/generate`, { provider: llm.provider, model: llm.model, targetChapters: pipelineForm.endOrder }), onAbortBeats: beatsSSE.abort, isBeatsStreaming: beatsSSE.isStreaming, beatsStreamContent: beatsSSE.content, onRunPipeline: (patch?: Partial<typeof pipelineForm>) => runPipelineMutation.mutate(patch), isRunningPipeline: runPipelineMutation.isPending, pipelineMessage, pipelineJob: pipelineJobQuery.data?.data, chapters, selectedChapterId, onSelectedChapterChange: setSelectedChapterId, onReviewChapter: () => reviewMutation.mutate(), isReviewing: reviewMutation.isPending, onRepairChapter: () => { setRepairBeforeContent(selectedChapter?.content ?? ""); setRepairAfterContent(""); setActiveRepairStream(selectedChapter ? { chapterId: selectedChapter.id, chapterLabel: `第${selectedChapter.order}章 ${selectedChapter.title || "未命名章节"}` } : null); void repairSSE.start(`/novels/${id}/chapters/${selectedChapterId}/repair`, { provider: llm.provider, model: llm.model, reviewIssues: reviewResult?.issues ?? [], auditIssueIds: openAuditIssueIds }); }, isRepairing: repairSSE.isStreaming, onGenerateHook: () => hookMutation.mutate(), isGeneratingHook: hookMutation.isPending, reviewResult, repairBeforeContent, repairAfterContent, repairStreamContent: repairSSE.content, isRepairStreaming: repairSSE.isStreaming, onAbortRepair: handleAbortRepair, qualitySummary, chapterReports: qualityReportQuery.data?.data?.chapterReports ?? [], bible, plotBeats };
  const characterTab = {
    novelId: id,
    llmProvider: llm.provider,
    llmModel: llm.model,
    characterMessage,
    quickCharacterForm,
    onQuickCharacterFormChange: (field: "name" | "role", value: string) =>
      setQuickCharacterForm((prev) => ({ ...prev, [field]: value })),
    onQuickCreateCharacter: (payload: QuickCharacterCreatePayload) => quickCreateCharacterMutation.mutate(payload),
    isQuickCreating: quickCreateCharacterMutation.isPending,
    onGenerateSupplementalCharacters: generateSupplementalCharacterMutation.mutateAsync,
    isGeneratingSupplementalCharacters: generateSupplementalCharacterMutation.isPending,
    onApplySupplementalCharacter: applySupplementalCharacterMutation.mutateAsync,
    isApplyingSupplementalCharacter: applySupplementalCharacterMutation.isPending,
    characters,
    coreCharacterCount,
    baseCharacters,
    selectedBaseCharacterId,
    onSelectedBaseCharacterChange: setSelectedBaseCharacterId,
    selectedBaseCharacter,
    importedBaseCharacterIds,
    onImportBaseCharacter: () => importBaseCharacterMutation.mutate(),
    isImportingBaseCharacter: importBaseCharacterMutation.isPending,
    selectedCharacterId,
    onSelectedCharacterChange: setSelectedCharacterId,
    onDeleteCharacter: (characterId: string) => deleteCharacterMutation.mutate(characterId),
    isDeletingCharacter: deleteCharacterMutation.isPending,
    deletingCharacterId: deleteCharacterMutation.variables ?? "",
    onSyncTimeline: () => syncTimelineMutation.mutate(),
    isSyncingTimeline: syncTimelineMutation.isPending,
    onSyncAllTimeline: () => syncAllTimelineMutation.mutate(),
    isSyncingAllTimeline: syncAllTimelineMutation.isPending,
    onEvolveCharacter: () => evolveCharacterMutation.mutate(),
    isEvolvingCharacter: evolveCharacterMutation.isPending,
    onGenerateVisibleProfile: (userGuidance?: string) => generateVisibleProfileMutation.mutate(userGuidance),
    isGeneratingVisibleProfile: generateVisibleProfileMutation.isPending,
    visibleProfileSuggestion: generateVisibleProfileMutation.data?.data ?? null,
    onApplyVisibleProfile: () => applyVisibleProfileMutation.mutate(),
    isApplyingVisibleProfile: applyVisibleProfileMutation.isPending,
    onGenerateBatchVisibleProfiles: (userGuidance?: string) => generateBatchVisibleProfilesMutation.mutate(userGuidance),
    isGeneratingBatchVisibleProfiles: generateBatchVisibleProfilesMutation.isPending,
    batchVisibleProfileResult: generateBatchVisibleProfilesMutation.data?.data ?? null,
    onApplyBatchVisibleProfiles: () => applyBatchVisibleProfilesMutation.mutate(),
    isApplyingBatchVisibleProfiles: applyBatchVisibleProfilesMutation.isPending,
    onWorldCheck: () => worldCheckMutation.mutate(),
    isCheckingWorld: worldCheckMutation.isPending,
    selectedCharacter,
    characterResources,
    pendingCharacterResourceCount: pendingCharacterResourceProposals.length,
    onBackfillCharacterResources: () => backfillCharacterResourcesMutation.mutate(),
    isBackfillingCharacterResources: backfillCharacterResourcesMutation.isPending,
    characterForm,
    onCharacterFormChange: (field: keyof typeof characterForm, value: string) =>
      setCharacterForm((prev) => ({ ...prev, [field]: value })),
    onSaveCharacter: () => saveCharacterMutation.mutate(),
    isSavingCharacter: saveCharacterMutation.isPending,
    timelineEvents: characterTimelineQuery.data?.data ?? [],
  };

  const activeStepTakeoverEntry = (
    <NovelEditStepTakeoverEntry
      id={id}
      basicForm={basicForm}
      genreOptions={genreOptions}
      storyModeOptions={storyModeOptions}
      worldOptions={worldListQuery.data?.data ?? []}
      directorTaskId={directorTaskId}
      activeAutoDirectorTask={activeAutoDirectorTask}
      bookAutomationProjection={bookAutomationProjection}
      step={
        activeTab === "story_macro"
          ? "story_macro"
          : activeTab === "world"
            ? "world"
          : activeTab === "character"
            ? "character"
            : activeTab === "outline"
              ? "outline"
              : activeTab === "structured"
                ? "structured"
                : activeTab === "chapter"
                  ? "chapter"
                  : activeTab === "pipeline"
                    ? "pipeline"
                    : "basic"
      }
    />
  );
  const exportVariables = exportNovelMutation.variables;
  const isExportingCurrentMarkdown = exportNovelMutation.isPending
    && exportVariables?.scope === currentExportScope
    && exportVariables?.format === "markdown";
  const isExportingCurrentJson = exportNovelMutation.isPending
    && exportVariables?.scope === currentExportScope
    && exportVariables?.format === "json";
  const isExportingFullMarkdown = exportNovelMutation.isPending
    && exportVariables?.scope === "full"
    && exportVariables?.format === "markdown";
  const isExportingFullJson = exportNovelMutation.isPending
    && exportVariables?.scope === "full"
    && exportVariables?.format === "json";

  if (displayAutoDirectorTask?.checkpointType === "production_experience_required") {
    return (
      <NovelProductionExperienceHandoff
        taskId={displayAutoDirectorTask.id}
        novelId={id}
        novelTitle={basicForm.title}
      />
    );
  }

  return (
    <NovelEditView
      id={id}
      activeTab={activeTab}
      workflowCurrentTab={workflowCurrentTab}
      onActiveTabChange={setActiveTab}
      exportControls={{
        canExportCurrentStep: Boolean(currentExportScope),
        isExportingCurrentMarkdown,
        isExportingCurrentJson,
        isExportingFullMarkdown,
        isExportingFullJson,
        onExportCurrent: (format) => {
          if (!currentExportScope) {
            return;
          }
          exportNovelMutation.mutate({
            format,
            scope: currentExportScope,
            novelTitle: exportNovelTitle,
          });
        },
        onExportFull: (format) => {
          exportNovelMutation.mutate({
            format,
            scope: "full",
            novelTitle: exportNovelTitle,
          });
        },
      }}
      basicTab={basicTab}
      worldTab={basicTab}
      storyMacroTab={storyMacroTab}
      outlineTab={outlineTab}
      structuredTab={structuredTab}
      chapterTab={chapterTab}
      pipelineTab={pipelineTab}
      characterTab={characterTab}
      takeover={isTakeoverDismissed ? null : takeover}
      activeStepTakeoverEntry={activeStepTakeoverEntry}
      onSwitchToSimpleMode={() => switchToSimpleMutation.mutate()}
      isSwitchingToSimpleMode={switchToSimpleMutation.isPending}
      taskDrawer={{
        open: isTaskDrawerOpen,
        onOpenChange: (open) => {
          setIsTaskDrawerOpen(open);
          if (!open && taskPanelOpen) {
            clearTaskPanelOpen();
          }
        },
        task: displayAutoDirectorTask,
        snapshot: activeDirectorSnapshot,
        runtimeSnapshot: activeDirectorRuntimeSnapshot,
        projection: displayAutoDirectorTask?.status === "cancelled" ? null : bookAutomationProjection,
        currentUiModel: {
          provider: llm.provider,
          model: llm.model,
          temperature: llm.temperature,
        },
        actions: taskDrawerActions,
        onProjectionAction: handleTaskDrawerProjectionAction,
        followUp: activeAutoDirectorFollowUp,
        onFollowUpAction: handleDrawerFollowUpAction,
        executingFollowUpAction: executeFollowUpActionMutation.isPending,
        runtimeHardBlocked: activeDirectorRuntimeHardBlocked,
        runtimeBlockedReason: activeDirectorRuntimeBlockedReason,
        overrideModel: retryOverride,
        onOverrideModelChange: setRetryOverride,
        onRetryWithOverrideModel: () => retryAutoDirectorWithCurrentModelMutation.mutate(),
        retryWithOverrideModelPending: retryAutoDirectorWithCurrentModelMutation.isPending,
        canRetryWithOverrideModel: Boolean(retryOverride.provider && retryOverride.model.trim()),
        onRetryWithTaskModel: () => retryAutoDirectorWithTaskModelMutation.mutate(),
        retryWithTaskModelPending: retryAutoDirectorWithTaskModelMutation.isPending,
        capabilities: {
          availableActions: taskDrawerActions.length > 0,
          availableFollowUps: Boolean(activeAutoDirectorFollowUp),
          canAdjustRuntimePolicy: Boolean(activeDirectorRuntimeSnapshot && displayAutoDirectorTask),
          canInspectManualEditImpact: Boolean(displayAutoDirectorTask),
          canRetryWithOverrideModel: Boolean(displayAutoDirectorTask && (displayAutoDirectorTask.status === "failed" || displayAutoDirectorTask.status === "cancelled")),
          canCancel: Boolean(displayAutoDirectorTask && canCancelDirectorTask(displayAutoDirectorTask)),
          canArchive: Boolean(displayAutoDirectorTask && (displayAutoDirectorTask.status === "succeeded" || displayAutoDirectorTask.status === "failed" || displayAutoDirectorTask.status === "cancelled")),
        },
        resourceProposals: pendingCharacterResourceProposals,
        onOpenResourceProposalSource: (proposal) => {
          if (proposal.chapterId) {
            setSelectedChapterId(proposal.chapterId);
            setActiveTab("chapter");
          } else {
            setActiveTab("character");
          }
          setIsTaskDrawerOpen(false);
        },
        onConfirmResourceProposal: (proposalId) => confirmCharacterResourceProposalMutation.mutate(proposalId),
        onRejectResourceProposal: (proposalId) => rejectCharacterResourceProposalMutation.mutate(proposalId),
        confirmingResourceProposalId: confirmCharacterResourceProposalMutation.isPending
          ? confirmCharacterResourceProposalMutation.variables ?? ""
          : "",
        rejectingResourceProposalId: rejectCharacterResourceProposalMutation.isPending
          ? rejectCharacterResourceProposalMutation.variables ?? ""
          : "",
        onOpenFullTaskCenter: openAutoDirectorTaskCenter,
      }}
    />
  );
}
