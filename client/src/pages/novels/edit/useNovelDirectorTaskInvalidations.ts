import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/api/queryKeys";
import { isNovelWorkspaceFlowTab, type NovelWorkspaceFlowTab } from "../novelWorkspaceNavigation";
import { useNovelEditWorkflow } from "../hooks/useNovelEditWorkflow";

interface NovelDirectorTaskInvalidationsInput {
  id: string;
  activeTab: ReturnType<typeof useNovelEditWorkflow>["activeTab"];
  selectedChapterId: string;
  payoffLedgerChapterOrder?: number;
}

export function useNovelDirectorTaskInvalidations(input: NovelDirectorTaskInvalidationsInput) {
  const { id, activeTab, selectedChapterId, payoffLedgerChapterOrder } = input;
  const queryClient = useQueryClient();

  const invalidateAutoDirectorTaskState = async (taskId?: string) => {
    const invalidations: Array<Promise<unknown>> = [
      queryClient.invalidateQueries({ queryKey: queryKeys.novels.autoDirectorTask(id) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.novels.directorBookAutomation(id) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks.overview }),
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks.recoveryCandidates }),
    ];
    if (taskId) {
      invalidations.push(
        queryClient.invalidateQueries({ queryKey: queryKeys.tasks.detail("novel_workflow", taskId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.tasks.directorTaskSnapshot(taskId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.tasks.directorRuntime(taskId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.autoDirectorFollowUps.detail(taskId) }),
      );
    }
    await Promise.allSettled(invalidations);
  };
  const invalidateWorkspaceDataForTabs = async (tabs: Array<NovelWorkspaceFlowTab | null | undefined>) => {
    const invalidations: Array<Promise<unknown>> = [];
    const targetTabs = new Set(tabs.filter((tab): tab is NovelWorkspaceFlowTab => Boolean(tab)));
    if (targetTabs.has("basic")) {
      invalidations.push(
        queryClient.invalidateQueries({ queryKey: queryKeys.novels.detail(id) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.novels.worldSlice(id) }),
      );
    }
    if (targetTabs.has("story_macro")) {
      invalidations.push(
        queryClient.invalidateQueries({ queryKey: queryKeys.novels.storyMacro(id) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.novels.storyMacroState(id) }),
      );
    }
    if (targetTabs.has("character")) {
      invalidations.push(
        queryClient.invalidateQueries({ queryKey: queryKeys.novels.detail(id) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.novels.characterCastOptions(id) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.novels.characterDynamicsOverview(id) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.novels.characterRelations(id) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.novels.characterCandidates(id) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.novels.characterResources(id) }),
      );
    }
    if (targetTabs.has("outline") || targetTabs.has("structured")) {
      invalidations.push(queryClient.invalidateQueries({ queryKey: queryKeys.novels.volumeWorkspace(id) }));
    }
    if (targetTabs.has("structured")) {
      invalidations.push(queryClient.invalidateQueries({ queryKey: queryKeys.novels.payoffLedger(id, payoffLedgerChapterOrder) }));
    }
    if (targetTabs.has("chapter")) {
      invalidations.push(
        queryClient.invalidateQueries({ queryKey: queryKeys.novels.detail(id) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.novels.latestStateSnapshot(id) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.novels.payoffLedger(id, payoffLedgerChapterOrder) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.novels.characterResources(id) }),
      );
      if (selectedChapterId) {
        invalidations.push(
          queryClient.invalidateQueries({ queryKey: queryKeys.novels.characterResourceContext(id, selectedChapterId) }),
          queryClient.invalidateQueries({ queryKey: queryKeys.novels.chapterTimeline(id, selectedChapterId) }),
          queryClient.invalidateQueries({ queryKey: queryKeys.novels.chapterPlan(id, selectedChapterId) }),
          queryClient.invalidateQueries({ queryKey: queryKeys.novels.chapterAuditReports(id, selectedChapterId) }),
        );
      }
    }
    if (targetTabs.has("pipeline")) {
      invalidations.push(
        queryClient.invalidateQueries({ queryKey: queryKeys.novels.qualityReport(id) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.novels.latestStateSnapshot(id) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.novels.payoffLedger(id, payoffLedgerChapterOrder) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.novels.characterResources(id) }),
      );
    }
    await Promise.allSettled(invalidations);
  };
  const invalidateVisibleWorkspaceData = async () => {
    await invalidateWorkspaceDataForTabs([isNovelWorkspaceFlowTab(activeTab) ? activeTab : null]);
  };

  return {
    invalidateAutoDirectorTaskState,
    invalidateWorkspaceDataForTabs,
    invalidateVisibleWorkspaceData,
  };
}
