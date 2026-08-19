import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  expandNovelOutline,
  getNovelOutlineState,
  saveNovelChapterOutline,
  saveNovelOutline,
} from "@/api/novel/outline";
import { startDirectorTakeover } from "@/api/novel/novelDirector";
import { ensureStorySettings } from "@/api/story/storySettings";
import { queryKeys } from "@/api/queryKeys";
import { toast } from "@/components/ui/toast";

export interface OutlineDraftChapter {
  title: string;
  synopsis: string;
  keyEvents: string[];
  characterNames: string[];
  sceneNames: string[];
}

// 简略大纲 → AI 推理分章细纲（草稿态，确认才落库）→ 启动自动导演。
// 空白小说书架与漫剧工作室的小说阶段共用这一份状态与提交逻辑，界面各自组织。
export function useNovelOutlineWorkspace(novelId: string) {
  const queryClient = useQueryClient();
  const [outlineText, setOutlineText] = useState("");
  const [targetChapterCount, setTargetChapterCount] = useState("");
  const [draftPremise, setDraftPremise] = useState("");
  const [draftChapters, setDraftChapters] = useState<OutlineDraftChapter[] | null>(null);

  const outlineQuery = useQuery({
    queryKey: queryKeys.novels.outline(novelId),
    queryFn: () => getNovelOutlineState(novelId),
    enabled: Boolean(novelId),
  });
  const outlineState = outlineQuery.data?.data ?? null;
  const loadedOutlineRef = useRef("");

  useEffect(() => {
    const serverOutline = outlineState?.outline ?? "";
    if (serverOutline !== loadedOutlineRef.current) {
      loadedOutlineRef.current = serverOutline;
      setOutlineText(serverOutline);
      if (draftChapters === null && outlineState?.chapters) {
        setDraftPremise(outlineState.premise ?? "");
        setDraftChapters(
          outlineState.chapters.map((chapter) => ({
            title: chapter.title,
            synopsis: chapter.synopsis,
            keyEvents: chapter.keyEvents,
            characterNames: chapter.characterNames,
            sceneNames: chapter.sceneNames,
          })),
        );
      }
    }
  }, [outlineState, draftChapters]);

  const confirmedChapterCount = outlineState?.chapters?.length ?? 0;
  const outlineDirty = outlineText.trim() !== (outlineState?.outline ?? "").trim();

  const saveOutlineMutation = useMutation({
    // silent 供自动保存场景使用：落库成功不弹 toast，失败仍然提示。
    mutationFn: (options?: { silent?: boolean }) => saveNovelOutline(novelId, outlineText),
    onSuccess: async (_data, options) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.novels.outline(novelId) });
      if (!options?.silent) {
        toast.success("简略大纲已保存。");
      }
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "保存大纲失败，请重试。"),
  });

  const expandMutation = useMutation({
    mutationFn: () =>
      expandNovelOutline(novelId, {
        targetChapterCount: targetChapterCount.trim() ? Number(targetChapterCount.trim()) : undefined,
      }),
    onSuccess: (response) => {
      const draft = response.data;
      if (!draft) {
        toast.error("AI 没有返回细纲草稿，请重试。");
        return;
      }
      setDraftPremise(draft.premise);
      setDraftChapters(
        draft.chapters.map((chapter) => ({
          title: chapter.title,
          synopsis: chapter.synopsis,
          keyEvents: chapter.keyEvents,
          characterNames: chapter.characterNames,
          sceneNames: chapter.sceneNames,
        })),
      );
      toast.success(`AI 已推理出 ${draft.chapters.length} 章细纲草稿，确认前可以逐章修改。`);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "细纲推理失败，请稍后重试。"),
  });

  const saveChaptersMutation = useMutation({
    mutationFn: () => {
      if (!draftChapters || draftChapters.length < 3) {
        throw new Error("分章细纲至少需要 3 章。");
      }
      return saveNovelChapterOutline(novelId, {
        premise: draftPremise.trim(),
        chapters: draftChapters,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.novels.outline(novelId) });
      toast.success("分章细纲已确认。AI 后续的卷规划与章节写作会遵循这份细纲。");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "保存细纲失败，请重试。"),
  });

  const startMutation = useMutation({
    mutationFn: async () => {
      // 继续写作前先补全缺失的场景/道具设定，让章节有据可依；补全失败不阻断启动。
      try {
        await ensureStorySettings(novelId);
      } catch {
        toast("设定补全暂时失败，本次启动暂不携带新设定。");
      }
      return startDirectorTakeover({
        novelId,
        strategy: "continue_existing",
        runMode: "auto_to_ready",
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["novels", novelId, "simple-shelf"] });
      await queryClient.invalidateQueries({ queryKey: queryKeys.novels.autoDirectorTask(novelId) });
      await queryClient.invalidateQueries({ queryKey: ["tasks"] });
      toast.success("自动导演已启动。AI 会先完成书级规划，再按章节逐章写作与审校。");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "启动失败，请稍后重试。"),
  });

  const canExpand =
    !expandMutation.isPending
    && (outlineText.trim().length > 0 || Boolean(outlineState?.outline?.trim()));
  const canConfirmChapters = Boolean(draftChapters && draftChapters.length >= 3 && draftPremise.trim());

  const updateChapter = (index: number, patch: Partial<OutlineDraftChapter>) => {
    setDraftChapters((current) => {
      if (!current) return current;
      const next = [...current];
      next[index] = { ...next[index], ...patch };
      return next;
    });
  };
  const removeChapter = (index: number) => {
    setDraftChapters((current) => (current ? current.filter((_item, position) => position !== index) : current));
  };
  const moveChapter = (index: number, direction: -1 | 1) => {
    setDraftChapters((current) => {
      if (!current) return current;
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };
  const appendChapter = () => {
    setDraftChapters((current) => [
      ...(current ?? []),
      { title: "", synopsis: "", keyEvents: [], characterNames: [], sceneNames: [] },
    ]);
  };

  return {
    outlineQuery,
    outlineState,
    outlineText,
    setOutlineText,
    targetChapterCount,
    setTargetChapterCount,
    draftPremise,
    setDraftPremise,
    draftChapters,
    setDraftChapters,
    confirmedChapterCount,
    outlineDirty,
    canExpand,
    canConfirmChapters,
    saveOutlineMutation,
    expandMutation,
    saveChaptersMutation,
    startMutation,
    updateChapter,
    removeChapter,
    moveChapter,
    appendChapter,
  };
}

export type NovelOutlineWorkspace = ReturnType<typeof useNovelOutlineWorkspace>;
