import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { getKnowledgeDocument } from "@/api/knowledge";
import { previewChapterReferenceDraft } from "@/api/novel/chapters";
import { toast } from "@/components/ui/toast";
import type { NovelChapterWorkspace } from "@/pages/drama/comicDrama/hooks/useNovelChapterWorkspace";
import { splitReferenceChapters } from "@/pages/drama/comicDrama/hooks/referenceChapters";

export { collectReferenceChapterTitles } from "@/pages/drama/comicDrama/hooks/referenceChapters";

// 参考文本服务端持久化：本章参考正文存 Chapter.referenceText（PUT /chapters/:id，
// 1.2s 防抖静默保存），整本「原始参考小说」存知识库文档（创建漫剧时上传）。
// 本章没有自己的参考文本时，「参考」页签只读展示**参考小说中与本章同序号的章节**
// （解析/提取直接用它），一键「复制为本章参考」或粘贴新文本后才进入可编辑态——
// 不把整本当可编辑框展示（往里粘贴同一本小说会叠出多份重复），也不把整本
// （含后面章节）当本章参考（第 1 章只该参考第 1 章的内容）。
// 不使用浏览器 localStorage——内嵌浏览器的本地存储不可靠（写入静默失败/重载即丢），
// 已踩过：参考文本与提取建议凭空消失。
const REFERENCE_AUTOSAVE_DELAY_MS = 1200;

// 整本参考小说文档查询键（「参考」回退与新建章节标题预填共用一份缓存）。
export const referenceDocQueryKey = (docId: string | null) => ["drama-reference-doc", docId] as const;

