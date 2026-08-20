import { useMemo } from "react";
import CodeMirror from "@uiw/react-codemirror";
import {
  Decoration,
  EditorView,
  MatchDecorator,
  ViewPlugin,
  type DecorationSet,
  type ViewUpdate,
} from "@codemirror/view";

const LINE_HEIGHT = 28;

export interface OutlineEntityHighlight {
  characters?: string[];
  scenes?: string[];
  props?: string[];
}

interface LineNumberedTextareaProps {
  id?: string;
  value: string;
  minRows?: number;
  placeholder?: string;
  maxLength?: number;
  ariaLabel?: string;
  highlight?: OutlineEntityHighlight;
  /** 分镜式初稿模式：按「分镜+旁白/台词」两行一组整体着色，对话组淡蓝、旁白组默认前景色 */
  storyboardMode?: boolean;
  onChange: (next: string) => void;
  onBlur?: () => void;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// —— 分镜式初稿的行分组着色 ——
// 文本结构：每组是连续的非空行（「分镜：画面」+「旁白：…/角色（神态）：台词」），
// 组间以空行分隔。组内第二行的说话人不是「旁白」即对话组，整组（含分镜行）标为对话色。
const STORYBOARD_SHOT_PATTERN = /^[ \t]*分镜[：:]/;
const STORYBOARD_SPEAKER_PATTERN = /^[ \t]*([^\s：:（(]{1,20})(?:[（(][^）)]{0,20}[)）])?[：:]/;

function isDialogueLine(line: string): boolean {
  const match = STORYBOARD_SPEAKER_PATTERN.exec(line);
  return match !== null && match[1] !== "旁白";
}

function buildStoryboardLineDecorations(view: EditorView): DecorationSet {
  const dialogueLineStarts: number[] = [];
  const doc = view.state.doc;
  let group: Array<{ from: number; text: string }> = [];
  const flushGroup = () => {
    if (group.length === 0) {
      return;
    }
    const contentLine = STORYBOARD_SHOT_PATTERN.test(group[0].text)
      ? group[1]?.text
      : group[0].text;
    if (contentLine !== undefined && isDialogueLine(contentLine)) {
      group.forEach((item) => dialogueLineStarts.push(item.from));
    }
    group = [];
  };
  for (let index = 1; index <= doc.lines; index += 1) {
    const line = doc.line(index);
    if (!line.text.trim()) {
      flushGroup();
      continue;
    }
    group.push({ from: line.from, text: line.text });
  }
  flushGroup();
  return Decoration.set(dialogueLineStarts.map((from) => Decoration.line({ class: "cm-sb-dialogue" }).range(from)));
}

function storyboardLineColors() {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = buildStoryboardLineDecorations(view);
      }
      update(update: ViewUpdate) {
        if (update.docChanged) {
          this.decorations = buildStoryboardLineDecorations(update.view);
        }
      }
    },
    { decorations: (plugin) => plugin.decorations },
  );
}


function buildEntityHighlight(names: string[] | undefined, className: string) {
  const unique = [...new Set((names ?? []).map((name) => name.trim()).filter((name) => name.length >= 2))];
  if (unique.length === 0) {
    return null;
  }
  // 长名优先，避免短名抢先吃掉包含它的长名；前后断词防止名字黏在更长的词里被误匹配。
  unique.sort((left, right) => right.length - left.length);
  const pattern = unique.map(escapeRegExp).join("|");
  const matcher = new MatchDecorator({
    regexp: new RegExp(`(?<![\\p{L}\\p{N}])(?:${pattern})(?![\\p{L}\\p{N}])`, "gu"),
    decoration: Decoration.mark({ class: className }),
  });
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = matcher.createDeco(view);
      }
      update(update: ViewUpdate) {
        this.decorations = matcher.updateDeco(update, this.decorations);
      }
    },
    { decorations: (plugin) => plugin.decorations },
  );
}

// 大纲编辑区：基于 CodeMirror 6 的纯文本编辑器。行号列固定在编辑器最左侧、
// 只读不可输入；软换行、当前行与行号高亮、内容增长自动变高。
// 传入 highlight 名单（设定里的角色/场景/道具名）后，正文里出现这些名字会按类别着色。
// 颜色全部走项目语义 token（CSS 变量），明暗主题自适应；场景/道具用组件内色调映射的
// 调色板原色（emerald/amber），与 WorkflowProgressBar 的做法一致。
// storyboardMode 按分镜分组着色：对话组整组淡蓝（blue-400 调色板原色），旁白组保持默认前景色。
export default function LineNumberedTextarea(props: LineNumberedTextareaProps) {
  const minRows = props.minRows ?? 20;
  const { characters, scenes, props: propNames } = props.highlight ?? {};
  const extensions = useMemo(
    () =>
      [
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
        ".cm-entity-character": {
          borderRadius: "3px",
          backgroundColor: "color-mix(in srgb, var(--primary) 14%, transparent)",
          boxShadow: "inset 0 -2px 0 color-mix(in srgb, var(--primary) 45%, transparent)",
        },
        ".cm-entity-scene": {
          borderRadius: "3px",
          backgroundColor: "color-mix(in srgb, #10b981 14%, transparent)",
          boxShadow: "inset 0 -2px 0 color-mix(in srgb, #10b981 45%, transparent)",
        },
        ".cm-entity-prop": {
          borderRadius: "3px",
          backgroundColor: "color-mix(in srgb, #d97706 14%, transparent)",
          boxShadow: "inset 0 -2px 0 color-mix(in srgb, #d97706 45%, transparent)",
        },
        ".cm-sb-dialogue": { color: "#60a5fa" },
      }),
        buildEntityHighlight(characters, "cm-entity-character"),
        buildEntityHighlight(scenes, "cm-entity-scene"),
        buildEntityHighlight(propNames, "cm-entity-prop"),
        props.storyboardMode ? storyboardLineColors() : null,
      ].filter((extension): extension is NonNullable<typeof extension> => extension !== null),
    [minRows, characters, scenes, propNames, props.storyboardMode],
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
