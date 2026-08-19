import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";

// 行号列与正文必须逐像素同排版（同一份类名常量），软换行时行号才能对齐；
// 行位采用镜像层实测的 offsetTop，而不是按硬换行估算。高度由镜像层撑开，
// 内容不足 minRows 时用最小高度兜底，所以回车加行时编辑区会自然变长。
// 行号列仿代码编辑器：只读不可输入，点击行号选中整行，光标所在行的行号高亮。
const OUTLINE_TEXT_CLASS = "font-sans text-[15px] leading-7 break-words px-4 py-3";
const LINE_HEIGHT = 28;

interface LineNumberedTextareaProps {
  id?: string;
  value: string;
  minRows?: number;
  placeholder?: string;
  maxLength?: number;
  ariaLabel?: string;
  onChange: (next: string) => void;
  onBlur?: () => void;
}

export default function LineNumberedTextarea(props: LineNumberedTextareaProps) {
  const minRows = props.minRows ?? 50;
  const lines = useMemo(() => props.value.split("\n"), [props.value]);
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
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [lineTops, setLineTops] = useState<number[]>([]);
  const [currentLine, setCurrentLine] = useState<number | null>(null);

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
  }, [props.value]);

  const syncCaretLine = (element: HTMLTextAreaElement) => {
    const offset = element.selectionStart ?? 0;
    setCurrentLine(props.value.slice(0, offset).split("\n").length - 1);
  };

  const selectLine = (index: number) => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }
    const start = lineStarts[index] ?? 0;
    const end = start + (lines[index]?.length ?? 0);
    textarea.focus();
    textarea.setSelectionRange(start, end);
    setCurrentLine(index);
  };

  return (
    <div className="overflow-hidden rounded-md border border-border bg-background focus-within:ring-1 focus-within:ring-ring">
      <div aria-hidden className="relative hidden w-10 shrink-0 select-none border-r border-border/40 sm:block">
        {lines.map((_line, index) => (
          <button
            key={index}
            type="button"
            tabIndex={-1}
            onClick={() => selectLine(index)}
            className={cn(
              "absolute right-0 flex h-7 w-10 cursor-default items-center justify-end pr-2 text-[11px] tabular-nums",
              currentLine === index ? "font-semibold text-foreground" : "text-muted-foreground/60",
            )}
            style={{ top: `${lineTops[index] ?? 0}px` }}
          >
            {index + 1}
          </button>
        ))}
      </div>
      <div ref={wrapperRef} className="relative min-w-0 flex-1" style={{ minHeight: minRows * LINE_HEIGHT + 24 }}>
        <div
          aria-hidden
          className={cn(OUTLINE_TEXT_CLASS, "pointer-events-none select-none whitespace-pre-wrap text-transparent")}
        >
          {lines.map((line, index) => (
            <div key={index} ref={(node) => { lineRefs.current[index] = node; }} className="min-h-7">
              {line.length > 0 ? line : "\u200b"}
            </div>
          ))}
        </div>
        <textarea
          ref={textareaRef}
          id={props.id}
          aria-label={props.ariaLabel ?? props.placeholder}
          spellCheck={false}
          value={props.value}
          maxLength={props.maxLength}
          placeholder={props.placeholder}
          onChange={(event) => props.onChange(event.target.value)}
          onSelect={(event) => syncCaretLine(event.currentTarget)}
          onClick={(event) => syncCaretLine(event.currentTarget)}
          onBlur={() => props.onBlur?.()}
          className={cn(
            OUTLINE_TEXT_CLASS,
            "absolute inset-0 h-full w-full resize-none overflow-hidden whitespace-pre-wrap border-0 bg-transparent text-foreground outline-none placeholder:text-muted-foreground",
          )}
        />
      </div>
    </div>
  );
}
