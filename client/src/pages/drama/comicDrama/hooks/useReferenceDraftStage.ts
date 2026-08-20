import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { getKnowledgeDocument } from "@/api/knowledge";
import { previewChapterReferenceDraft } from "@/api/novel/chapters";
import { toast } from "@/components/ui/toast";
import type { NovelChapterWorkspace } from "@/pages/drama/comicDrama/hooks/useNovelChapterWorkspace";

// 参考文本服务端持久化：本章参考正文存 Chapter.referenceText（PUT /chapters/:id，
// 1.2s 防抖静默保存），整本「原始参考小说」存知识库文档（创建漫剧时上传）；
// 本章没有自己的参考文本时，编辑器回落展示整本小说开头，编辑即落到本章字段。
// 不再使用浏览器 localStorage——内嵌浏览器的本地存储不可靠（写入静默失败/重载即丢），
// 已踩过：参考文本与提取建议凭空消失。
const REFERENCE_AUTOSAVE_DELAY_MS = 1200;

// 整本参考小说文档查询键（「参考」回退与新建章节标题预填共用一份缓存）。
export const referenceDocQueryKey = (docId: string | null) => ["drama-reference-doc", docId] as const;

// —— 参考小说章节标题提取：新建第 N 章时按「第N章/回/节 标题」行取对应章名。
// 标题行是小说文本的强约定，属确定性解析（非 AI 决策路径）；全篇没有「第N章」式
// 标题时退回「N、标题 / N. 标题」编号式，仍无匹配则留空由用户填写。
const CHAPTER_HEADING_PATTERN = /^[ \t]*第\s*([0-9零〇一二两三四五六七八九十百千万]+)\s*[章回节][ \t]*[:：、．.，,\-—–]?[ \t]*(.*?)[ \t]*$/;
const NUMBERED_HEADING_PATTERN = /^[ \t]*(\d{1,4})[ \t]*[、.．)）][ \t]*(.*?)[ \t]*$/;

function chineseChapterNumber(raw: string): number | null {
  if (/^\d{1,4}$/.test(raw)) {
    return Number(raw);
  }
  if (!/^[零〇一二两三四五六七八九十百千万]+$/.test(raw)) {
    return null;
  }
  const digits: Record<string, number> = { 零: 0, 〇: 0, 一: 1, 两: 2, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  const units: Record<string, number> = { 十: 10, 百: 100, 千: 1000 };
  let total = 0;
  let section = 0;
  let current = 0;
  for (const ch of raw) {
    if (ch === "万") {
      section = (section + current) * 10000;
      total += section;
      section = 0;
      current = 0;
    } else if (units[ch] !== undefined) {
      current = current || 1;
      section += current * units[ch];
      current = 0;
    } else if (digits[ch] !== undefined) {
      current = digits[ch];
    }
  }
  const value = total + section + current;
  return value > 0 ? value : null;
}

export function collectReferenceChapterTitles(source: string): Map<number, string> {
  const titles = new Map<number, string>();
  const record = (rawNumber: string, rawTitle: string) => {
    const number = chineseChapterNumber(rawNumber);
    const title = rawTitle.trim().slice(0, 60);
    if (number !== null && number >= 1 && title && !titles.has(number)) {
      titles.set(number, title);
    }
  };
  let sawChapterHeading = false;
  for (const line of source.split(/\r?\n/)) {
    const chapterMatch = CHAPTER_HEADING_PATTERN.exec(line);
    if (chapterMatch) {
      sawChapterHeading = true;
      record(chapterMatch[1], chapterMatch[2] ?? "");
      continue;
    }
    if (!sawChapterHeading) {
      const numberedMatch = NUMBERED_HEADING_PATTERN.exec(line);
      if (numberedMatch) {
        record(numberedMatch[1], numberedMatch[2] ?? "");
      }
    }
  }
  return titles;
}

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
  const chapter = workspace.currentChapter;

  // 整本参考小说（创建漫剧时上传，知识库文档服务端存档）。
  const referenceDocQuery = useQuery({
    queryKey: referenceDocQueryKey(input.referenceDocId),
    queryFn: () => getKnowledgeDocument(input.referenceDocId as string),
    enabled: Boolean(input.referenceDocId),
    staleTime: 5 * 60 * 1000,
  });
  const sourceFallbackText = useMemo(() => {
    const versions = referenceDocQuery.data?.data?.versions ?? [];
    const activeVersion = versions.find((version) => version.isActive) ?? versions[versions.length - 1];
    return (activeVersion?.content ?? "").slice(0, 20000);
  }, [referenceDocQuery.data]);

  // 本章已有参考文本用本章的；否则回落展示整本小说开头（编辑后落到本章字段）。
  const referenceText = workspace.referenceText.trim() ? workspace.referenceText : sourceFallbackText;
  const trimmedReference = referenceText.trim();

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

  return {
    referenceText,
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
