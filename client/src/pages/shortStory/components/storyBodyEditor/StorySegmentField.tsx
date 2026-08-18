import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { TextMatch } from "./storyTextMetrics";

interface StorySegmentFieldProps {
  value: string;
  startLine: number;
  matches: TextMatch[];
  activeMatchIndex: number | null;
  currentLine: number | null;
  onChange: (next: string) => void;
  onCaretChange: (offset: number | null) => void;
}

// 高亮背板与 textarea 必须逐像素同排版才能重叠对齐；该常量是两层排版的唯一来源。
const FIELD_TEXT_CLASS = "font-sans text-[16px] leading-8 break-words px-5 py-3";

function renderLineContent(
  line: string,
  lineStart: number,
  matches: TextMatch[],
  activeMatchIndex: number | null,
  attachActiveMark: (node: HTMLElement | null) => void,
): ReactNode {
  const lineEnd = lineStart + line.length;
  const hits = matches
    .map((match, index) => ({ match, index }))
    .filter(({ match }) => match.start >= lineStart && match.end <= lineEnd);
  if (hits.length === 0) {
    return line.length > 0 ? line : "\u200b";
  }
  const parts: ReactNode[] = [];
  let cursor = lineStart;
  for (const { match, index } of hits) {
    if (match.start > cursor) {
      parts.push(line.slice(cursor - lineStart, match.start - lineStart));
    }
    parts.push(
      <mark
        key={index}
        ref={index === activeMatchIndex ? attachActiveMark : undefined}
        className={cn(
          "rounded-[2px] bg-primary/25 text-transparent",
          index === activeMatchIndex
            && "bg-amber-300/80 ring-1 ring-amber-500/90 dark:bg-amber-500/40 dark:ring-amber-400/80",
        )}
      >
        {line.slice(match.start - lineStart, match.end - lineStart)}
      </mark>,
    );
    cursor = match.end;
  }
  if (cursor < lineEnd) {
    parts.push(line.slice(cursor - lineStart));
  }
  return parts;
}

export default function StorySegmentField(props: StorySegmentFieldProps) {
  const { value, startLine, matches, activeMatchIndex, currentLine, onChange, onCaretChange } = props;
  const lines = useMemo(() => value.split("\n"), [value]);
  const lineStarts = useMemo(() => {
    const starts: number[] = [];
    let offset = 0;
    for (const line of lines) {
      starts.push(offset);
      offset += line.length + 1;
    }
    return starts;
  }, [lines]);

  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const lineRefs = useRef<Array<HTMLDivElement | null>>([]);
  const activeMarkRef = useRef<HTMLElement | null>(null);
  const [lineTops, setLineTops] = useState<number[]>([]);

  useLayoutEffect(() => {
    const measure = () => {
      const tops = lineRefs.current.map((node) => node?.offsetTop ?? 0);
      setLineTops((previous) =>
        previous.length === tops.length && previous.every((top, index) => top === tops[index])
          ? previous
          : tops,
      );
    };
    measure();
    const wrapper = wrapperRef.current;
    if (!wrapper) {
      return;
    }
    // 宽度变化会改变软换行位置，行号需要跟着重测。
    const resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(wrapper);
    return () => {
      resizeObserver.disconnect();
    };
  }, [value]);

  useLayoutEffect(() => {
    const node = activeMarkRef.current;
    if (!node) {
      return;
    }
    node.scrollIntoView({ block: "center", behavior: "smooth" });
    node.animate?.(
      [
        { boxShadow: "0 0 0 3px rgba(245, 158, 11, 0.55)" },
        { boxShadow: "0 0 0 3px rgba(245, 158, 11, 0)" },
      ],
      { duration: 900, easing: "ease-out" },
    );
  }, [activeMatchIndex]);

  const attachActiveMark = (node: HTMLElement | null) => {
    activeMarkRef.current = node;
  };

  return (
    <div ref={wrapperRef} className="relative flex border-b border-border/50 last:border-b-0">
      <div aria-hidden className="pointer-events-none relative hidden w-10 shrink-0 select-none sm:block">
        {lines.map((_, index) => {
          const globalLine = startLine + index;
          const isCurrent = currentLine !== null && globalLine === currentLine;
          return (
            <div
              key={index}
              className={cn(
                "absolute right-2 flex h-8 items-center justify-end text-[11px] tabular-nums",
                isCurrent ? "font-semibold text-foreground" : "text-muted-foreground/60",
              )}
              style={{ top: `${lineTops[index] ?? 0}px` }}
            >
              {globalLine}
            </div>
          );
        })}
      </div>

      <div className="relative min-w-0 flex-1">
        <div
          aria-hidden
          className={cn(
            FIELD_TEXT_CLASS,
            "pointer-events-none select-none whitespace-pre-wrap text-transparent",
          )}
        >
          {lines.map((line, index) => (
            <div key={index} ref={(node) => { lineRefs.current[index] = node; }} className="min-h-8">
              {renderLineContent(line, lineStarts[index] ?? 0, matches, activeMatchIndex, attachActiveMark)}
            </div>
          ))}
        </div>
        <textarea
          aria-label="作品正文"
          spellCheck={false}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onSelect={(event) => onCaretChange(event.currentTarget.selectionStart)}
          onClick={(event) => onCaretChange(event.currentTarget.selectionStart)}
          onBlur={() => onCaretChange(null)}
          className={cn(
            FIELD_TEXT_CLASS,
            "absolute inset-0 h-full w-full resize-none overflow-hidden whitespace-pre-wrap border-0 bg-transparent text-foreground outline-none",
          )}
        />
      </div>
    </div>
  );
}
