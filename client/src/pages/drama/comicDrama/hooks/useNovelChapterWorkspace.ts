import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Chapter } from "@ai-novel/shared/types/novel";
import type {
  ChapterDetailOutlineBeat,
  ChapterDetailOutlineDocument,
} from "@ai-novel/shared/types/novelChapterDetailOutline";
import {
  getNovelChapters,
  previewChapterDetailOutline,
  saveChapterDetailOutline,
  updateNovelChapter,
} from "@/api/novel/chapters";
import { toast } from "@/components/ui/toast";

export const DRAMA_CHAPTERS_QUERY_KEY = "drama-studio-chapters";

const DEFAULT_LINE_COUNT = 50;

export interface ChapterBeatDraft {
  summary: string;
  keyEvent: string | null;
}

function parseDetailOutline(chapter: Chapter): { beats: ChapterDetailOutlineBeat[]; notes: string | null } | null {
  const raw = chapter.detailOutlineJson?.trim();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as ChapterDetailOutlineDocument;
    if (parsed.schemaVersion !== 1 || !Array.isArray(parsed.beats)) return null;
    return { beats: parsed.beats, notes: parsed.notes ?? null };
  } catch {
    return null;
  }
}

// 漫剧工作室小说阶段的「按章创作」工作区：当前章（顶栏章节管理显示与切换）+
// 本章大纲（expectation，静默自动保存）+ 本章细纲（AI 解析节拍草稿，确认才落库）。
// 大纲/细纲两个子页签共享这一份状态，切页签不丢稿；切章时先落库上一章再重置。
export function useNovelChapterWorkspace(novelId: string) {
  const queryClient = useQueryClient();
  const [currentChapterId, setCurrentChapterId] = useState<string | null>(null);
  const [expectationText, setExpectationText] = useState("");
  const [beats, setBeats] = useState<ChapterBeatDraft[] | null>(null);
  const [notes, setNotes] = useState("");

  const chaptersQuery = useQuery({
    queryKey: [DRAMA_CHAPTERS_QUERY_KEY, novelId],
    queryFn: () => getNovelChapters(novelId),
    enabled: Boolean(novelId),
  });
  const chapters = useMemo(
    () => [...(chaptersQuery.data?.data ?? [])].sort((left, right) => left.order - right.order),
    [chaptersQuery.data],
  );

  // 默认当前章：第一个还没写正文的章，否则最后一章。
  const currentChapter = useMemo(() => {
    if (currentChapterId) {
      return chapters.find((chapter) => chapter.id === currentChapterId) ?? null;
    }
    if (chapters.length === 0) {
      return null;
    }
    return chapters.find((chapter) => !(chapter.content ?? "").trim()) ?? chapters[chapters.length - 1];
  }, [chapters, currentChapterId]);

  const invalidateChapters = async () => {
    await queryClient.invalidateQueries({ queryKey: [DRAMA_CHAPTERS_QUERY_KEY, novelId] });
  };

  const saveExpectationMutation = useMutation({
    mutationFn: (input: { chapterId: string; text: string; silent?: boolean }) =>
      updateNovelChapter(novelId, input.chapterId, { expectation: input.text }),
    onSuccess: async (_data, input) => {
      await invalidateChapters();
      if (!input.silent) {
        toast.success("本章大纲已保存。");
      }
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "保存大纲失败，请重试。"),
  });

  const expectationDirty = Boolean(currentChapter)
    && expectationText.trim() !== (currentChapter?.expectation ?? "").trim();

  const savePending = saveExpectationMutation.isPending;
  const flushExpectationSave = () => {
    if (currentChapter && expectationDirty && !savePending) {
      saveExpectationMutation.mutate({
        chapterId: currentChapter.id,
        text: expectationText,
        silent: true,
      });
    }
  };

  const switchChapter = (chapter: Chapter) => {
    if (currentChapter && currentChapter.id !== chapter.id && expectationDirty && !savePending) {
      saveExpectationMutation.mutate({
        chapterId: currentChapter.id,
        text: expectationText,
        silent: true,
      });
    }
    setCurrentChapterId(chapter.id);
  };

  // 章节加载/切换时重置编辑态；空白大纲铺满 50 行编号空行（trim 判空，不触发自动保存）。
  const loadedChapterRef = useRef<string | null>(null);
  useEffect(() => {
    if (!currentChapter || loadedChapterRef.current === currentChapter.id) {
      return;
    }
    loadedChapterRef.current = currentChapter.id;
    const expectation = currentChapter.expectation ?? "";
    setExpectationText(expectation.trim() ? expectation : "\n".repeat(DEFAULT_LINE_COUNT - 1));
    const parsed = parseDetailOutline(currentChapter);
    setBeats(
      parsed
        ? parsed.beats.map((beat) => ({ summary: beat.summary, keyEvent: beat.keyEvent ?? null }))
        : null,
    );
    setNotes(parsed?.notes ?? "");
  }, [currentChapter]);

  const previewMutation = useMutation({
    mutationFn: async () => {
      if (!currentChapter) {
        throw new Error("还没有章节。先打开「章节管理」新建第一章。");
      }
      if (!expectationText.trim()) {
        throw new Error("先在「大纲」页签写下本章的故事，AI 才能解析细纲。");
      }
      return previewChapterDetailOutline(novelId, currentChapter.id);
    },
    onSuccess: (response) => {
      const draft = (response.data?.beats ?? []).map((beat) => ({
        summary: beat.summary,
        keyEvent: beat.keyEvent ?? null,
      }));
      setBeats(draft);
      setNotes(response.data?.notes ?? "");
      toast.success(`AI 已解析出 ${draft.length} 拍细纲草稿，确认前可逐拍修改。`);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "细纲解析失败，请稍后重试。"),
  });

  const saveBeatsMutation = useMutation({
    mutationFn: () => {
      if (!currentChapter) {
        throw new Error("还没有章节。");
      }
      const count = beats?.length ?? 0;
      if (count < 3 || count > 10) {
        throw new Error("细纲需要 3～10 拍。");
      }
      return saveChapterDetailOutline(novelId, currentChapter.id, {
        beats: (beats ?? []).map((beat) => ({ summary: beat.summary, keyEvent: beat.keyEvent })),
        notes: notes.trim() || null,
      });
    },
    onSuccess: async () => {
      await invalidateChapters();
      toast.success("本章细纲已保存。");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "保存细纲失败，请重试。"),
  });

  const updateBeat = (index: number, patch: Partial<ChapterBeatDraft>) => {
    setBeats((current) => {
      if (!current) return current;
      const next = [...current];
      next[index] = { ...next[index], ...patch };
      return next;
    });
  };
  const removeBeat = (index: number) => {
    setBeats((current) => (current ? current.filter((_item, position) => position !== index) : current));
  };
  const addBeat = () => {
    setBeats((current) => [...(current ?? []), { summary: "", keyEvent: null }]);
  };

  return {
    chaptersQuery,
    chapters,
    currentChapter,
    switchChapter,
    expectationText,
    setExpectationText,
    expectationDirty,
    savePending,
    flushExpectationSave,
    previewMutation,
    saveBeatsMutation,
    beats,
    notes,
    setNotes,
    updateBeat,
    removeBeat,
    addBeat,
  };
}

export type NovelChapterWorkspace = ReturnType<typeof useNovelChapterWorkspace>;
