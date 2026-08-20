import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { previewChapterReferenceDraft } from "@/api/novel/chapters";
import { toast } from "@/components/ui/toast";
import type { NovelChapterWorkspace } from "@/pages/drama/comicDrama/hooks/useNovelChapterWorkspace";

// 参考文本按「小说+章」存浏览器本地：粘贴即保存（写穿，无保存按钮），
// 切章时换入对应章的参考文本，刷新/重开不丢。不落服务端——它是解析用的
// 临时素材，正式产物是写入 Chapter.expectation 的初稿。
// NOVEL_REFERENCE_SOURCE_SLOT 是项目级「原始参考小说」槽位：创建漫剧时拖入的
// 现成小说正文存在这里；某章还没有自己的参考文本时回落到它（截取本章相关部分）。
export const NOVEL_REFERENCE_SOURCE_SLOT = "source";

export function referenceStorageKey(novelId: string, chapterId: string): string {
  return `drama-studio-reference:${novelId}:${chapterId}`;
}

// —— 参考小说章节标题提取：新建第 N 章时按「第N章/回/节 标题」行取对应章名。
// 标题行是小说文本的强约定，属确定性解析（非 AI 决策路径）；全篇没有「第N章」式
// 标题时退回「N、标题 / N. 标题」编号式，仍无匹配则留空由用户填写。
const CHAPTER_HEADING_PATTERN = /^[ 	]*第\s*([0-9零〇一二两三四五六七八九十百千万]+)\s*[章回节][ 	]*[:：、．.，,\-—–]?[ 	]*(.*?)[ 	]*$/;
const NUMBERED_HEADING_PATTERN = /^[ 	]*(\d{1,4})[ 	]*[、.．)）][ 	]*(.*?)[ 	]*$/;

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

function collectReferenceChapterTitles(source: string): Map<number, string> {
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

// 新建第 order 章时从项目参考源取对应章节标题；没有参考源或没找到返回空串。
export function findReferenceChapterTitle(novelId: string, order: number): string {
  if (order < 1) {
    return "";
  }
  let source: string | null = null;
  try {
    source = window.localStorage.getItem(referenceStorageKey(novelId, NOVEL_REFERENCE_SOURCE_SLOT));
  } catch {
    return "";
  }
  if (!source) {
    return "";
  }
  return collectReferenceChapterTitles(source).get(order) ?? "";
}

function readStoredReference(novelId: string, chapterId: string): string {
  try {
    const stored = window.localStorage.getItem(referenceStorageKey(novelId, chapterId));
    if (stored !== null) {
      return stored;
    }
    return window.localStorage.getItem(referenceStorageKey(novelId, NOVEL_REFERENCE_SOURCE_SLOT)) ?? "";
  } catch {
    return "";
  }
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

  // 切章时载入该章已保存的参考文本；该章没有则回落到创建时上传的整本参考小说。
  useEffect(() => {
    if (!chapterId) {
      setReferenceTextState("");
      return;
    }
    setReferenceTextState(readStoredReference(input.novelId, chapterId));
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
    parseMutation,
    parseDisabledReason,
    pendingDraft,
    setPendingDraft,
    applyDraft,
  };
}

export type ReferenceDraftStage = ReturnType<typeof useReferenceDraftStage>;
