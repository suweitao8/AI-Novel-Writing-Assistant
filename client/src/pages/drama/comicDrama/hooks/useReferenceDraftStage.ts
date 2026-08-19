import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { previewChapterReferenceDraft } from "@/api/novel/chapters";
import { toast } from "@/components/ui/toast";
import type { NovelChapterWorkspace } from "@/pages/drama/comicDrama/hooks/useNovelChapterWorkspace";

// 「参考」页签的解析管线：把粘贴的参考小说原文 AI 压缩成本章初稿。
// 状态放在页级 hook：子页签行右侧的「解析」按钮与替换确认弹窗共享同一份 mutation，
// 切换子页签不丢参考文本；解析结果写入初稿并立即落库（applyExpectationText）。
export function useReferenceDraftStage(input: {
  novelId: string;
  workspace: NovelChapterWorkspace;
  onApplied: () => void;
}) {
  const { workspace } = input;
  const [referenceText, setReferenceText] = useState("");
  const [pendingDraft, setPendingDraft] = useState<string | null>(null);
  const chapter = workspace.currentChapter;
  const trimmedReference = referenceText.trim();

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
