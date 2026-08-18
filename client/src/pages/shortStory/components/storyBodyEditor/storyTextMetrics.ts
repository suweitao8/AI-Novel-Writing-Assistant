/**
 * 短篇"编辑正文"的文本度量纯函数。
 *
 * 两种口径并存是刻意的：
 * - 统计口径（字数/行数/段落）与服务端 continuousContent 一致：trim、滤空、`\n\n` 连接，
 *   保证底部状态栏与服务端导出/续写看到的篇幅一致；
 * - 展示口径（行号、行:列）基于编辑器实际渲染的草稿原文：段间恰好一个空行，
 *   保证行号、光标行列与所见文本逐行对齐。
 */

export interface StorySegmentInput {
  id: string;
  content: string;
}

export interface TextMatch {
  start: number;
  end: number;
}

export interface TextMetrics {
  chars: number;
  lines: number;
  paragraphs: number;
}

export function buildContinuousText(
  segments: StorySegmentInput[],
  drafts: Record<string, string>,
): string {
  return segments
    .map((segment) => (drafts[segment.id] ?? segment.content).trim())
    .filter(Boolean)
    .join("\n\n");
}

export function buildDisplayText(draftList: string[]): string {
  return draftList.join("\n\n");
}

export function countLogicalLines(text: string): number {
  if (!text) {
    return 0;
  }
  return text.split("\n").length;
}

export function countTextMetrics(text: string): TextMetrics {
  const normalized = text.trim();
  if (!normalized) {
    return { chars: 0, lines: 0, paragraphs: 0 };
  }
  const paragraphs = normalized
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean).length;
  return {
    chars: text.replace(/\s+/g, "").length,
    lines: countLogicalLines(normalized),
    paragraphs,
  };
}

/**
 * 大小写不敏感的子串匹配；关键字含换行时不匹配（高亮按段内单行渲染，不支持跨行）。
 */
export function findTextMatches(text: string, keyword: string): TextMatch[] {
  const needle = keyword.trim();
  if (!needle || needle.includes("\n")) {
    return [];
  }
  const haystack = text.toLowerCase();
  const lowered = needle.toLowerCase();
  const matches: TextMatch[] = [];
  let cursor = 0;
  while (cursor + lowered.length <= haystack.length) {
    const found = haystack.indexOf(lowered, cursor);
    if (found === -1) {
      break;
    }
    matches.push({ start: found, end: found + needle.length });
    cursor = found + lowered.length;
  }
  return matches;
}

export interface LineCol {
  line: number;
  column: number;
}

export function offsetToLineCol(text: string, offset: number): LineCol {
  const clamped = Math.max(0, Math.min(offset, text.length));
  const before = text.slice(0, clamped);
  const line = (before.match(/\n/g)?.length ?? 0) + 1;
  const lastNewline = before.lastIndexOf("\n");
  return { line, column: clamped - lastNewline };
}

export interface SegmentOffset {
  startLine: number;
  startOffset: number;
}

/**
 * 每段草稿在展示口径全篇文本中的起始行号与起始字符偏移。
 * 起始行直接由展示文本反推（而非公式累计），保证连续空段等边界下与实际渲染行号一致。
 */
export function getSegmentOffsets(draftList: string[]): SegmentOffset[] {
  const display = buildDisplayText(draftList);
  const offsets: SegmentOffset[] = [];
  let offset = 0;
  for (const draft of draftList) {
    offsets.push({
      startLine: offsetToLineCol(display, offset).line,
      startOffset: offset,
    });
    offset += draft.length + 2;
  }
  return offsets;
}
