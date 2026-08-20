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
  /** 分镜式初稿模式：对话组整组铺淡蓝底；【场景】切换行淡绿底、【角色状态】切换行淡黄底并加粗 */
  storyboardMode?: boolean;
  onChange: (next: string) => void;
  onBlur?: () => void;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// —— 分镜式初稿的行分组着色 ——
// 文本结构：每组是连续的非空行（「分镜：画面」+「旁白：…/角色（神态）：台词」），
// 组间以空行分隔。组内第二行的说话人不是「旁白」即对话组，整组（含分镜行）铺淡蓝底。
// 区分靠「淡色底」而不是给文字调色——文字混前景色在明暗主题下都容易和正文分不清（两轮实测），
// 底色在两种主题下都稳定可见。两类切换行单独成行、各铺专属淡色底并加粗，不参与分组判定：
// 「【场景：客厅】」换场铺淡绿、「【角色状态：李火旺：重伤】」换形象铺淡黄——
// 后续生成分镜/视频时按这些行知道从哪里起切换到哪个场景/形象。
const STORYBOARD_SHOT_PATTERN = /^[ \t]*分镜[：:]/;
const STORYBOARD_SPEAKER_PATTERN = /^[ \t]*([^\s：:（(]{1,20})(?:[（(][^）)]{0,20}[)）])?[：:]/;
const STORYBOARD_SCENE_PATTERN = /^[ \t]*【场景[：:]\s*[^】\s][^】]{0,29}】[ \t]*$/;
const STORYBOARD_STATE_PATTERN = /^[ \t]*【角色状态[：:][^：:】]{1,20}[：:][^：:】]{1,20}】[ \t]*$/;

function isDialogueLine(line: string): boolean {
  const match = STORYBOARD_SPEAKER_PATTERN.exec(line);
  return match !== null && match[1] !== "旁白";
}

function buildStoryboardLineDecorations(view: EditorView): DecorationSet {
  const dialogueLineStarts: number[] = [];
  const sceneLineStarts: number[] = [];
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
      // 切换行自成一块，同时结束上一个分组。
      flushGroup();
      sceneLineStarts.push(line.from);
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
// storyboardMode 按分镜分组铺淡色底：对话组整组淡蓝底（文字保持正文色——文字混前景色两轮实测分不清）；
// 切换行铺专属淡色底并加粗——场景（【场景：x】）淡绿、角色状态（【角色状态：x：y】）淡黄。
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
        // 实体名高亮：角色/场景/道具名在正文里出现的即时锚点，底色给足可见度。
        ".cm-entity-character": {
          borderRadius: "3px",
          backgroundColor: "color-mix(in srgb, var(--primary) 20%, transparent)",
          boxShadow: "inset 0 -2px 0 color-mix(in srgb, var(--primary) 60%, transparent)",
        },
        ".cm-entity-scene": {
          borderRadius: "3px",
          backgroundColor: "color-mix(in srgb, #10b981 20%, transparent)",
          boxShadow: "inset 0 -2px 0 color-mix(in srgb, #10b981 60%, transparent)",
        },
        ".cm-entity-prop": {
          borderRadius: "3px",
          backgroundColor: "color-mix(in srgb, #d97706 20%, transparent)",
          boxShadow: "inset 0 -2px 0 color-mix(in srgb, #d97706 60%, transparent)",
        },
        // 对话组：整组铺淡蓝底（文字保持正文色）——区分靠底色不靠文字调色，
        // 明暗主题下都和旁白组（无底色）分得清。
        ".cm-sb-dialogue": { backgroundColor: "color-mix(in srgb, #60a5fa 12%, transparent)" },
        // 场景切换行（【场景：客厅】）：淡绿底 + 偏绿加粗，一眼找到换场点。
        ".cm-sb-scene": {
          backgroundColor: "color-mix(in srgb, #10b981 16%, transparent)",
          color: "color-mix(in srgb, #10b981 60%, var(--foreground))",
          fontWeight: 600,
        },
        // 角色状态切换行（【角色状态：李火旺：重伤】）：淡黄底 + 偏琥珀加粗，标记形象变化点。
        ".cm-sb-state": {
          backgroundColor: "color-mix(in srgb, #d97706 16%, transparent)",
          color: "color-mix(in srgb, #d97706 65%, var(--foreground))",
          fontWeight: 600,
        },
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
