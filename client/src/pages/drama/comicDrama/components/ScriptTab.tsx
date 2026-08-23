import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, BookOpenText, Loader2, Plus, X } from "lucide-react";
import {
  getStorySettingsCharacters,
  getStorySettingsProps,
  getStorySettingsScenes,
} from "@/api/story/storySettings";
import { getDramaEraStyle, type DramaVisualStyle } from "@/api/media/drama";
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
  /** 全局画风清单（GET /drama/visual-styles：内置预设+全局自定义，供画风切换选择）。 */
  styleOptions: DramaVisualStyle[];
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
// 每一行是一件事：场景切换、角色形象切换、一格分镜、或分镜下的一句话（旁白/台词）。
// 底层数据仍是 Chapter.expectation 文本（自动保存与后续分镜/视频生成链路不变），
// 列表是它的结构化视图：parse 拆行渲染，编辑后 serialize 回写（往返契约见 shared/utils/scriptDocument）。
export default function ScriptTab(props: ScriptTabProps) {
  const { novelId, workspace } = props;
  const queryClient = useQueryClient();
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
  const eraStyleQuery = useQuery({
    queryKey: queryKeys.drama.eraStyle(novelId),
    queryFn: () => getDramaEraStyle(novelId),
    enabled: Boolean(novelId),
  });
  const characters = charactersQuery.data?.data ?? [];
  const scenes = scenesQuery.data?.data ?? [];
  const propList = propsQuery.data?.data ?? [];
  const eraStyleInfo = eraStyleQuery.data?.data ?? null;
  // 画风选项：全局时代画风库（内置预设 + 全局自定义；GET /drama/visual-styles 一并返回，
  // 2026-08-22 起不再读本书 artStyles）。值用 label——脚本标记里写的就是它。
  const eraStyleOptions = useMemo(
    () => props.styleOptions.map((style) => style.label).filter(Boolean),
    [props.styleOptions],
  );

  const items = useMemo(() => parseScriptItems(workspace.expectationText), [workspace.expectationText]);

  // 本章画风：本章最后一个【画风】标记；没有则沿用服务端解析的当前生效风格
  // （更早章节的标记或小说默认——「新章节沿用上一次使用的风格」）。
  const chapterEraMarker = useMemo(() => {
    for (let i = items.length - 1; i >= 0; i -= 1) {
      const item = items[i];
      if (item.kind === "style" && item.style.trim()) {
        return item.style.trim();
      }
    }
    return null;
  }, [items]);
  const effectiveEraLabel = chapterEraMarker ?? eraStyleInfo?.label ?? eraStyleOptions[0] ?? "";
  const eraInherited = !chapterEraMarker && eraStyleInfo?.source === "script";

  // 脚本与设定资产的名字对应情况（2026-08-21 用户要求）：
  // - 场景行/台词说话人/角色状态行按名字精确对应资产；
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
        return new Set<string>();
      }
      const pattern = new RegExp(`(?<![\\p{L}\\p{N}])(?:${unique.map(escapeRegExp).join("|")})(?![\\p{L}\\p{N}])`, "gu");
      const found = new Set<string>();
      for (const match of text.matchAll(pattern)) {
        found.add(match[0]);
      }
      return found;
    };
    const mentionedCharacters = mentionedIn(characters.map((character) => character.name));
    const mentionedScenes = mentionedIn(scenes.map((scene) => scene.name));
    const mentionedProps = mentionedIn(propList.map((prop) => prop.name));
    for (const character of characters) {
      if (mentionedCharacters.has(character.name.trim())) usedKeys.add(`character:${character.name.trim()}`);
    }
    for (const scene of scenes) {
      if (mentionedScenes.has(scene.name.trim())) usedKeys.add(`scene:${scene.name.trim()}`);
    }
    for (const prop of propList) {
      if (mentionedProps.has(prop.name.trim())) usedKeys.add(`prop:${prop.name.trim()}`);
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
    const removed = items[index];
    applyItems(items.filter((_, i) => i !== index));
    setEditing(null);
    // 删掉画风标记后，生效画风回落到继承值（更早章节标记或小说默认），刷新一次。
    if (removed?.kind === "style") {
      queryClient.invalidateQueries({ queryKey: queryKeys.drama.eraStyle(novelId) });
    }
  };

  // 切换画风：在脚本末尾追加一条【画风：名】标记——标记对后续内容生效，
  // 之后的画面/视频生成沿用资产画风，时代风格换成新选的。
  const switchEraStyle = (label: string) => {
    if (!label || label === effectiveEraLabel) {
      return;
    }
    applyItems([...items, { kind: "style", style: label }]);
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
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <Card className="rounded-3xl">
        <CardContent className="p-4 sm:p-6">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="shrink-0 text-sm text-muted-foreground">画风</span>
            <SelectControl
              className="h-8 w-40 rounded-md border border-border bg-background px-2 text-sm"
              value={effectiveEraLabel}
              onChange={(event) => switchEraStyle(event.target.value)}
              aria-label="切换本章画风"
            >
              {eraStyleOptions.map((label) => (
                <option key={label} value={label}>{label}</option>
              ))}
            </SelectControl>
            {eraInherited ? <span className="text-xs text-muted-foreground">沿用之前章节</span> : null}
          </div>
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
                    <>
                      <SceneRow
                        item={item}
                        index={index}
                        total={items.length}
                        editing={editing}
                        matched={scriptUsage.knownScenes.has(item.scene.trim())}
                        onEdit={setEditing}
                        onUpdate={updateItem}
                        onRemove={removeItem}
                        onMove={moveItem}
                      />
                      <SceneStatePanel
                        panel={scenePanelByIndex.get(index) ?? null}
                        sceneStates={scenesByName.get(item.scene.trim())?.states.map((state) => state.label).filter(Boolean) ?? []}
                        characterStatesByName={charactersByName}
                        onSwitch={(target, nextState) => switchPanelState(index, target, nextState)}
                      />
                    </>
                  ) : item.kind === "sceneState" ? (
                    <SceneStateRow
                      item={item}
                      index={index}
                      total={items.length}
                      editing={editing}
                      matched={scriptUsage.knownScenes.has(item.scene.trim())}
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
                      matched={scriptUsage.knownCharacters.has(item.name.trim())}
                      onEdit={setEditing}
                      onUpdate={updateItem}
                      onRemove={removeItem}
                      onMove={moveItem}
                    />
                  ) : item.kind === "style" ? (
                    <StyleRow
                      item={item}
                      index={index}
                      total={items.length}
                      editing={editing}
                      isLatest={item.style.trim() === chapterEraMarker}
                      options={eraStyleOptions}
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
                      editing={editing}
                      onEdit={setEditing}
                      onUpdate={updateItem}
                      onRemove={removeItem}
                      onMove={moveItem}
                      entityNames={entityNames}
                      speakerKnown={scriptUsage.knownCharacters.has(item.speaker.trim())}
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
            <Button variant="outline" size="sm" onClick={() => appendItem({ kind: "style", style: effectiveEraLabel || eraStyleOptions[0] || "现代都市" }, "value")}>
              <Plus className="mr-1 h-4 w-4" aria-hidden="true" />画风
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

// 场景切换行下的状态面板：场景用哪个状态出图、每个出场角色用哪个形象状态，
// 全部下拉可切。选中的值写进脚本标记行（【场景状态：…】/【角色状态：…】），
// 没写标记时沿用上一次使用的状态（展示值回落资产默认状态）。
function SceneStatePanel(props: {
  panel: SceneStatePanelData | null;
  sceneStates: string[];
  characterStatesByName: Map<string, { states: Array<{ label: string }> }>;
  onSwitch: (target: { kind: "sceneState" } | { kind: "state"; name: string }, nextState: string) => void;
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
  const sceneValue = panel.sceneState && props.sceneStates.includes(panel.sceneState)
    ? panel.sceneState
    : props.sceneStates[0];
  if (props.sceneStates.length === 0 && characterRows.length === 0) {
    return null;
  }
  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-xl border border-border/60 bg-muted/20 px-3 py-2">
      {props.sceneStates.length > 0 ? (
        <label className="inline-flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">场景状态</span>
          <SelectControl
            className="h-7 max-w-36 rounded-md border border-border bg-background px-1.5 text-xs"
            value={sceneValue}
            onChange={(event) => props.onSwitch({ kind: "sceneState" }, event.target.value)}
            aria-label={`切换${panel.sceneName}的场景状态`}
          >
            {props.sceneStates.map((label) => (
              <option key={label} value={label}>{label}</option>
            ))}
          </SelectControl>
        </label>
      ) : null}
      {characterRows.map((row) => (
        <label key={row.name} className="inline-flex min-w-0 items-center gap-1.5">
          <span className="max-w-28 truncate text-xs font-medium text-foreground">{row.name}</span>
          <SelectControl
            className="h-7 max-w-36 rounded-md border border-border bg-background px-1.5 text-xs"
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
        className={props.matched
          ? "text-sm font-semibold text-emerald-700 dark:text-emerald-400"
          : "text-sm font-semibold text-orange-600 dark:text-orange-400"}
        title={props.matched ? undefined : "设定里还没有这个场景，可在右侧面板创建"}
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
  matched: boolean;
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
        className={props.matched
          ? "w-auto text-sm font-semibold text-amber-700 dark:text-amber-400"
          : "w-auto text-sm font-semibold text-orange-600 dark:text-orange-400"}
        title={props.matched ? undefined : "设定里还没有这个角色，可在右侧面板创建"}
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

// 场景状态标记行：该场景从这条起用哪个状态出图（通常由场景切换行下的状态面板写入）。
function SceneStateRow(props: RowBaseProps & {
  item: Extract<ScriptItem, { kind: "sceneState" }>;
  matched: boolean;
  onUpdate: (index: number, patch: Partial<ScriptItem> & Record<string, unknown>) => void;
}) {
  const nameActive = props.editing?.index === props.index && props.editing?.field === "name";
  const stateActive = props.editing?.index === props.index && props.editing?.field === "value";
  return (
    <div className="group flex flex-wrap items-center gap-2 rounded-xl bg-emerald-500/10 px-3 py-2">
      <Badge className="shrink-0 bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/25 dark:text-emerald-400">场景状态</Badge>
      <EditableValue
        active={nameActive}
        value={props.item.scene}
        placeholder="场景名"
        className={props.matched
          ? "w-auto text-sm font-semibold text-emerald-700 dark:text-emerald-400"
          : "w-auto text-sm font-semibold text-orange-600 dark:text-orange-400"}
        title={props.matched ? undefined : "设定里还没有这个场景，可在右侧面板创建"}
        inputClassName="h-8 w-36"
        onCommit={(next) => {
          const value = next.trim();
          if (value) {
            props.onUpdate(props.index, { scene: value });
          }
        }}
        onCancel={() => props.onEdit(null)}
        onActivate={() => props.onEdit({ index: props.index, field: "name" })}
      />
      <span className="text-xs text-muted-foreground">切换为</span>
      <EditableValue
        active={stateActive}
        value={props.item.state}
        placeholder="状态名，如 夜晚"
        className="w-auto text-sm font-semibold text-emerald-700 dark:text-emerald-400"
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

// 画风切换行：标记从这里开始用哪个时代风格；本章最后一条是当前生效的。
function StyleRow(props: RowBaseProps & {
  item: Extract<ScriptItem, { kind: "style" }>;
  isLatest: boolean;
  options: string[];
  onUpdate: (index: number, patch: Partial<ScriptItem> & Record<string, unknown>) => void;
}) {
  const active = props.editing?.index === props.index && props.editing?.field === "value";
  const options = props.options.length > 0 ? props.options : [props.item.style];
  return (
    <div className="group flex flex-wrap items-center gap-2 rounded-xl bg-violet-500/10 px-3 py-2">
      <Badge className="shrink-0 bg-violet-500/15 text-violet-700 hover:bg-violet-500/25 dark:text-violet-300">画风</Badge>
      {active ? (
        <SelectControl
          autoFocus
          className="h-8 w-40 rounded-md border border-border bg-background px-2 text-sm"
          value={options.includes(props.item.style) ? props.item.style : options[0]}
          onChange={(event) => {
            props.onUpdate(props.index, { style: event.target.value });
            props.onEdit(null);
          }}
          onBlur={() => props.onEdit(null)}
        >
          {options.map((label) => (
            <option key={label} value={label}>{label}</option>
          ))}
        </SelectControl>
      ) : (
        <button
          type="button"
          className={`rounded text-left text-sm font-semibold ${
            props.isLatest
              ? "text-violet-700 dark:text-violet-300"
              : "text-muted-foreground"
          }`}
          onClick={() => props.onEdit({ index: props.index, field: "value" })}
          title="点击换画风"
        >
          切换为 {props.item.style}
        </button>
      )}
      {props.isLatest ? <span className="text-xs text-muted-foreground">当前生效</span> : null}
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
  entityNames: { characters: string[]; scenes: string[]; props: string[] };
  speakerKnown: boolean;
  onUpdate: (index: number, patch: Partial<ScriptItem> & Record<string, unknown>) => void;
}) {
  const speakerActive = props.editing?.index === props.index && props.editing?.field === "speaker";
  const moodActive = props.editing?.index === props.index && props.editing?.field === "mood";
  const textActive = props.editing?.index === props.index && props.editing?.field === "text";
  const isNarrator = props.item.speaker === "旁白";
  return (
    <div className={`group flex flex-wrap items-center gap-2 rounded-xl px-3 py-1.5 ${isNarrator ? "" : "bg-blue-400/[0.08]"}`}>
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
        <Badge
          variant={isNarrator ? "outline" : "secondary"}
          className={!isNarrator && !props.speakerKnown ? "bg-orange-500/15 text-orange-600 hover:bg-orange-500/25 dark:text-orange-400" : undefined}
          title={!isNarrator && !props.speakerKnown ? "设定里还没有这个角色，可在右侧创建" : undefined}
        >
          {props.item.speaker || "旁白"}
        </Badge>
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