// 「参考」页签的解析管线：把参考小说原文 AI 改编成本章分镜式初稿。
// 状态放在页级 hook：子页签行右侧的「解析」按钮与替换确认弹窗共享同一份 mutation，
// 切换子页签不丢参考文本；解析结果写入初稿并立即落库（applyExpectationText）。
export function useReferenceDraftStage(input: {
  novelId: string;
  workspace: NovelChapterWorkspace;
  referenceDocId: string | null;
  onApplied: () => void;
}) {
  const { workspace } = input;
  const [pendingDraft, setPendingDraft] = useState<string | null>(null);
  // 本章没有参考文本时，「参考」页签先只读展示参考小说对应章节；用户点「粘贴新文本」
  // 后才进入空白可编辑态。避免把参考内容当可编辑框展示——往里粘贴会叠出重复文本。
  const [referenceEditIntent, setReferenceEditIntent] = useState(false);
  const chapter = workspace.currentChapter;

  // 整本参考小说（创建漫剧时上传，知识库文档服务端存档）。
  const referenceDocQuery = useQuery({
    queryKey: referenceDocQueryKey(input.referenceDocId),
    queryFn: () => getKnowledgeDocument(input.referenceDocId as string),
    enabled: Boolean(input.referenceDocId),
    staleTime: 5 * 60 * 1000,
  });
  const activeDocVersion = useMemo(() => {
    const versions = referenceDocQuery.data?.data?.versions ?? [];
    return versions.find((version) => version.isActive) ?? versions[versions.length - 1] ?? null;
  }, [referenceDocQuery.data]);
  const sourceDocTitle = referenceDocQuery.data?.data?.title ?? "参考小说";

  // 按章节切分参考小说；本章（第 N 章）回落到同序号章节，切分不出章节才按整本对待。
  const sourceChapterSegments = useMemo(
    () => splitReferenceChapters(activeDocVersion?.content ?? ""),
    [activeDocVersion],
  );
  const sourceChapterTotal = sourceChapterSegments.length;
  const chapterOrder = chapter?.order ?? 1;
  const matchedSourceChapter = useMemo(
    () => sourceChapterSegments.find((segment) => segment.number === chapterOrder) ?? null,
    [sourceChapterSegments, chapterOrder],
  );
  // 源文本（预览/复制/回落用）：优先本章对应章节；小说无章节结构时退整本（截前 2 万字）。
  const sourceFallbackText = matchedSourceChapter
    ? matchedSourceChapter.text.slice(0, 20000)
    : sourceChapterTotal === 0
      ? (activeDocVersion?.content ?? "").slice(0, 20000)
      : "";
  const sourceCharCount = matchedSourceChapter
    ? matchedSourceChapter.text.length
    : sourceChapterTotal === 0
      ? (activeDocVersion?.charCount ?? activeDocVersion?.content?.length ?? 0)
      : 0;

  // 解析与提取用的「有效参考文本」：本章有自己的参考文本用本章的，否则用回落源文本。
  const hasChapterReference = workspace.referenceText.trim().length > 0;
  const referenceText = hasChapterReference ? workspace.referenceText : sourceFallbackText;
  const trimmedReference = referenceText.trim();
  // 「参考」页签编辑器的值：preview 模式传 null（只读展示源文本，不进编辑器）。
  const referenceEditorValue = hasChapterReference ? workspace.referenceText : referenceEditIntent ? "" : null;
  const referenceSourceHint = hasChapterReference
    ? `将使用本章参考文本（约 ${workspace.referenceText.trim().length.toLocaleString()} 字）`
    : matchedSourceChapter
      ? `本章没有单独的参考文本，将使用《${sourceDocTitle}》第 ${chapterOrder} 章（约 ${sourceCharCount.toLocaleString()} 字）`
      : sourceChapterTotal > 0
        ? `《${sourceDocTitle}》共解析出 ${sourceChapterTotal} 章，本章（第 ${chapterOrder} 章）没有对应的参考内容`
        : sourceCharCount > 0
          ? `本章没有单独的参考文本，将使用整本《${sourceDocTitle}》（约 ${sourceCharCount.toLocaleString()} 字）`
          : "还没有可用的参考内容";

  // 参考文本防抖自动保存到 Chapter.referenceText（服务端），卸载时冲保存避免丢稿。
  const referenceDirty = workspace.referenceDirty;
  const referenceSavePending = workspace.referenceSavePending;
  const autosaveRef = useRef({ dirty: referenceDirty, pending: referenceSavePending, flush: workspace.flushReferenceSave });
  autosaveRef.current = { dirty: referenceDirty, pending: referenceSavePending, flush: workspace.flushReferenceSave };

  useEffect(() => {
    if (!referenceDirty || referenceSavePending) {
      return;
    }
    const timer = setTimeout(() => autosaveRef.current.flush(), REFERENCE_AUTOSAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [workspace.referenceText, referenceDirty, referenceSavePending]);

  useEffect(() => () => {
    const { dirty, pending, flush } = autosaveRef.current;
    if (dirty && !pending) {
      flush();
    }
  }, []);

  const setReferenceText = (value: string) => {
    workspace.setReferenceText(value.slice(0, 20000));
  };

  const applyDraft = (draftText: string) => {
    workspace.applyExpectationText(draftText);
    const shotCount = draftText.split(/\r?\n/).filter((line) => /^[ \t]*分镜[：:]/.test(line)).length;
    toast.success(shotCount > 0 ? `已写入初稿，共 ${shotCount} 个分镜。` : "已写入初稿。");
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
      if (!draftText.trim()) {
        toast.error("AI 没有生成初稿，请重试。");
        return;
      }
      if (workspace.expectationText.trim()) {
        setPendingDraft(draftText);
        return;
      }
      applyDraft(draftText);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "解析失败，请重试。"),
  });

  const parseDisabledReason = !chapter
    ? "还没有章节。"
    : !trimmedReference
      ? "还没有粘贴参考内容。"
      : null;

  // 把回落源文本（本章对应章节，或无章节结构时的整本）复制成本章参考文本
  // （超过上限取开头 2 万字），复制后随自动保存落库。
  const copySourceToChapter = () => {
    if (!sourceFallbackText.trim()) {
      return;
    }
    workspace.setReferenceText(sourceFallbackText);
  };

  return {
    referenceText,
    referenceEditorValue,
    hasChapterReference,
    referenceEditIntent,
    beginReferenceEdit: () => setReferenceEditIntent(true),
    copySourceToChapter,
    sourceDocTitle,
    sourceCharCount,
    sourceDocLoading: referenceDocQuery.isPending,
    sourcePreviewText: sourceFallbackText,
    referenceSourceHint,
    // 参考小说章节切分信息：预览文案按「本章对应章节」还是「整本」展示。
    sourceChapterTotal,
    sourceChapterMatched: matchedSourceChapter !== null,
    sourceChapterNumber: chapterOrder,
    sourceChapterTitle: matchedSourceChapter?.title ?? "",
    setReferenceText,
    sourceFallbackText,
    parseMutation,
    parseDisabledReason,
    pendingDraft,
    setPendingDraft,
    applyDraft,
  };
}

export type ReferenceDraftStage = ReturnType<typeof useReferenceDraftStage>;
