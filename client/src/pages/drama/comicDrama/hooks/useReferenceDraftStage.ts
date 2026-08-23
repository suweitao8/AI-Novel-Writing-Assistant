import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { getKnowledgeDocument } from "@/api/knowledge";
import { previewChapterReferenceParse, updateNovelChapter } from "@/api/novel/chapters";
import { toast } from "@/components/ui/toast";
import type { NovelChapterWorkspace } from "@/pages/drama/comicDrama/hooks/useNovelChapterWorkspace";
import { splitReferenceChapters } from "@/pages/drama/comicDrama/hooks/referenceChapters";
import { normalizeExtraction, parseReferenceExtraction } from "@/pages/drama/comicDrama/hooks/useReferenceExtractStage";

export { collectReferenceChapterTitles } from "@/pages/drama/comicDrama/hooks/referenceChapters";

// 参考文本：本章正文存 Chapter.referenceText（PUT /chapters/:id，1.2s 防抖静默保存），
// 编辑器里是什么，解析/提取就用什么——没有任何隐藏回落。参考小说（知识库文档，
// 创建漫剧时上传）只通过子页签行右侧的「引用」按钮显式带入：按章节标题确定性切分，
// 第 N 章引用参考小说第 N 章；切不出章节结构的文件引用整本（截前 2 万字）。
// 不使用浏览器 localStorage——内嵌浏览器的本地存储不可靠（写入静默失败/重载即丢），
// 已踩过：参考文本与提取建议凭空消失。
const REFERENCE_AUTOSAVE_DELAY_MS = 1200;

