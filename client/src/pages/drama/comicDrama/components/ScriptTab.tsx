import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, BookOpenText, Loader2, Plus, X } from "lucide-react";
import {
  getStorySettingsCharacters,
  getStorySettingsProps,
  getStorySettingsScenes,
} from "@/api/story/storySettings";
import { queryKeys } from "@/api/queryKeys";
import {
  parseScriptItems,
  serializeScriptItems,
  SCRIPT_SHOT_TYPES,
  type ScriptItem,
  type ScriptShotType,
} from "@ai-novel/shared/utils/scriptDocument";
import OutlineSettingsAside from "@/pages/drama/comicDrama/components/OutlineSettingsAside";
import type { NovelChapterWorkspace } from "@/pages/drama/comicDrama/hooks/useNovelChapterWorkspace";
import SelectControl from "@/components/common/SelectControl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";

const AUTOSAVE_DELAY_MS = 1200;
const SCRIPT_MAX_LENGTH = 20000;

interface ScriptTabProps {
  novelId: string;
  workspace: NovelChapterWorkspace;
  onOpenChapterManage: () => void;
}

// 正在编辑的字段：条目下标 + 具体字段（一行可能有多个可点编辑的区域）。
interface EditingTarget {
  index: number;
  field: "value" | "shot" | "speaker" | "mood" | "text" | "storyboard" | "name";
}

