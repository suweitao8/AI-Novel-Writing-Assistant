// —— 参考小说按章节切分（确定性解析，非 AI 路径）——
// 章节标题行是小说文本的强约定：优先「第N章/回/节 标题」（中文数字到 9999），
// 全篇没有「第N章」式标题时退回「N、/N. 标题」编号式（且要求至少两处，单处无切分意义）。
// 工作室第 N 章的参考文本 = 参考小说第 N 章的切分段落；切分不出章节的文本按整本对待。
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

export interface ReferenceChapterSegment {
  number: number;
  title: string;
  /** 章节正文（含标题行，到下一章标题行之前），已去除首尾空白 */
  text: string;
}

interface HeadingHit {
  number: number;
  title: string;
  lineIndex: number;
}

// 「第N章」式标题出现前才承认编号式标题（与标题预填的解析规则一致）。
function collectHeadingHits(lines: string[]): { chapterHits: HeadingHit[]; numberedHits: HeadingHit[] } {
  const chapterHits: HeadingHit[] = [];
  const numberedHits: HeadingHit[] = [];
  let sawChapterHeading = false;
  lines.forEach((line, index) => {
    const chapterMatch = CHAPTER_HEADING_PATTERN.exec(line);
    if (chapterMatch) {
      const number = chineseChapterNumber(chapterMatch[1]);
      const title = (chapterMatch[2] ?? "").trim();
      if (number !== null && number >= 1) {
        sawChapterHeading = true;
        chapterHits.push({ number, title, lineIndex: index });
      }
      return;
    }
    if (!sawChapterHeading) {
      const numberedMatch = NUMBERED_HEADING_PATTERN.exec(line);
      if (numberedMatch) {
        const number = Number(numberedMatch[1]);
        const title = (numberedMatch[2] ?? "").trim();
        if (Number.isInteger(number) && number >= 1) {
          numberedHits.push({ number, title, lineIndex: index });
        }
      }
    }
  });
  return { chapterHits, numberedHits };
}

// 把参考小说切成按序的章节段。重复章号（作者标错）以首次出现为准，后出现的并入前段。
export function splitReferenceChapters(source: string): ReferenceChapterSegment[] {
  if (!source.trim()) {
    return [];
  }
  const lines = source.split(/\r?\n/);
  const { chapterHits, numberedHits } = collectHeadingHits(lines);
  const hits = chapterHits.length > 0 ? chapterHits : numberedHits.length >= 2 ? numberedHits : [];
  if (hits.length === 0) {
    return [];
  }

  const segments: ReferenceChapterSegment[] = [];
  const seenNumbers = new Set<number>();
  for (let index = 0; index < hits.length; index += 1) {
    const hit = hits[index];
    if (seenNumbers.has(hit.number)) {
      continue;
    }
    seenNumbers.add(hit.number);
    // 段落到原始标题序列的下一行标题为止（重复章号的标题行不成为段落，其内容不并入前章）。
    const endLine = index + 1 < hits.length ? hits[index + 1].lineIndex : lines.length;
    const text = lines.slice(hit.lineIndex, endLine).join("\n").trim();
    if (!text) {
      continue;
    }
    segments.push({ number: hit.number, title: hit.title.slice(0, 60), text });
  }
  return segments;
}

// 新建第 N 章时按切分结果取对应章名（无匹配则留空由用户填写）。
export function collectReferenceChapterTitles(source: string): Map<number, string> {
  const titles = new Map<number, string>();
  for (const segment of splitReferenceChapters(source)) {
    if (segment.title && !titles.has(segment.number)) {
      titles.set(segment.number, segment.title);
    }
  }
  return titles;
}