// 整本参考小说文档查询键（「引用」与新建章节标题预填共用一份缓存）。
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

  // 「引用」带入的源文本：参考小说按章节切分后取与本章同序号的章节；
  // 本章序号超出章节数时无内容（按钮禁用）；文件无章节结构时退整本（截前 2 万字）。
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
  const injectSourceText = matchedSourceChapter
    ? matchedSourceChapter.text.slice(0, 20000)
    : sourceChapterTotal === 0
      ? (activeDocVersion?.content ?? "").slice(0, 20000)
      : "";

  const hasReferenceDoc = Boolean(input.referenceDocId);
  const injectDisabled = referenceDocQuery.isPending || !injectSourceText.trim();
  const injectTitle = matchedSourceChapter
    ? `引用《${sourceDocTitle}》第 ${chapterOrder} 章`
    : sourceChapterTotal > 0
      ? `《${sourceDocTitle}》共 ${sourceChapterTotal} 章，没有第 ${chapterOrder} 章`
      : `引用整本《${sourceDocTitle}》`;

  // 解析与提取用的参考文本 = 编辑器内容，没有隐藏回落。
  const referenceText = workspace.referenceText;
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
    // 冲保存的排队/去重逻辑在 workspace.flushReferenceSave 内部处理（含在途请求时排队补存）。
    autosaveRef.current.flush();
  }, []);

  const setReferenceText = (value: string) => {
    workspace.setReferenceText(value.slice(0, 20000));
  };

  // 「引用」：把参考小说对应章节（替换式）写入本章参考文本并随自动保存落库。
  const injectReferenceSource = () => {
    if (!injectSourceText.trim()) {
      return;
    }
    workspace.setReferenceText(injectSourceText);
  };

  // 「解析」一次大模型调用同时产出初稿与设定提取（reference_parse，2026-08-20
  // 起由两个并行调用合并——参考文本量不大，单次调用共享同一份原文理解）。
  // 落库放在 mutationFn 里而不是 onSuccess：解析要跑几十秒，期间离开页面组件
  // 卸载后回调不再执行，放回调里的保存会凭空丢（已踩：提取结果消失）。
  // 脚本整章覆盖是既定行为（2026-08-21 用户决定：重新解析即对现有结果不满意，结果一到即重写）。
  // 耗时（2026-08-23 用户要求）：进行中按秒实时显示已等多久；完成后把本次用时写进
  // 提取结果（parseDurationMs）随章节持久化，刷新/换章回来仍能看到「上次解析」用时。
  const parseMutation = useMutation({
    mutationFn: async () => {
      if (!chapter) {
        throw new Error("还没有章节。");
      }
      await workspace.flushExpectationSave();
      const startedAt = Date.now();
      const parseResponse = await previewChapterReferenceParse(input.novelId, chapter.id, trimmedReference);
      const draftText = parseResponse.data?.draftText ?? "";
      const extraction = normalizeExtraction(parseResponse.data?.extraction ?? null);
      const parseDurationMs = Math.max(1, Date.now() - startedAt);
      const extractionJson = JSON.stringify({ ...extraction, parseDurationMs });
      const hasDraft = draftText.trim().length > 0;
      try {
        await updateNovelChapter(input.novelId, chapter.id, {
          referenceExtractionJson: extractionJson,
          ...(hasDraft ? { expectation: draftText } : {}),
        });
      } catch (error) {
        throw new Error(`解析完成，但保存结果失败：${error instanceof Error ? error.message : "请重试。"}`);
      }
      await workspace.refreshChapters();
      return { draftText, extractionJson, extraction: { ...extraction, parseDurationMs }, hasDraft, parseDurationMs };
    },
    onSuccess: ({ draftText, extractionJson, extraction, hasDraft, parseDurationMs }) => {
      workspace.syncReferenceExtraction(extractionJson);
      if (hasDraft) {
        // expectation 已随上面的合并 PUT 落库：只同步展示与已派发标记，不再触发第二次保存。
        workspace.syncExpectationText(draftText);
      }
      const extractSummary = `角色 ${extraction.characters.length}、场景 ${extraction.scenes.length}、道具 ${extraction.props.length}、世界观 ${extraction.worldview.length}`;
      const durationLabel = formatDurationMs(parseDurationMs);

      if (!hasDraft) {
        toast.error(`AI 没有生成脚本（用时 ${durationLabel}）；提取完成：${extractSummary}。`);
        return;
      }
      const shotCount = draftText.split(/\r?\n/).filter((line) => /^[ \t]*分镜[：:]/.test(line)).length;
      toast.success(`已重写本章脚本（${shotCount} 个分镜，用时 ${durationLabel}）；提取：${extractSummary}。`);
      input.onApplied();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "解析失败，请重试。"),
  });

  const parseDisabledReason = !chapter
    ? "还没有章节。"
    : !trimmedReference
      ? "还没有参考内容。"
      : null;

  // 解析进行中的实时已等秒数：mutation 挂起期间每秒跳一次，结束即停（组件常驻页级 hook，
  // 切换子页签不重置；重新解析自动从 0 重新计）。
  const [parseElapsedSeconds, setParseElapsedSeconds] = useState(0);
  const parsePending = parseMutation.isPending;
  useEffect(() => {
    if (!parsePending) {
      return;
    }
    const startedAt = Date.now();
    setParseElapsedSeconds(0);
    const timer = setInterval(() => {
      setParseElapsedSeconds(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    }, 1000);
    return () => clearInterval(timer);
  }, [parsePending]);

  // 「上次解析」用时：从章节已保存的提取结果里读（parseDurationMs），刷新/换章后仍在。
  const lastParseDurationLabel = useMemo(
    () => formatDurationMs(parseReferenceExtraction(workspace.referenceExtractionJson).parseDurationMs),
    [workspace.referenceExtractionJson],
  );

  return {
    referenceText,
    setReferenceText,
    parseMutation,
    parseDisabledReason,
    // 解析计时：进行中显示已等秒数，完成后显示上次解析用时
    parseElapsedLabel: parsePending ? `解析中 ${formatSeconds(parseElapsedSeconds)}` : null,
    lastParseDurationLabel,
    // 「引用」参考小说对应章节
    hasReferenceDoc,
    injectReferenceSource,
    injectDisabled,
    injectTitle,
  };
}

/** 秒数 → 「12 秒 / 1 分 23 秒」；毫秒先行取整，<1s 记 1 秒（解析不存在亚秒完成）。
 * 与 assetForms 生成计时、AICockpit 耗时同一格式。 */
export function formatSeconds(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds));
  if (seconds < 60) {
    return `${seconds} 秒`;
  }
  const minutes = Math.floor(seconds / 60);
  const restSeconds = seconds % 60;
  return restSeconds > 0 ? `${minutes} 分 ${restSeconds} 秒` : `${minutes} 分`;
}

export function formatDurationMs(value: unknown): string | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return null;
  }
  return formatSeconds(value / 1000);
}

export type ReferenceDraftStage = ReturnType<typeof useReferenceDraftStage>;
