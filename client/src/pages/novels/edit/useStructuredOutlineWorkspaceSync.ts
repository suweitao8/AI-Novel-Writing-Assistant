import { useEffect } from "react";
import { useStructuredOutlineWorkspaceStore } from "../stores/useStructuredOutlineWorkspaceStore";
import { useNovelEditWorkflow } from "../hooks/useNovelEditWorkflow";
import { useNovelVolumePlanning } from "../hooks/useNovelVolumePlanning";

interface StructuredOutlineWorkspaceSyncInput {
  id: string;
  activeTab: ReturnType<typeof useNovelEditWorkflow>["activeTab"];
  selectedVolumeId: ReturnType<typeof useNovelEditWorkflow>["selectedVolumeId"];
  selectedChapterId: string;
  activeStructuredOutlineChapterId: string;
  normalizedVolumeDraft: ReturnType<typeof useNovelVolumePlanning>["normalizedVolumeDraft"];
}

export function useStructuredOutlineWorkspaceSync(input: StructuredOutlineWorkspaceSyncInput) {
  const {
    id,
    activeTab,
    selectedVolumeId,
    selectedChapterId,
    activeStructuredOutlineChapterId,
    normalizedVolumeDraft,
  } = input;

  useEffect(() => {
    if (!id) {
      return;
    }
    useStructuredOutlineWorkspaceStore.getState().patchWorkspace(id, {
      selectedVolumeId: selectedVolumeId || undefined,
      selectedChapterId: selectedChapterId || undefined,
    });
  }, [id, selectedChapterId, selectedVolumeId]);

  useEffect(() => {
    if (!id || activeTab !== "structured" || !activeStructuredOutlineChapterId) {
      return;
    }
    const targetVolume = normalizedVolumeDraft.find((volume) => (
      volume.chapters.some((chapter) => (
        chapter.id === activeStructuredOutlineChapterId
        || chapter.chapterId === activeStructuredOutlineChapterId
      ))
    ));
    if (!targetVolume) {
      return;
    }
    const currentWorkspace = useStructuredOutlineWorkspaceStore.getState().workspaces[id];
    if (
      currentWorkspace?.selectedChapterId === activeStructuredOutlineChapterId
      && currentWorkspace.selectedVolumeId === targetVolume.id
      && currentWorkspace.selectedBeatKey === "all"
    ) {
      return;
    }
    useStructuredOutlineWorkspaceStore.getState().patchWorkspace(id, {
      selectedVolumeId: targetVolume.id,
      selectedChapterId: activeStructuredOutlineChapterId,
      selectedBeatKey: "all",
    });
  }, [activeStructuredOutlineChapterId, activeTab, id, normalizedVolumeDraft]);
}
