// 字幕断句与换行（移植自旧项目 mydrama export/narrated_timeline.py）。
// 红线：断句只改变分组，绝不改动文字；换行只插入换行符。字幕与音频共用同一时间轴，
// 因此断句必须与「一行台词 = 一段音频」的契约一致，禁止二次切分音频。

const SENTENCE_END_CHARS = "。！？!?…";
const CLAUSE_BREAK_CHARS = "，、,;；：:";
const QUOTE_PAIRS: Array<[string, string]> = [["“", "”"], ["「", "」"], ["『", "』"]];
const MIN_SENTENCE_CHARS = 8;
const MAX_SENTENCE_CHARS = 42;

function isSentenceEnd(char: string): boolean {
  return SENTENCE_END_CHARS.includes(char);
}

function isClauseBreak(char: string): boolean {
  return CLAUSE_BREAK_CHARS.includes(char);
}

function quoteDepthAfter(text: string, depth: number): number {
  for (const [open, close] of QUOTE_PAIRS) {
    if (text === open) {
      return depth + 1;
    }
    if (text === close && depth > 0) {
      return depth - 1;
    }
  }
  return depth;
}

/** 在引号外的句末标点处切分，标点保留，空片段丢弃。 */
function splitPreservingQuotes(text: string): string[] {
  const fragments: string[] = [];
  let buffer = "";
  let depth = 0;
  for (const char of text) {
    buffer += char;
    depth = quoteDepthAfter(char, depth);
    if (isSentenceEnd(char) && depth <= 0) {
      const fragment = buffer.trim();
      if (fragment) {
        fragments.push(fragment);
      }
      buffer = "";
    }
  }
  const tail = buffer.trim();
  if (tail) {
    fragments.push(tail);
  }
  return fragments;
}

/** 没有句末标点的超长子句，退到逗号/顿号等次级断点切开。 */
function breakLongClause(clause: string): string[] {
  const pieces: string[] = [];
  let buffer = "";
  for (const char of clause) {
    buffer += char;
    if (isClauseBreak(char) && buffer.trim().length >= MIN_SENTENCE_CHARS) {
      const piece = buffer.trim();
      if (piece) {
        pieces.push(piece);
      }
      buffer = "";
    }
  }
  const tail = buffer.trim();
  if (tail) {
    pieces.push(tail);
  }
  return pieces.length ? pieces : [clause.trim()];
}

/** 短碎片并入前一条，避免字幕出现一两个字的可读性灾难。 */
function mergeShortFragments(fragments: string[]): string[] {
  const merged: string[] = [];
  for (const fragment of fragments) {
    if (merged.length && fragment.length < MIN_SENTENCE_CHARS) {
      merged[merged.length - 1] = `${merged[merged.length - 1]}${fragment}`.trim();
    } else {
      merged.push(fragment);
    }
  }
  while (merged.length >= 2 && merged[merged.length - 1]!.length < MIN_SENTENCE_CHARS) {
    merged[merged.length - 2] = `${merged[merged.length - 2]!}${merged[merged.length - 1]!}`.trim();
    merged.pop();
  }
  return merged;
}

/** 把一段旁白切成字幕级句子：句末切分 → 超长再切 → 短碎片回并。空白返回空数组。 */
export function splitNarrationIntoSentences(text: string | null | undefined): string[] {
  const normalized = (text ?? "").trim();
  if (!normalized) {
    return [];
  }
  const refined: string[] = [];
  for (const fragment of splitPreservingQuotes(normalized)) {
    if (fragment.length > MAX_SENTENCE_CHARS) {
      refined.push(...breakLongClause(fragment));
    } else {
      refined.push(fragment);
    }
  }
  return mergeShortFragments(refined);
}

/** 中文按字符换行（不做分词），只插入换行符不改文字。 */
export function wrapSubtitleText(text: string, maxChars = 32): string {
  const width = Math.max(1, Math.floor(maxChars));
  const output: string[] = [];
  for (const rawLine of String(text ?? "").split(/\r?\n/)) {
    let line = rawLine;
    while (line.length > width) {
      output.push(line.slice(0, width));
      line = line.slice(width);
    }
    output.push(line);
  }
  return output.join("\n");
}