// 漫剧工作室「当前 · 脚本」页签：本章脚本的线性列表——视频按什么顺序发生，列表就按什么顺序排。
// 每一行是一件事：场景切换、角色形象切换、一格分镜、或分镜下的一句话（旁白/台词）。
// 底层数据仍是 Chapter.expectation 文本（自动保存与后续分镜/视频生成链路不变），
// 列表是它的结构化视图：parse 拆行渲染，编辑后 serialize 回写（往返契约见 shared/utils/scriptDocument）。
export default function ScriptTab(props: ScriptTabProps) {
  const { novelId, workspace } = props;
  const [editing, setEditing] = useState<EditingTarget | null>(null);

  const savePending = workspace.savePending;
  const dirty = workspace.expectationDirty;
  const autosaveRef = useRef({ dirty, pending: savePending, flush: workspace.flushExpectationSave });
  autosaveRef.current = { dirty, pending: savePending, flush: workspace.flushExpectationSave };

  // 切走页签时把还没到自动保存间隔的修改立即落库，避免丢稿。
  useEffect(() => () => {
    const { dirty: wasDirty, pending, flush } = autosaveRef.current;
    if (wasDirty && !pending) {
      flush();
    }
  }, []);

  useEffect(() => {
    if (!dirty || savePending) {
      return;
    }
    const timer = setTimeout(() => autosaveRef.current.flush(), AUTOSAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [workspace.expectationText, dirty, savePending]);

  const charactersQuery = useQuery({
    queryKey: queryKeys.novels.storySettingsCharacters(novelId),
    queryFn: () => getStorySettingsCharacters(novelId),
    enabled: Boolean(novelId),
  });
  const scenesQuery = useQuery({
    queryKey: queryKeys.novels.storySettingsScenes(novelId),
    queryFn: () => getStorySettingsScenes(novelId),
    enabled: Boolean(novelId),
  });
  const propsQuery = useQuery({
    queryKey: queryKeys.novels.storySettingsProps(novelId),
    queryFn: () => getStorySettingsProps(novelId),
    enabled: Boolean(novelId),
  });
  const characters = charactersQuery.data?.data ?? [];
  const scenes = scenesQuery.data?.data ?? [];
  const propList = propsQuery.data?.data ?? [];

  const items = useMemo(() => parseScriptItems(workspace.expectationText), [workspace.expectationText]);

  // 列表编辑的唯一出口：改条目 → 序列化回文本 → 走原自动保存链路。
  const applyItems = (next: ScriptItem[]) => {
    const nextText = serializeScriptItems(next);
    if (nextText.length > SCRIPT_MAX_LENGTH) {
      toast.error("本章脚本太长，放不下这条修改。", { description: `脚本上限 ${SCRIPT_MAX_LENGTH} 字，可以删掉一些再试。` });
      return;
    }
    workspace.setExpectationText(nextText);
  };

  const updateItem = (index: number, patch: Partial<ScriptItem> & Record<string, unknown>) => {
    applyItems(items.map((item, i) => (i === index ? ({ ...item, ...patch } as ScriptItem) : item)));
  };

  const removeItem = (index: number) => {
    applyItems(items.filter((_, i) => i !== index));
    setEditing(null);
  };

  const moveItem = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= items.length) {
      return;
    }
    const next = [...items];
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved);
    applyItems(next);
  };

  const appendItem = (item: ScriptItem, focusField: EditingTarget["field"]) => {
    applyItems([...items, item]);
    setEditing({ index: items.length, field: focusField });
  };

  // 在分镜行下面补一句台词（视频是线性的：新台词紧贴它所属的分镜）。
  const addLineAfter = (index: number) => {
    const next = [...items];
    next.splice(index + 1, 0, { kind: "line", speaker: "旁白", mood: "", text: "要说的话" });
    applyItems(next);
    setEditing({ index: index + 1, field: "text" });
  };

  if (workspace.chaptersQuery.isPending) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" aria-hidden="true" /> 正在加载章节
      </div>
    );
  }

  if (!workspace.currentChapter) {
    return (
      <div className="rounded-3xl border border-dashed border-border bg-background/60 px-6 py-16 text-center">
        <p className="text-sm text-muted-foreground">还没有章节。</p>
        <Button className="mt-4" size="sm" onClick={props.onOpenChapterManage}>
          <BookOpenText className="mr-1.5 h-4 w-4" aria-hidden="true" />打开章节管理新建第一章
        </Button>
      </div>
    );
  }

  const entityNames = {
    characters: characters.map((character) => character.name),
    scenes: scenes.map((scene) => scene.name),
    props: propList.map((prop) => prop.name),
  };

  // 台词行是否缩进：它上面最近的非台词条目是分镜时，它属于这个分镜。
  const lineIndented: boolean[] = [];
  let insideShot = false;
  for (const item of items) {
    if (item.kind === "shot") {
      insideShot = true;
    } else if (item.kind === "line") {
      // 保持当前归属
    } else {
      insideShot = false;
    }
    lineIndented.push(item.kind === "line" ? insideShot : false);
  }

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <Card className="rounded-3xl">
        <CardContent className="p-4 sm:p-6">
          {items.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border px-6 py-12 text-center">
              <p className="text-sm leading-6 text-muted-foreground">
                这一章还没有脚本。到「参考」页签带入小说原文后点「解析」，脚本会按分镜逐行生成；也可以直接在下面添加。
              </p>
            </div>
          ) : (
            <ol className="space-y-2">
              {items.map((item, index) => (
                <li key={index}>
                  {item.kind === "scene" ? (
                    <SceneRow
                      item={item}
                      index={index}
                      total={items.length}
                      editing={editing}
                      onEdit={setEditing}
                      onUpdate={updateItem}
                      onRemove={removeItem}
                      onMove={moveItem}
                    />
                  ) : item.kind === "state" ? (
                    <StateRow
                      item={item}
                      index={index}
                      total={items.length}
                      editing={editing}
                      onEdit={setEditing}
                      onUpdate={updateItem}
                      onRemove={removeItem}
                      onMove={moveItem}
                    />
                  ) : item.kind === "shot" ? (
                    <ShotRow
                      item={item}
                      index={index}
                      total={items.length}
                      editing={editing}
                      onEdit={setEditing}
                      onUpdate={updateItem}
                      onRemove={removeItem}
                      onMove={moveItem}
                      onAddLine={addLineAfter}
                    />
                  ) : item.kind === "line" ? (
                    <LineRow
                      item={item}
                      index={index}
                      total={items.length}
                      indented={lineIndented[index]}
                      editing={editing}
                      onEdit={setEditing}
                      onUpdate={updateItem}
                      onRemove={removeItem}
                      onMove={moveItem}
                      entityNames={entityNames}
                    />
                  ) : (
                    <TextRow
                      item={item}
                      index={index}
                      total={items.length}
                      editing={editing}
                      onEdit={setEditing}
                      onUpdate={updateItem}
                      onRemove={removeItem}
                      onMove={moveItem}
                    />
                  )}
                </li>
              ))}
            </ol>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-4">
            <Button variant="outline" size="sm" onClick={() => appendItem({ kind: "shot", shot: "中景", storyboard: "这一格画面里正在发生什么" }, "storyboard")}>
              <Plus className="mr-1 h-4 w-4" aria-hidden="true" />分镜
            </Button>
            <Button variant="outline" size="sm" onClick={() => appendItem({ kind: "line", speaker: "旁白", mood: "", text: "要说的话" }, "text")}>
              <Plus className="mr-1 h-4 w-4" aria-hidden="true" />台词
            </Button>
            <Button variant="outline" size="sm" onClick={() => appendItem({ kind: "scene", scene: "场景名" }, "value")}>
              <Plus className="mr-1 h-4 w-4" aria-hidden="true" />场景切换
            </Button>
            <Button variant="outline" size="sm" onClick={() => appendItem({ kind: "state", name: "角色名", state: "新状态" }, "name")}>
              <Plus className="mr-1 h-4 w-4" aria-hidden="true" />角色状态
            </Button>
          </div>
        </CardContent>
      </Card>
      <OutlineSettingsAside novelId={novelId} characters={characters} scenes={scenes} props={propList} />
    </div>
  );
}

