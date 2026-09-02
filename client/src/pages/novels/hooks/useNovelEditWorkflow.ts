import { useCallback, useEffect, useMemo } from "react";
import { useMutation } from "@tanstack/react-query";
import { bootstrapNovelWorkflow } from "@/api/novel/novelWorkflow";
import { useRememberedQueryTab } from "@/hooks/useRememberedQueryTab";
import {
  normalizeNovelWorkspaceTab,
  NOVEL_WORKSPACE_TAB_VALUES,
  type NovelWorkspaceTab,
} from "../novelWorkspaceNavigation";
import {
  readNovelEditWorkflowTaskIds,
  withNovelEditDirectorTaskId,
  withNovelEditWorkspaceTaskId,
} from "./novelEditWorkflowParams";

export function useNovelEditWorkflow(novelId: string) {
  const {
    tab: activeTab,
    setTab: setRememberedActiveTab,
    searchParams,
    setSearchParams,
  } = useRememberedQueryTab<NovelWorkspaceTab>({
    scope: `novel:${novelId || "none"}:main-workspace`,
    queryParam: "stage",
    defaultValue: "basic",
    values: NOVEL_WORKSPACE_TAB_VALUES,
    replace: true,
  });

  const { directorTaskId, workspaceTaskId: workflowTaskId } = readNovelEditWorkflowTaskIds(searchParams);
  const selectedVolumeId = searchParams.get("volumeId") ?? "";
  const taskPanelOpen = searchParams.get("taskPanel") === "1";

  useEffect(() => {
    const canonicalDirectorTaskId = searchParams.get("directorTaskId")?.trim() ?? "";
    const legacyDirectorTaskId = searchParams.get("taskId")?.trim() ?? "";
    if (!legacyDirectorTaskId) {
      return;
    }
    setSearchParams((prev) => withNovelEditDirectorTaskId(prev, canonicalDirectorTaskId || legacyDirectorTaskId), {
      replace: true,
    });
  }, [searchParams, setSearchParams]);

  const bootstrapMutation = useMutation({
    mutationFn: () => bootstrapNovelWorkflow({
      workflowTaskId: workflowTaskId || undefined,
      novelId,
      lane: "manual_create",
      seedPayload: {
        entry: "novel_edit",
        stage: activeTab,
      },
    }),
    onSuccess: (response) => {
      const nextTaskId = response.data?.id;
      if (!nextTaskId || nextTaskId === workflowTaskId) {
        return;
      }
      setSearchParams((prev) => {
        const next = withNovelEditWorkspaceTaskId(prev, nextTaskId);
        if (!next.get("stage")) {
          next.set("stage", activeTab);
        }
        return next;
      }, { replace: true });
    },
  });

  useEffect(() => {
    if (!novelId) {
      return;
    }
    bootstrapMutation.mutate();
  }, [novelId, workflowTaskId]);

  const selectedChapterId = useMemo(
    () => searchParams.get("chapterId") ?? "",
    [searchParams],
  );

  const setActiveTab = useCallback((value: string) => {
    setRememberedActiveTab(normalizeNovelWorkspaceTab(value));
  }, [setRememberedActiveTab]);

  const setSelectedChapterId = (value: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value) {
        next.set("chapterId", value);
      } else {
        next.delete("chapterId");
      }
      return next;
    }, { replace: true });
  };

  const setSelectedVolumeId = (value: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value) {
        next.set("volumeId", value);
      } else {
        next.delete("volumeId");
      }
      return next;
    }, { replace: true });
  };

  const setDirectorTaskId = useCallback((value: string) => {
    setSearchParams((prev) => {
      return withNovelEditDirectorTaskId(prev, value);
    }, { replace: true });
  }, [setSearchParams]);

  const clearTaskPanelOpen = useCallback(() => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("taskPanel");
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  return {
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
  };
}
