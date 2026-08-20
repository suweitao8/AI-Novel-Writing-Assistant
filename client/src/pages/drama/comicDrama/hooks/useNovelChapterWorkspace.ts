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

const DEFAULT_LINE_COUNT = 20;

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
// 本章初稿（expectation，静默自动保存）+ 本章节拍（AI 解析草稿，确认才落库）。
// 初稿/正文两个子页签共享这一份状态，切页签不丢稿；切章时先落库上一章再重置。
export function useNovelChapterWorkspace(novelId: string) {
  const queryClient = useQueryClient();
  const [currentChapterId, setCurrentChapterId] = useState<string | null>(null);
  const [expectationText, setExpectationText] = useState("");
  const [referenceText, setReferenceTextState] = useState("");
  const [extractionOverride, setExtractionOverride] = useState<{ chapterId: string; json: string } | null>(null);
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

  // 提取建议展示值：以服务端章节行为准，本地只保留「保存请求在途」的乐观覆盖
  // （同章生效、服务端追上即自然回落）。直接派生而不是重置一次性的本地状态，
  // 避免重挂载时先拿到旧缓存再刷新，却被「同章只重置一次」的守卫闩死成旧值。
  const chapterExtractionJson = currentChapter?.referenceExtractionJson ?? "";
  const referenceExtractionJson =
    extractionOverride
      && extractionOverride.chapterId === currentChapter?.id
      && extractionOverride.json !== chapterExtractionJson
      ? extractionOverride.json
      : chapterExtractionJson;

  const saveExpectationMutation = useMutation({
    mutationFn: (input: { chapterId: string; text: string; silent?: boolean }) =>
      updateNovelChapter(novelId, input.chapterId, { expectation: input.text }),
    onSuccess: async (_data, input) => {
      await invalidateChapters();
      if (!input.silent) {
        toast.success("本章初稿已保存。");
      }
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "保存初稿失败，请重试。"),
  });

  // 本章参考文本（漫剧「参考」页签）同样静默自动保存到 Chapter.referenceText。
  const saveReferenceMutation = useMutation({
    mutationFn: (input: { chapterId: string; text: string }) =>
      updateNovelChapter(novelId, input.chapterId, { referenceText: input.text }),
    onSuccess: async () => {
      await invalidateChapters();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "保存参考文本失败，请重试。"),
  });

  // 「解析」提取的设定建议随章节持久化（与初稿一样是成果，不用不丢）。
  // 保存走直接 PUT 而非 useMutation：组件卸载后 mutation 回调不会执行，
  // 直接发请求才能保证解析期间离开页面结果也一定落库。
  const persistReferenceExtraction = (chapterId: string, json: string | null) => {
    updateNovelChapter(novelId, chapterId, { referenceExtractionJson: json })
      .then(() => invalidateChapters())
      .catch((error: unknown) => toast.error(error instanceof Error ? error.message : "保存提取结果失败。"));
  };

  // 只同步本地展示（保存请求由调用方负责时用，避免重复 PUT）。
  const syncReferenceExtraction = (json: string | null) => {
    if (!currentChapter) {
      return;
    }
    setExtractionOverride({ chapterId: currentChapter.id, json: json ?? "" });
  };

  // 应用建议移除一条后回写：本地覆盖 + 立即静默落库（解析是一次性动作，结果要稳）。
  const applyReferenceExtraction = (json: string | null) => {
    if (!currentChapter) {
      return;
    }
    syncReferenceExtraction(json);
    persistReferenceExtraction(currentChapter.id, json);
  };

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

  // 「参考」页签解析结果写入初稿：替换编辑器文本并立即静默落库，
  // 不依赖初稿页签挂载后的防抖自动保存（切页签前就持久化）。
  const applyExpectationText = (text: string) => {
    if (!currentChapter) {
      return;
    }
    setExpectationText(text);
    saveExpectationMutation.mutate({ chapterId: currentChapter.id, text, silent: true });
  };

  const referenceDirty = Boolean(currentChapter)
    && referenceText !== (currentChapter?.referenceText ?? "");
  const referenceSavePending = saveReferenceMutation.isPending;
  const flushReferenceSave = () => {
    if (currentChapter && referenceDirty && !referenceSavePending) {
      saveReferenceMutation.mutate({ chapterId: currentChapter.id, text: referenceText });
    }
  };
  const setReferenceText = (text: string) => {
    setReferenceTextState(text);
  };

  const switchChapter = (chapter: Chapter) => {
    if (currentChapter && currentChapter.id !== chapter.id && expectationDirty && !savePending) {
      saveExpectationMutation.mutate({
        chapterId: currentChapter.id,
        text: expectationText,
        silent: true,
      });
    }
    if (currentChapter && currentChapter.id !== chapter.id && referenceDirty && !referenceSavePending) {
      saveReferenceMutation.mutate({
        chapterId: currentChapter.id,
        text: referenceText,
      });
    }
    setCurrentChapterId(chapter.id);
  };

  // 章节加载/切换时重置编辑态；空白初稿铺满 20 行编号空行（trim 判空，不触发自动保存）。
  const loadedChapterRef = useRef<string | null>(null);
  useEffect(() => {
    if (!currentChapter || loadedChapterRef.current === currentChapter.id) {
      return;
    }
    loadedChapterRef.current = currentChapter.id;
    const expectation = currentChapter.expectation ?? "";
    setExpectationText(expectation.trim() ? expectation : "\n".repeat(DEFAULT_LINE_COUNT - 1));
    setReferenceTextState(currentChapter.referenceText ?? "");
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
        throw new Error("还没有章节。");
      }
      if (!expectationText.trim()) {
        throw new Error("本章还没有初稿。");
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
      toast.success(`AI 已解析出 ${draft.length} 拍草稿，确认前可逐拍修改。`);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "解析失败，请稍后重试。"),
  });

  const saveBeatsMutation = useMutation({
    mutationFn: () => {
      if (!currentChapter) {
        throw new Error("还没有章节。");
      }
      const count = beats?.length ?? 0;
      if (count < 3 || count > 10) {
        throw new Error("节拍需要 3～10 拍。");
      }
      return saveChapterDetailOutline(novelId, currentChapter.id, {
        beats: (beats ?? []).map((beat) => ({ summary: beat.summary, keyEvent: beat.keyEvent })),
        notes: notes.trim() || null,
      });
    },
    onSuccess: async () => {
      await invalidateChapters();
      toast.success("本章节拍已保存。");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "保存节拍失败，请重试。"),
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
    applyExpectationText,
    expectationDirty,
    savePending,
    flushExpectationSave,
    referenceText,
    setReferenceText,
    referenceDirty,
    referenceSavePending,
    flushReferenceSave,
    referenceExtractionJson,
    applyReferenceExtraction,
    syncReferenceExtraction,
    refreshChapters: invalidateChapters,
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
