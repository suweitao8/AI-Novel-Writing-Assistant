import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { previewChapterReferenceDraft } from "@/api/novel/chapters";
import { toast } from "@/components/ui/toast";
import type { NovelChapterWorkspace } from "@/pages/drama/comicDrama/hooks/useNovelChapterWorkspace";

// 参考文本按「小说+章」存浏览器本地：粘贴即保存（写穿，无保存按钮），
// 切章时换入对应章的参考文本，刷新/重开不丢。不落服务端——它是解析用的
// 临时素材，正式产物是写入 Chapter.expectation 的初稿。
function referenceStorageKey(novelId: string, chapterId: string): string {
  return `drama-studio-reference:${novelId}:${chapterId}`;
}

// 「参考」页签的解析管线：把粘贴的参考小说原文 AI 压缩成本章初稿。
// 状态放在页级 hook：子页签行右侧的「解析」按钮与替换确认弹窗共享同一份 mutation，
// 切换子页签不丢参考文本；解析结果写入初稿并立即落库（applyExpectationText）。
export function useReferenceDraftStage(input: {
  novelId: string;
  workspace: NovelChapterWorkspace;
  onApplied: () => void;
}) {
  const { workspace } = input;
  const [referenceText, setReferenceTextState] = useState("");
  const [pendingDraft, setPendingDraft] = useState<string | null>(null);
  const chapter = workspace.currentChapter;
  const chapterId = chapter?.id ?? null;
  const trimmedReference = referenceText.trim();

  // 切章时载入该章已保存的参考文本（没有则空）。
  useEffect(() => {
    if (!chapterId) {
      setReferenceTextState("");
      return;
    }
    try {
      setReferenceTextState(window.localStorage.getItem(referenceStorageKey(input.novelId, chapterId)) ?? "");
    } catch {
      setReferenceTextState("");
    }
  }, [chapterId, input.novelId]);

  // 粘贴/修改即写穿本地存储（文本量小，同步写开销可忽略；私有模式等失败静默）。
  const setReferenceText = (value: string) => {
    setReferenceTextState(value);
    if (chapterId) {
      try {
        window.localStorage.setItem(referenceStorageKey(input.novelId, chapterId), value);
      } catch {
        // 本地存储不可用时仅保留内存态
      }
    }
  };

  const applyDraft = (draftText: string, lineCount: number) => {
    workspace.applyExpectationText(draftText);
    toast.success(`已写入初稿，共 ${lineCount} 行。`);
    input.onApplied();
  };

  const parseMutation = useMutation({
    mutationFn: async () => {
      if (!chapter) {
        throw new Error("还没有章节。");
      }
      return previewChapterReferenceDraft(input.novelId, chapter.id, trimmedReference);
    },
    onSuccess: (response) => {
      const draftText = response.data?.draftText ?? "";
      const lineCount = response.data?.segments.length ?? draftText.split("\n").length;
      if (!draftText.trim()) {
        toast.error("AI 没有生成初稿，请重试。");
        return;
      }
      if (workspace.expectationText.trim()) {
        setPendingDraft(draftText);
        return;
      }
      applyDraft(draftText, lineCount);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "解析失败，请重试。"),
  });

  const parseDisabledReason = !chapter
    ? "还没有章节。"
    : !trimmedReference
      ? "还没有粘贴参考内容。"
      : null;

  return {
    referenceText,
    setReferenceText,
    parseMutation,
    parseDisabledReason,
    pendingDraft,
    setPendingDraft,
    applyDraft,
  };
}

export type ReferenceDraftStage = ReturnType<typeof useReferenceDraftStage>;