// —— 行骨架：悬停出现 上移/下移/删除；内容区域点击进入编辑。 ——

interface RowBaseProps {
  index: number;
  total: number;
  editing: EditingTarget | null;
  onEdit: (target: EditingTarget | null) => void;
  onRemove: (index: number) => void;
  onMove: (index: number, direction: -1 | 1) => void;
}

function RowActions(props: RowBaseProps) {
  const { index, total } = props;
  return (
    <span className="ml-1 inline-flex shrink-0 items-center gap-0.5 opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100">
      <Button
        variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground" aria-label="上移" title="上移"
        disabled={index === 0} onClick={() => props.onMove(index, -1)}
      >
        <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
      </Button>
      <Button
        variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground" aria-label="下移" title="下移"
        disabled={index === total - 1} onClick={() => props.onMove(index, 1)}
      >
        <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
      </Button>
      <Button
        variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive" aria-label="删除这一行" title="删除这一行"
        onClick={() => props.onRemove(index)}
      >
        <X className="h-3.5 w-3.5" aria-hidden="true" />
      </Button>
    </span>
  );
}

// 点击即编辑：展示态是普通文字（可带高亮），编辑态换成本地草稿输入框——
// 不逐键回写（逐键序列化会让空行被折叠、焦点跳丢），失焦/回车才提交，Esc 取消。
function EditableValue(props: {
  active: boolean;
  value: string;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  onCommit: (next: string) => void;
  onCancel: () => void;
  onActivate: () => void;
  children?: ReactNode;
}) {
  const [draft, setDraft] = useState(props.value);
  useEffect(() => {
    if (props.active) {
      setDraft(props.value);
    }
  }, [props.active, props.value]);
  if (props.active) {
    const finish = (commit: boolean) => {
      props.onCancel();
      if (commit) {
        props.onCommit(draft);
      }
    };
    return (
      <Input
        autoFocus
        value={draft}
        placeholder={props.placeholder}
        className={props.inputClassName ?? "h-8 flex-1"}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => finish(true)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === "Escape") {
            event.preventDefault();
            finish(event.key === "Enter");
          }
        }}
      />
    );
  }
  return (
    <button
      type="button"
      className={`min-w-0 cursor-text rounded text-left ${props.className ?? "flex-1"}`}
      onClick={props.onActivate}
      title="点击编辑"
    >
      {props.children ?? (props.value || <span className="text-muted-foreground/60">{props.placeholder}</span>)}
    </button>
  );
}

