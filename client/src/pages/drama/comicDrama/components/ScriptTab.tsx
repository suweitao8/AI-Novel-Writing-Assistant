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
import { AppDialogContent, Dialog } from "@/components/ui/dialog";
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

// 场景切换行下的状态面板数据：这个场景用哪个场景状态、出场角色各用哪个形象状态。
// state 是「进入该场景段时已生效」的标记值（没有标记＝null，展示时回落资产默认状态）。
interface SceneStatePanelData {
  sceneIndex: number;
  sceneName: string;
  sceneState: string | null;
  characterStates: Array<{ name: string; state: string | null }>;
  /** 场景段结束位置（下一个场景行下标或结尾），写标记时限定在这个范围内找/插。 */
  endExclusive: number;
}

// 漫剧工作室「当前 · 脚本」页签：本章脚本的线性列表——视频按什么顺序发生，列表就按什么顺序排。
// 每一行是一件事：场景切换、一格分镜、或分镜下的一句话（旁白/台词）。
// 状态标记行（【场景状态/角色状态】）不在正文里渲染，查看与切换统一走场景行下的状态面板。
// 底层数据仍是 Chapter.expectation 文本（自动保存与后续分镜/视频生成链路不变），
// 列表是它的结构化视图：parse 拆行渲染，编辑后 serialize 回写（往返契约见 shared/utils/scriptDocument）。
export default function ScriptTab(props: ScriptTabProps) {
  const { novelId, workspace } = props;
  const [editing, setEditing] = useState<EditingTarget | null>(null);

  const savePending = workspace.savePending;
  const dirty = workspace.expectationDirty;
  const autosaveRef = useRef({ dirty, pending: savePending, flush: workspace.flushExpectationSave });
  autosaveRef.current = { dirty, pending: savePending, flush: workspace.flushExpectationSave };

  // 切走页签时把还没到自动保存间隔的修改立即落库，避免丢稿
  // （排队/去重逻辑在 workspace.flushExpectationSave 内部处理）。
  useEffect(() => () => {
    autosaveRef.current.flush();
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

  // 状态标记行不在正文里单独渲染（2026-08-23 用户要求：与场景行下的状态面板重复，
  // 面板是唯一的查看/切换入口）；过滤只影响渲染，行操作仍用原始下标对位。
  const visibleItems = useMemo(
    () => items
      .map((item, index) => ({ item, index }))
      .filter((entry) => entry.item.kind !== "state" && entry.item.kind !== "sceneState"),
    [items],
  );

  // 脚本与设定资产的名字对应情况（2026-08-21 用户要求）：
  // - 场景行/台词说话人/状态标记按名字精确对应资产；
  // - 右侧面板只显示脚本用到的资产（按首次出现排序），用到了但没有对应资产的
  //   名字进 missing，以橙红警告卡提示「未生成，需要手动创建」——建好后自动消失；
  // - 已有资产名出现在正文任意位置（断词匹配，与正文高亮同口径）也算用到。
  const scriptUsage = useMemo(() => {
    const knownCharacters = new Set(characters.map((character) => character.name.trim()));
    const knownScenes = new Set(scenes.map((scene) => scene.name.trim()));
    const usedOrderKeys: string[] = [];
    const usedKeys = new Set<string>();
    const missingScenes: string[] = [];
    const missingCharacters: string[] = [];
    const pushUsed = (key: string) => {
      if (!usedKeys.has(key)) {
        usedKeys.add(key);
        usedOrderKeys.push(key);
      }
    };
    for (const item of items) {
      if (item.kind === "scene") {
        const name = item.scene.trim();
        if (!name) continue;
        if (knownScenes.has(name)) {
          pushUsed(`scene:${name}`);
        } else if (!missingScenes.includes(name)) {
          missingScenes.push(name);
        }
      } else if (item.kind === "line") {
        const name = item.speaker.trim();
        if (!name || name === "旁白") continue;
        if (knownCharacters.has(name)) {
          pushUsed(`character:${name}`);
        } else if (!missingCharacters.includes(name)) {
          missingCharacters.push(name);
        }
      } else if (item.kind === "state") {
        const name = item.name.trim();
        if (!name) continue;
        if (knownCharacters.has(name)) {
          pushUsed(`character:${name}`);
        } else if (!missingCharacters.includes(name)) {
          missingCharacters.push(name);
        }
      }
    }
    const text = workspace.expectationText;
    // 每类资产一个交替正则一次全文扫描（长名优先 + 断词边界），等价于逐名 test 但只扫三遍。
    const mentionedIn = (names: string[]) => {
      const unique = [...new Set(names.map((name) => name.trim()).filter((name) => name.length >= 2))]
        .sort((left, right) => right.length - left.length);
      if (unique.length === 0) {
        return [];
      }
      const pattern = new RegExp(`(?<![\\p{L}\\p{N}])(?:${unique.map(escapeRegExp).join("|")})(?![\\p{L}\\p{N}])`, "gu");
      const found: string[] = [];
      for (const match of text.matchAll(pattern)) {
        if (!found.includes(match[0])) found.push(match[0]);
      }
      return found;
    };
    const mentionedCharacters = mentionedIn(characters.map((character) => character.name));
    const mentionedScenes = mentionedIn(scenes.map((scene) => scene.name));
    const mentionedProps = mentionedIn(propList.map((prop) => prop.name));
    for (const name of mentionedCharacters) {
      pushUsed(`character:${name.trim()}`);
    }
    for (const name of mentionedScenes) {
      pushUsed(`scene:${name.trim()}`);
    }
    for (const name of mentionedProps) {
      pushUsed(`prop:${name.trim()}`);
    }
    return {
      knownCharacters,
      knownScenes,
      usedOrderKeys,
      usedKeys,
      missing: [
        ...missingScenes.map((name) => ({ type: "scene" as const, name })),
        ...missingCharacters.map((name) => ({ type: "character" as const, name })),
      ],
    };
  }, [items, characters, scenes, propList, workspace.expectationText]);

  const entityNames = useMemo(() => ({
    characters: characters.map((character) => character.name),
    scenes: scenes.map((scene) => scene.name),
    props: propList.map((prop) => prop.name),
  }), [characters, scenes, propList]);

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

  // 行删除二次确认（2026-08-23 用户要求）：场景/状态/分镜/台词删错一拍就丢内容，
  // 统一先弹确认，确认后才真正删（走原 removeItem + 自动保存）。
  const [removeTargetIndex, setRemoveTargetIndex] = useState<number | null>(null);
  const removeTargetItem = removeTargetIndex !== null ? items[removeTargetIndex] ?? null : null;
  const requestRemove = (index: number) => {
    setRemoveTargetIndex(index);
  };
  const confirmRemove = () => {
    if (removeTargetIndex !== null) {
      removeItem(removeTargetIndex);
    }
    setRemoveTargetIndex(null);
  };

  // 上移/下移按可见行换位：相邻位置可能是隐藏的状态标记，直接换相邻下标会变成
  // 「点了没反应」的假移动，所以跳过标记找最近的可见行换位。
  const moveItem = (index: number, direction: -1 | 1) => {
    const visibleIndex = visibleItems.findIndex((entry) => entry.index === index);
    const neighbor = visibleIndex >= 0 ? visibleItems[visibleIndex + direction] : undefined;
    if (!neighbor) {
      return;
    }
    const next = [...items];
    const [moved] = next.splice(index, 1);
    next.splice(neighbor.index, 0, moved);
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

  // —— 场景状态面板（2026-08-23 用户要求）——
  // 每个场景段算一份：出场角色（说话人/状态标记点名 + 分镜画面里按断词匹配到的名字）
  // 与各自生效的状态。状态沿用是「标记 sticky」：没写标记就用上一次使用的状态
  // （本章更早的标记），首次出现＝资产默认状态。
  const charactersByName = useMemo(
    () => new Map(characters.map((character) => [character.name.trim(), character])),
    [characters],
  );
  const scenesByName = useMemo(
    () => new Map(scenes.map((scene) => [scene.name.trim(), scene])),
    [scenes],
  );
  const characterNameMatcher = useMemo(() => {
    const unique = [...new Set(characters.map((character) => character.name.trim()).filter((name) => name.length >= 2))]
      .sort((left, right) => right.length - left.length);
    if (unique.length === 0) {
      return null;
    }
    return {
      pattern: new RegExp(`(?<![\\p{L}\\p{N}])(?:${unique.map(escapeRegExp).join("|")})(?![\\p{L}\\p{N}])`, "gu"),
    };
  }, [characters]);

  const scenePanels = useMemo<SceneStatePanelData[]>(() => {
    const panels: SceneStatePanelData[] = [];
    const runningCharState = new Map<string, string>();
    const runningSceneState = new Map<string, string>();
    let current: { sceneIndex: number; sceneName: string; appearing: string[] } | null = null;
    const pushAppearing = (name: string) => {
      if (current && name && name !== "旁白" && !current.appearing.includes(name)) {
        current.appearing.push(name);
      }
    };
    const closeCurrent = (endExclusive: number) => {
      if (!current) {
        return;
      }
      panels.push({
        sceneIndex: current.sceneIndex,
        sceneName: current.sceneName,
        sceneState: runningSceneState.get(current.sceneName) ?? null,
        characterStates: current.appearing
          .filter((name) => charactersByName.has(name))
          .map((name) => ({ name, state: runningCharState.get(name) ?? null })),
        endExclusive,
      });
    };
    items.forEach((item, index) => {
      if (item.kind === "scene") {
        closeCurrent(index);
        current = { sceneIndex: index, sceneName: item.scene.trim(), appearing: [] };
      } else if (item.kind === "sceneState") {
        runningSceneState.set(item.scene.trim(), item.state.trim());
      } else if (item.kind === "state") {
        const name = item.name.trim();
        runningCharState.set(name, item.state.trim());
        pushAppearing(name);
      } else if (item.kind === "line") {
        pushAppearing(item.speaker.trim());
      } else if (item.kind === "shot" && characterNameMatcher) {
        characterNameMatcher.pattern.lastIndex = 0;
        for (const found of item.storyboard.matchAll(characterNameMatcher.pattern)) {
          pushAppearing(found[0]);
        }
      }
    });
    closeCurrent(items.length);
    return panels;
  }, [items, charactersByName, characterNameMatcher]);
  const scenePanelByIndex = useMemo(
    () => new Map(scenePanels.map((panel) => [panel.sceneIndex, panel])),
    [scenePanels],
  );

  // 面板切换状态：在该场景段内找最后一个对应标记改值（段内中途切换的行保留，只改值）；
  // 段内没有标记就在场景行后插入新标记——场景状态紧跟场景行，角色状态排在其后。
  const switchPanelState = (
    sceneIndex: number,
    target: { kind: "sceneState" } | { kind: "state"; name: string },
    nextState: string,
  ) => {
    const panel = scenePanelByIndex.get(sceneIndex);
    if (!panel) {
      return;
    }
    const next = [...items];
    let targetIndex = -1;
    for (let i = panel.endExclusive - 1; i > sceneIndex; i -= 1) {
      const item = next[i];
      if (target.kind === "sceneState" && item.kind === "sceneState" && item.scene.trim() === panel.sceneName) {
        targetIndex = i;
        break;
      }
      if (target.kind === "state" && item.kind === "state" && item.name.trim() === target.name) {
        targetIndex = i;
        break;
      }
    }
    const marker = target.kind === "sceneState"
      ? { kind: "sceneState" as const, scene: panel.sceneName, state: nextState }
      : { kind: "state" as const, name: target.name, state: nextState };
    if (targetIndex >= 0) {
      next[targetIndex] = marker;
    } else {
      let insertAt = sceneIndex + 1;
      const after = next[insertAt];
      if (target.kind === "state" && after && after.kind === "sceneState" && after.scene.trim() === panel.sceneName) {
        insertAt += 1;
      }
      next.splice(insertAt, 0, marker);
    }
    applyItems(next);
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

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
      <Card className="rounded-3xl">
        <CardContent className="p-4 sm:p-6">
          {visibleItems.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border px-6 py-12 text-center">
              <p className="text-sm leading-6 text-muted-foreground">
                这一章还没有脚本。到「参考」页签带入小说原文后点「解析」，脚本会按分镜逐行生成；也可以直接在下面添加。
              </p>
            </div>
          ) : (
            <ol className="space-y-2">
              {visibleItems.map(({ item, index }) => (
                <li key={index}>
                  {item.kind === "scene" ? (
                    <div className="overflow-hidden rounded-xl border border-emerald-500/30 bg-emerald-500/10">
                      <SceneRow
                        item={item}
                        index={index}
                        total={items.length}
                        editing={editing}
                        matched={scriptUsage.knownScenes.has(item.scene.trim())}
                        sceneStates={scenesByName.get(item.scene.trim())?.states.map((state) => state.label).filter(Boolean) ?? []}
                        sceneStateValue={scenePanelByIndex.get(index)?.sceneState ?? null}
                        onSwitchSceneState={(nextState) => switchPanelState(index, { kind: "sceneState" }, nextState)}
                        onEdit={setEditing}
                        onUpdate={updateItem}
                        onRemove={requestRemove}
                        onMove={moveItem}
                      />
                      <SceneStatePanel
                        panel={scenePanelByIndex.get(index) ?? null}
                        characterStatesByName={charactersByName}
                        onSwitch={(target, nextState) => switchPanelState(index, target, nextState)}
                      />
                    </div>
                  ) : item.kind === "shot" ? (
                    <ShotRow
                      item={item}
                      index={index}
                      total={items.length}
                      editing={editing}
                      onEdit={setEditing}
                      onUpdate={updateItem}
                      onRemove={requestRemove}
                      onMove={moveItem}
                      onAddLine={addLineAfter}
                    />
                  ) : item.kind === "line" ? (
                    <LineRow
                      item={item}
                      index={index}
                      total={items.length}
                      editing={editing}
                      onEdit={setEditing}
                      onUpdate={updateItem}
                      onRemove={requestRemove}
                      onMove={moveItem}
                      entityNames={entityNames}
                      speakerKnown={scriptUsage.knownCharacters.has(item.speaker.trim())}
                    />
                  ) : item.kind === "text" ? (
                    <TextRow
                      item={item}
                      index={index}
                      total={items.length}
                      editing={editing}
                      onEdit={setEditing}
                      onUpdate={updateItem}
                      onRemove={requestRemove}
                      onMove={moveItem}
                    />
                  ) : null}
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
          </div>
        </CardContent>
      </Card>
      <OutlineSettingsAside
        novelId={novelId}
        characters={characters}
        scenes={scenes}
        props={propList}
        usage={{
          usedOrderKeys: scriptUsage.usedOrderKeys,
          usedKeys: scriptUsage.usedKeys,
          missing: scriptUsage.missing,
        }}
      />

      <Dialog open={removeTargetIndex !== null} onOpenChange={(open) => { if (!open) setRemoveTargetIndex(null); }}>
        <AppDialogContent
          title="删除这一行"
          footer={
            <>
              <Button variant="outline" onClick={() => setRemoveTargetIndex(null)}>取消</Button>
              <Button variant="destructive" onClick={confirmRemove}>删除</Button>
            </>
          }
        >
          <p className="text-sm leading-6 text-muted-foreground">
            删除「{removePreviewText(removeTargetItem)}」这一行？删除后立即保存，不可撤销。
          </p>
        </AppDialogContent>
      </Dialog>
    </div>
  );
}

// 确认弹窗里给这一行的内容摘要（截短），让用户知道删的是哪一行。
function removePreviewText(item: ScriptItem | null): string {
  if (!item) {
    return "";
  }
  const raw = item.kind === "scene" ? `场景：${item.scene}`
    : item.kind === "sceneState" ? `场景状态：${item.scene} → ${item.state}`
    : item.kind === "state" ? `角色状态：${item.name} → ${item.state}`
    : item.kind === "shot" ? `分镜：${item.storyboard}`
    : item.kind === "line" ? `${item.speaker}：${item.text}`
    : item.text;
  return raw.length > 30 ? `${raw.slice(0, 30)}…` : raw;
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
  title?: string;
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
      title={props.title ?? "点击编辑"}
    >
      {props.children ?? (props.value || <span className="text-muted-foreground/60">{props.placeholder}</span>)}
    </button>
  );
}

// 正文里的角色/场景/道具名高亮：列表视图里沿用「名字即锚点」的约定。
function EntityHighlightedText(props: { text: string; entityNames: { characters: string[]; scenes: string[]; props: string[] } }) {
  // 匹配器按三类名单构建一次（名单来自设定资产，引用稳定），不在每次渲染重编译正则。
  const matchers = useMemo(() => {
    const groups: Array<{ names: string[]; className: string }> = [
      { names: props.entityNames.characters, className: "rounded bg-primary/20 px-0.5" },
      { names: props.entityNames.scenes, className: "rounded bg-emerald-500/20 px-0.5" },
      { names: props.entityNames.props, className: "rounded bg-amber-500/20 px-0.5" },
    ];
    return groups
      .map((group) => {
        const unique = [...new Set(group.names.map((name) => name.trim()).filter((name) => name.length >= 2))];
        if (unique.length === 0) {
          return null;
        }
        unique.sort((left, right) => right.length - left.length);
        return { pattern: new RegExp(`(?<![\\p{L}\\p{N}])(?:${unique.map(escapeRegExp).join("|")})(?![\\p{L}\\p{N}])`, "gu"), className: group.className };
      })
      .filter((matcher): matcher is { pattern: RegExp; className: string } => matcher !== null);
  }, [props.entityNames.characters, props.entityNames.scenes, props.entityNames.props]);
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

// 场景切换行下的状态面板：这个场景里出场的角色各用哪个形象状态，下拉可切。
// 场景自己的状态下拉在场景行内（SceneRow），这里只列角色；一行三个、名字全显
// （2026-08-23 用户要求）。选中的值写进【角色状态：…】标记行，未写标记＝沿用上一次。
function SceneStatePanel(props: {
  panel: SceneStatePanelData | null;
  characterStatesByName: Map<string, { states: Array<{ label: string }> }>;
  onSwitch: (target: { kind: "state"; name: string }, nextState: string) => void;
}) {
  const { panel } = props;
  if (!panel) {
    return null;
  }
  const characterRows = panel.characterStates
    .map((entry) => {
      const options = (props.characterStatesByName.get(entry.name)?.states ?? [])
        .map((state) => state.label)
        .filter(Boolean);
      return { name: entry.name, options, value: entry.state && options.includes(entry.state) ? entry.state : options[0] };
    })
    .filter((row) => row.options.length > 0);
  if (characterRows.length === 0) {
    return null;
  }
  return (
    <div className="grid grid-cols-1 gap-1.5 border-t border-emerald-500/20 bg-transparent px-3 py-2 sm:grid-cols-3">
      {characterRows.map((row) => (
        <label key={row.name} className="flex min-w-0 items-center gap-1.5">
          <span className="shrink-0 text-xs font-medium text-foreground">{row.name}</span>
          <SelectControl
            className="h-7 min-w-0 flex-1 rounded-md border border-border bg-background px-1.5 text-xs"
            value={row.value}
            onChange={(event) => props.onSwitch({ kind: "state", name: row.name }, event.target.value)}
            aria-label={`切换${row.name}在本场景的形象`}
          >
            {row.options.map((label) => (
              <option key={label} value={label}>{label}</option>
            ))}
          </SelectControl>
        </label>
      ))}
    </div>
  );
}

function SceneRow(props: RowBaseProps & {
  item: Extract<ScriptItem, { kind: "scene" }>;
  matched: boolean;
  /** 场景资产的状态名（设定里有这个场景才有）；场景自己的状态直接在场景行内切换。 */
  sceneStates: string[];
  sceneStateValue: string | null;
  onSwitchSceneState: (state: string) => void;
  onUpdate: (index: number, patch: Partial<ScriptItem> & Record<string, unknown>) => void;
}) {
  const active = props.editing?.index === props.index && props.editing?.field === "value";
  const sceneStateValue = props.sceneStateValue && props.sceneStates.includes(props.sceneStateValue)
    ? props.sceneStateValue
    : props.sceneStates[0];
  return (
    <div className="group flex flex-wrap items-center gap-2 px-3 py-2">
      <Badge className="shrink-0 bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/25 dark:text-emerald-400">场景</Badge>
      <EditableValue
        active={active}
        value={props.item.scene}
        placeholder="场景名，如 客厅"
        className={props.matched
          ? "w-auto min-w-24 text-sm font-semibold text-emerald-700 dark:text-emerald-400"
          : "w-auto min-w-24 text-sm font-semibold text-orange-600 dark:text-orange-400"}
        title={props.matched ? undefined : "设定里还没有这个场景，可在右侧面板创建"}
        inputClassName="h-8 w-40"
        onCommit={(next) => {
          const value = next.trim();
          if (value) {
            props.onUpdate(props.index, { scene: value });
          }
        }}
        onCancel={() => props.onEdit(null)}
        onActivate={() => props.onEdit({ index: props.index, field: "value" })}
      />
      {props.sceneStates.length > 0 ? (
        <SelectControl
          className="h-7 max-w-36 rounded-md border border-emerald-500/30 bg-background px-1.5 text-xs"
          value={sceneStateValue}
          onChange={(event) => props.onSwitchSceneState(event.target.value)}
          aria-label={`切换${props.item.scene}的场景状态`}
        >
          {props.sceneStates.map((label) => (
            <option key={label} value={label}>{label}</option>
          ))}
        </SelectControl>
      ) : null}
      <RowActions {...props} />
    </div>
  );
}

// 角色状态/场景状态标记行不渲染为正文行（2026-08-23 用户决定：与场景行下的状态面板重复，
// 面板下拉是唯一的查看/切换入口，标记由面板写入与改值，标记行不再有独立编辑入口）。

// 画风切换行已移除（2026-08-23 用户决定：时代风格由资产状态自带，脚本不定义画风）；
// 历史【画风：…】行解析为普通文本行（TextRow），不再有编辑入口。

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
  entityNames: { characters: string[]; scenes: string[]; props: string[] };
  speakerKnown: boolean;
  onUpdate: (index: number, patch: Partial<ScriptItem> & Record<string, unknown>) => void;
}) {
  const speakerActive = props.editing?.index === props.index && props.editing?.field === "speaker";
  const moodActive = props.editing?.index === props.index && props.editing?.field === "mood";
  const textActive = props.editing?.index === props.index && props.editing?.field === "text";
  const isNarrator = props.item.speaker === "旁白";
  // 角色台词淡蓝底＋蓝色说话人徽标，与素底旁白一眼区分（2026-08-23 用户要求）。
  return (
    <div className={`group flex flex-wrap items-center gap-2 rounded-xl border-l-2 px-3 py-1.5 ${
      isNarrator ? "border-l-transparent" : "border-l-sky-500/60 bg-sky-500/15"
    }`}>
      <EditableValue
        active={speakerActive}
        value={props.item.speaker}
        placeholder="旁白"
        className="w-auto"
        inputClassName="h-8 w-24"
        onCommit={(next) => {
          const speaker = next.trim();
          props.onUpdate(props.index, {
            speaker,
            ...(speaker === "旁白" ? { mood: "" } : {}),
          });
        }}
        onCancel={() => props.onEdit(null)}
        onActivate={() => props.onEdit({ index: props.index, field: "speaker" })}
      >
        <Badge
          variant={isNarrator ? "outline" : "secondary"}
          className={!isNarrator
            ? props.speakerKnown
              ? "bg-sky-500/15 text-sky-700 hover:bg-sky-500/25 dark:text-sky-300"
              : "bg-orange-500/15 text-orange-600 hover:bg-orange-500/25 dark:text-orange-400"
            : undefined}
          title={!isNarrator && !props.speakerKnown ? "设定里还没有这个角色，可在右侧创建" : undefined}
        >
          {props.item.speaker || "旁白"}
        </Badge>
      </EditableValue>
      {!isNarrator ? (
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
      ) : null}
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
