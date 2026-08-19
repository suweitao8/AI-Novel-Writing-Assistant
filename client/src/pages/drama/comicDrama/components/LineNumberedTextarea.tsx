import { useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

// 行号列与正文必须逐像素同排版（同一份类名常量），软换行时行号才能对齐；
// 行位采用镜像层实测的 offsetTop，而不是按硬换行估算。高度由镜像层撑开，
// 内容不足 minRows 时用最小高度兜底，所以回车加行时编辑区会自然变长。
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

// 带行号、可随内容增长的大纲编辑区：左列行号按实测行位对齐（窄屏自动收起），
// 正文是覆盖在隐形排版镜像上的原生 textarea，视觉与输入都走标准控件。
export default function LineNumberedTextarea(props: LineNumberedTextareaProps) {
  const minRows = props.minRows ?? 50;
  const lines = props.value.split("\n");
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const lineRefs = useRef<Array<HTMLDivElement | null>>([]);
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
  }, [props.value]);

  return (
    <div className="overflow-hidden rounded-md border border-border bg-background focus-within:ring-1 focus-within:ring-ring">
      <div aria-hidden className="pointer-events-none relative hidden w-10 shrink-0 select-none border-r border-border/40 sm:block">
        {lines.map((_line, index) => (
          <div
            key={index}
            className="absolute right-2 flex h-7 items-center justify-end text-[11px] tabular-nums text-muted-foreground/60"
            style={{ top: `${lineTops[index] ?? 0}px` }}
          >
            {index + 1}
          </div>
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
          id={props.id}
          aria-label={props.ariaLabel ?? props.placeholder}
          spellCheck={false}
          value={props.value}
          maxLength={props.maxLength}
          placeholder={props.placeholder}
          onChange={(event) => props.onChange(event.target.value)}
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