// 正文里的角色/场景/道具名高亮：列表视图里沿用「名字即锚点」的约定。
function EntityHighlightedText(props: { text: string; entityNames: { characters: string[]; scenes: string[]; props: string[] } }) {
  const groups: Array<{ names: string[]; className: string }> = [
    { names: props.entityNames.characters, className: "rounded bg-primary/20 px-0.5" },
    { names: props.entityNames.scenes, className: "rounded bg-emerald-500/20 px-0.5" },
    { names: props.entityNames.props, className: "rounded bg-amber-500/20 px-0.5" },
  ];
  const matchers = groups
    .map((group) => {
      const unique = [...new Set(group.names.map((name) => name.trim()).filter((name) => name.length >= 2))];
      if (unique.length === 0) {
        return null;
      }
      unique.sort((left, right) => right.length - left.length);
      return { pattern: new RegExp(`(?<![\\p{L}\\p{N}])(?:${unique.map(escapeRegExp).join("|")})(?![\\p{L}\\p{N}])`, "gu"), className: group.className };
    })
    .filter((matcher): matcher is { pattern: RegExp; className: string } => matcher !== null);
  if (matchers.length === 0) {
    return <>{props.text}</>;
  }
  const parts: Array<{ text: string; className?: string }> = [];
  let rest = props.text;
  outer: while (rest.length > 0) {
    let earliest: { index: number; length: number; className: string } | null = null;
    for (const matcher of matchers) {
      matcher.pattern.lastIndex = 0;
      const found = matcher.pattern.exec(rest);
      if (found && (earliest === null || found.index < earliest.index)) {
        earliest = { index: found.index, length: found[0].length, className: matcher.className };
      }
    }
    if (!earliest) {
      parts.push({ text: rest });
      break outer;
    }
    if (earliest.index > 0) {
      parts.push({ text: rest.slice(0, earliest.index) });
    }
    parts.push({ text: rest.slice(earliest.index, earliest.index + earliest.length), className: earliest.className });
    rest = rest.slice(earliest.index + earliest.length);
  }
  return (
    <>
      {parts.map((part, index) =>
        part.className ? <span key={index} className={part.className}>{part.text}</span> : <span key={index}>{part.text}</span>,
      )}
    </>
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// —— 四类行 ——

function SceneRow(props: RowBaseProps & {
  item: Extract<ScriptItem, { kind: "scene" }>;
  onUpdate: (index: number, patch: Partial<ScriptItem> & Record<string, unknown>) => void;
}) {
  const active = props.editing?.index === props.index && props.editing?.field === "value";
  return (
    <div className="group flex items-center gap-2 rounded-xl bg-emerald-500/10 px-3 py-2">
      <Badge className="shrink-0 bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/25 dark:text-emerald-400">场景</Badge>
      <EditableValue
        active={active}
        value={props.item.scene}
        placeholder="场景名，如 客厅"
        className="text-sm font-semibold text-emerald-700 dark:text-emerald-400"
        inputClassName="h-8 flex-1"
        onCommit={(next) => {
          const value = next.trim();
          if (value) {
            props.onUpdate(props.index, { scene: value });
          }
        }}
        onCancel={() => props.onEdit(null)}
        onActivate={() => props.onEdit({ index: props.index, field: "value" })}
      />
      <RowActions {...props} />
    </div>
  );
}

function StateRow(props: RowBaseProps & {
  item: Extract<ScriptItem, { kind: "state" }>;
  onUpdate: (index: number, patch: Partial<ScriptItem> & Record<string, unknown>) => void;
}) {
  const nameActive = props.editing?.index === props.index && props.editing?.field === "name";
  const stateActive = props.editing?.index === props.index && props.editing?.field === "value";
  return (
    <div className="group flex flex-wrap items-center gap-2 rounded-xl bg-amber-500/10 px-3 py-2">
      <Badge className="shrink-0 bg-amber-500/15 text-amber-700 hover:bg-amber-500/25 dark:text-amber-400">角色状态</Badge>
      <EditableValue
        active={nameActive}
        value={props.item.name}
        placeholder="角色名"
        className="w-auto text-sm font-semibold text-amber-700 dark:text-amber-400"
        inputClassName="h-8 w-28"
        onCommit={(next) => {
          const value = next.trim();
          if (value) {
            props.onUpdate(props.index, { name: value });
          }
        }}
        onCancel={() => props.onEdit(null)}
        onActivate={() => props.onEdit({ index: props.index, field: "name" })}
      />
      <span className="text-xs text-muted-foreground">切换为</span>
      <EditableValue
        active={stateActive}
        value={props.item.state}
        placeholder="新状态，如 重伤"
        className="w-auto text-sm font-semibold text-amber-700 dark:text-amber-400"
        inputClassName="h-8 w-32"
        onCommit={(next) => {
          const value = next.trim();
          if (value) {
            props.onUpdate(props.index, { state: value });
          }
        }}
        onCancel={() => props.onEdit(null)}
        onActivate={() => props.onEdit({ index: props.index, field: "value" })}
      />
      <RowActions {...props} />
    </div>
  );
}

function ShotRow(props: RowBaseProps & {
  item: Extract<ScriptItem, { kind: "shot" }>;
  onUpdate: (index: number, patch: Partial<ScriptItem> & Record<string, unknown>) => void;
  onAddLine: (index: number) => void;
}) {
  const shotActive = props.editing?.index === props.index && props.editing?.field === "shot";
  const boardActive = props.editing?.index === props.index && props.editing?.field === "storyboard";
  return (
    <div className="group flex flex-wrap items-center gap-2 rounded-xl bg-primary/[0.08] px-3 py-2">
      <Badge className="shrink-0">分镜</Badge>
      {shotActive ? (
        <SelectControl
          autoFocus
          className="h-8 w-24 rounded-md border border-border bg-background px-2 text-sm"
          value={props.item.shot}
          onChange={(event) => {
            props.onUpdate(props.index, { shot: event.target.value as ScriptShotType });
            props.onEdit(null);
          }}
          onBlur={() => props.onEdit(null)}
        >
          {SCRIPT_SHOT_TYPES.map((shot) => (
            <option key={shot} value={shot}>{shot}</option>
          ))}
        </SelectControl>
      ) : (
        <button
          type="button"
          className="shrink-0 rounded-md border border-border bg-background px-2 py-1 text-xs font-medium text-foreground"
          onClick={() => props.onEdit({ index: props.index, field: "shot" })}
          title="点击换景别"
        >
          {props.item.shot}
        </button>
      )}
      <EditableValue
        active={boardActive}
        value={props.item.storyboard}
        placeholder="这一格画面里正在发生什么"
        className="min-w-[200px] flex-1 text-sm text-foreground"
        inputClassName="h-8 min-w-[200px] flex-1"
        onCommit={(next) => {
          const value = next.trim();
          if (value) {
            props.onUpdate(props.index, { storyboard: value });
          }
        }}
        onCancel={() => props.onEdit(null)}
        onActivate={() => props.onEdit({ index: props.index, field: "storyboard" })}
      />
      <Button
        variant="ghost" size="sm" className="h-7 shrink-0 px-2 text-xs text-muted-foreground opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100"
        onClick={() => props.onAddLine(props.index)}
        title="在这个分镜下加一句旁白或台词"
      >
        <Plus className="mr-0.5 h-3.5 w-3.5" aria-hidden="true" />台词
      </Button>
      <RowActions {...props} />
    </div>
  );
}

function LineRow(props: RowBaseProps & {
  item: Extract<ScriptItem, { kind: "line" }>;
  indented: boolean;
  entityNames: { characters: string[]; scenes: string[]; props: string[] };
  onUpdate: (index: number, patch: Partial<ScriptItem> & Record<string, unknown>) => void;
}) {
  const speakerActive = props.editing?.index === props.index && props.editing?.field === "speaker";
  const moodActive = props.editing?.index === props.index && props.editing?.field === "mood";
  const textActive = props.editing?.index === props.index && props.editing?.field === "text";
  const isNarrator = props.item.speaker === "旁白";
  return (
    <div className={`group flex flex-wrap items-center gap-2 rounded-xl px-3 py-1.5 ${props.indented ? "ml-4 sm:ml-8" : ""} ${isNarrator ? "" : "bg-blue-400/[0.08]"}`}>
      <EditableValue
        active={speakerActive}
        value={props.item.speaker}
        placeholder="旁白"
        className="w-auto"
        inputClassName="h-8 w-24"
        onCommit={(next) => props.onUpdate(props.index, { speaker: next.trim() })}
        onCancel={() => props.onEdit(null)}
        onActivate={() => props.onEdit({ index: props.index, field: "speaker" })}
      >
        <Badge variant={isNarrator ? "outline" : "secondary"}>{props.item.speaker || "旁白"}</Badge>
      </EditableValue>
      <EditableValue
        active={moodActive}
        value={props.item.mood}
        placeholder="语气"
        className="w-auto text-xs text-muted-foreground"
        inputClassName="h-8 w-24"
        onCommit={(next) => props.onUpdate(props.index, { mood: next.trim() })}
        onCancel={() => props.onEdit(null)}
        onActivate={() => props.onEdit({ index: props.index, field: "mood" })}
      >
        {props.item.mood ? <span>（{props.item.mood}）</span> : <span className="text-muted-foreground/50">（语气）</span>}
      </EditableValue>
      <EditableValue
        active={textActive}
        value={props.item.text}
        placeholder="这一句的内容"
        className="min-w-[200px] flex-1 text-sm text-foreground"
        inputClassName="h-8 min-w-[200px] flex-1"
        onCommit={(next) => {
          const value = next.trim();
          // 内容清空 = 删掉这一句（说话人只剩壳没有意义）。
          if (value) {
            props.onUpdate(props.index, { text: value });
          } else {
            props.onRemove(props.index);
          }
        }}
        onCancel={() => props.onEdit(null)}
        onActivate={() => props.onEdit({ index: props.index, field: "text" })}
      >
        <EntityHighlightedText text={props.item.text} entityNames={props.entityNames} />
      </EditableValue>
      <RowActions {...props} />
    </div>
  );
}

function TextRow(props: RowBaseProps & {
  item: Extract<ScriptItem, { kind: "text" }>;
  onUpdate: (index: number, patch: Partial<ScriptItem> & Record<string, unknown>) => void;
}) {
  const active = props.editing?.index === props.index && props.editing?.field === "value";
  return (
    <div className="group flex items-center gap-2 rounded-xl px-3 py-1.5">
      <EditableValue
        active={active}
        value={props.item.text}
        placeholder="补充说明"
        className="flex-1 text-sm text-muted-foreground"
        inputClassName="h-8 flex-1"
        onCommit={(next) => {
          const value = next.trim();
          if (value) {
            props.onUpdate(props.index, { text: value });
          } else {
            props.onRemove(props.index);
          }
        }}
        onCancel={() => props.onEdit(null)}
        onActivate={() => props.onEdit({ index: props.index, field: "value" })}
      />
      <RowActions {...props} />
    </div>
  );
}
