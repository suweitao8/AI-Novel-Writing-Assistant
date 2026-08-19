import { useMemo } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { EditorView } from "@codemirror/view";

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

// 大纲编辑区：基于 CodeMirror 6 的纯文本编辑器。行号列固定在编辑器最左侧、
// 只读不可输入；软换行、当前行与行号高亮、内容增长自动变高。
// 颜色全部走项目语义 token（CSS 变量），明暗主题自适应。
export default function LineNumberedTextarea(props: LineNumberedTextareaProps) {
  const minRows = props.minRows ?? 50;
  const extensions = useMemo(
    () => [
      EditorView.lineWrapping,
      EditorView.theme({
        "&": {
          backgroundColor: "transparent",
          color: "var(--foreground)",
          fontSize: "15px",
          minHeight: `${minRows * LINE_HEIGHT + 24}px`,
        },
        "&.cm-focused": { outline: "none" },
        ".cm-scroller": { fontFamily: "inherit", lineHeight: `${LINE_HEIGHT}px` },
        ".cm-content": { paddingTop: "12px", paddingBottom: "12px", caretColor: "var(--foreground)" },
        ".cm-gutters": {
          backgroundColor: "var(--muted)",
          color: "var(--muted-foreground)",
          border: "none",
          minWidth: "44px",
          paddingLeft: "6px",
          paddingRight: "6px",
        },
        ".cm-activeLine": { backgroundColor: "color-mix(in srgb, var(--muted) 55%, transparent)" },
        ".cm-activeLineGutter": { backgroundColor: "transparent", color: "var(--foreground)", fontWeight: 600 },
        ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
          backgroundColor: "color-mix(in srgb, var(--primary) 25%, transparent)",
        },
        ".cm-cursor": { borderLeftColor: "var(--foreground)" },
      }),
    ],
    [minRows],
  );

  return (
    <div
      id={props.id}
      aria-label={props.ariaLabel}
      className="overflow-hidden rounded-md border border-border bg-background focus-within:ring-1 focus-within:ring-ring"
    >
      <CodeMirror
        value={props.value}
        placeholder={props.placeholder}
        theme="none"
        extensions={extensions}
        basicSetup={{
          lineNumbers: true,
          highlightActiveLineGutter: true,
          highlightActiveLine: true,
          foldGutter: false,
          autocompletion: false,
          closeBrackets: false,
          bracketMatching: false,
          crosshairCursor: false,
          highlightSelectionMatches: false,
          searchKeymap: false,
        }}
        onChange={(next) => {
          if (props.maxLength !== undefined && next.length > props.maxLength) {
            props.onChange(next.slice(0, props.maxLength));
            return;
          }
          props.onChange(next);
        }}
        onBlur={() => props.onBlur?.()}
      />
    </div>
  );
}
