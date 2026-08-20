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
  /** 分镜式初稿模式：按「分镜+旁白/台词」两行一组整体着色，对话组极淡蓝；【场景】【风格】【角色状态】切换行各按专属色加粗 */
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
// 三类切换行都单独成行、自带专属颜色、不参与分组判定，并结束上一个分组：
// 「【场景：客厅】」换场、「【风格：写实末日】」换画风、「【角色状态：李火旺：重伤】」换角色形象——
// 后续生成分镜/视频时按这些行知道从哪里起切换到哪个场景/画风/形象。
const STORYBOARD_SHOT_PATTERN = /^[ \t]*分镜[：:]/;
const STORYBOARD_SPEAKER_PATTERN = /^[ \t]*([^\s：:（(]{1,20})(?:[（(][^）)]{0,20}[)）])?[：:]/;
const STORYBOARD_SCENE_PATTERN = /^[ \t]*【场景[：:]\s*[^】\s][^】]{0,29}】[ \t]*$/;
const STORYBOARD_STYLE_PATTERN = /^[ \t]*【风格[：:]\s*[^】\s][^】]{0,29}】[ \t]*$/;
const STORYBOARD_STATE_PATTERN = /^[ \t]*【角色状态[：:][^：:】]{1,20}[：:][^：:】]{1,20}】[ \t]*$/;

function isDialogueLine(line: string): boolean {
  const match = STORYBOARD_SPEAKER_PATTERN.exec(line);
  return match !== null && match[1] !== "旁白";
}

function buildStoryboardLineDecorations(view: EditorView): DecorationSet {
  const dialogueLineStarts: number[] = [];
  const sceneLineStarts: number[] = [];
  const styleLineStarts: number[] = [];
  const stateLineStarts: number[] = [];
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
    if (STORYBOARD_SCENE_PATTERN.test(line.text)) {
      flushGroup();
      sceneLineStarts.push(line.from);
      continue;
    }
    if (STORYBOARD_STYLE_PATTERN.test(line.text)) {
      flushGroup();
      styleLineStarts.push(line.from);
      continue;
    }
    if (STORYBOARD_STATE_PATTERN.test(line.text)) {
      flushGroup();
      stateLineStarts.push(line.from);
      continue;
    }
    group.push({ from: line.from, text: line.text });
  }
  flushGroup();
  const ranges = [
    ...dialogueLineStarts.map((from) => Decoration.line({ class: "cm-sb-dialogue" }).range(from)),
    ...sceneLineStarts.map((from) => Decoration.line({ class: "cm-sb-scene" }).range(from)),
    ...styleLineStarts.map((from) => Decoration.line({ class: "cm-sb-style" }).range(from)),
    ...stateLineStarts.map((from) => Decoration.line({ class: "cm-sb-state" }).range(from)),
  ];
  return Decoration.set(ranges);
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
// storyboardMode 按分镜分组着色：对话组整组极淡蓝（blue-400 混入前景色）；
// 切换行各按专属色加粗——场景（【场景：x】）偏绿、风格（【风格：x】）偏紫、角色状态（【角色状态：x：y】）偏琥珀。
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
        // 对话组文字：柔和的淡蓝（blue-400 45% 混入前景色——太淡会和旁白分不清，
        // 太浓刺眼；45% 在暗色主题下是清晰的浅蓝、亮色主题下是可读的偏蓝深色）。
        ".cm-sb-dialogue": { color: "color-mix(in srgb, #60a5fa 45%, var(--foreground))" },
        // 场景切换行（【场景：客厅】）：偏绿加粗，一眼找到换场点。
        ".cm-sb-scene": { color: "color-mix(in srgb, #10b981 55%, var(--foreground))", fontWeight: 600 },
        // 美术风格切换行（【风格：写实末日】）：偏紫加粗，与换场区分开。
        ".cm-sb-style": { color: "color-mix(in srgb, #8b5cf6 55%, var(--foreground))", fontWeight: 600 },
        // 角色状态切换行（【角色状态：李火旺：重伤】）：偏琥珀加粗，标记形象变化点。
        ".cm-sb-state": { color: "color-mix(in srgb, #d97706 60%, var(--foreground))", fontWeight: 600 },
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
