import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Search, Trash2 } from "lucide-react";
import {
  createStorySettingsCharacter,
  createStorySettingsProp,
  createStorySettingsScene,
  deleteStorySettingsCharacter,
  deleteStorySettingsProp,
  deleteStorySettingsScene,
  type StorySettingsCharacter,
  type StorySettingsProp,
  type StorySettingsScene,
} from "@/api/story/storySettings";
import { queryKeys } from "@/api/queryKeys";
import { Badge } from "@/components/ui/badge";
import SelectControl from "@/components/common/SelectControl";
import { Button } from "@/components/ui/button";
import { AppDialogContent, Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import type { StoryAssetState } from "@ai-novel/shared/types/novelReferenceExtraction";

type AssetType = "character" | "scene" | "prop";

type AssetSource = StorySettingsCharacter | StorySettingsScene | StorySettingsProp;

interface AssetCard {
  id: string;
  type: AssetType;
  name: string;
  note: string;
  updatedAt: string;
  source: AssetSource;
}

interface OutlineSettingsAsideProps {
  novelId: string;
  characters: StorySettingsCharacter[];
  scenes: StorySettingsScene[];
  props: StorySettingsProp[];
  /** 脚本的使用情况：只显示用到的资产（按首次出现排序）+ 未生成名字的警告卡 */
  usage: {
    usedOrderKeys: string[];
    usedKeys: Set<string>;
    missing: Array<{ type: "character" | "scene"; name: string }>;
  };
}

const TYPE_LABELS: Record<AssetType, string> = {
  character: "角色",
  scene: "场景",
  prop: "道具",
};

// 与大纲编辑器里实体高亮的三色一一对应，卡片标签用同一套色调。
const TYPE_TONES: Record<AssetType, string> = {
  character: "border-primary/40 bg-primary/10 text-primary",
  scene: "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  prop: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400",
};

const GENDER_LABELS: Record<string, string> = { male: "男", female: "女", other: "其他", unknown: "未知" };
const AGE_LABELS: Record<string, string> = { child: "少年", youth: "青年", middle: "中年", elder: "老年" };
const SCENE_TYPE_LABELS: Record<string, string> = { interior: "室内", exterior: "室外", nature: "自然" };

function DetailRow({ label, value }: { label: string; value: string | null | undefined }) {
  const text = value?.trim();
  if (!text) return null;
  return (
    <div className="space-y-0.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="whitespace-pre-wrap text-sm leading-6 text-foreground">{text}</p>
    </div>
  );
}

function DetailStates({ states }: { states: StoryAssetState[] | undefined }) {
  if (!states?.length) return null;
  return (
    <div className="space-y-1.5">
      <p className="text-xs text-muted-foreground">外观状态（{states.length}）</p>
      <div className="space-y-1">
        {states.map((state) => (
          <div key={state.id} className="rounded-lg bg-muted/40 px-3 py-1.5 text-xs leading-5">
            <span className="font-medium text-foreground">{state.label}</span>
            {state.chapterOrder ? <span className="text-muted-foreground">（第 {state.chapterOrder} 章）</span> : null}
            {state.description ? <span className="block text-muted-foreground">{state.description}</span> : null}
          </div>
        ))}
      </div>
    </div>
  );
}

// 资产详情弹窗：完整字段一览（含生图/音色提示词与外观状态）+ 删除入口。
function AssetDetailDialog(props: {
  novelId: string;
  asset: AssetCard | null;
  onOpenChange: (open: boolean) => void;
  onDeleted: () => void | Promise<void>;
}) {
  const asset = props.asset;
  const type = asset?.type;
  const source = asset?.source;
  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!asset) return;
      if (asset.type === "character") {
        await deleteStorySettingsCharacter(props.novelId, asset.id);
      } else if (asset.type === "scene") {
        await deleteStorySettingsScene(props.novelId, asset.id);
      } else {
        await deleteStorySettingsProp(props.novelId, asset.id);
      }
    },
    onSuccess: async () => {
      toast.success(`${TYPE_LABELS[asset?.type ?? "character"]}「${asset?.name ?? ""}」已删除。`);
      props.onOpenChange(false);
      await props.onDeleted();
    },
    onError: (error) => toast.error("删除失败", { description: error instanceof Error ? error.message : undefined }),
  });

  return (
    <Dialog open={asset !== null} onOpenChange={props.onOpenChange}>
      {asset && source ? (
        <AppDialogContent
          title={asset.name}
          description={TYPE_LABELS[asset.type]}
          footer={
            <>
              <Button
                variant="destructive"
                size="sm"
                disabled={deleteMutation.isPending}
                onClick={() => {
                  if (window.confirm(`删除${TYPE_LABELS[asset.type]}「${asset.name}」？此操作不可恢复。`)) {
                    deleteMutation.mutate();
                  }
                }}
              >
                {deleteMutation.isPending
                  ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  : <Trash2 className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />}
                删除
              </Button>
              <Button variant="outline" onClick={() => props.onOpenChange(false)}>关闭</Button>
            </>
          }
        >
          <div className="space-y-4">
            {type === "character" ? (() => {
              const character = source as StorySettingsCharacter;
              return (
                <>
                  <div className="flex flex-wrap gap-1.5">
                    {character.gender ? <Badge variant="secondary">{GENDER_LABELS[character.gender] ?? character.gender}</Badge> : null}
                    {character.ageGroup ? <Badge variant="secondary">{AGE_LABELS[character.ageGroup] ?? character.ageGroup}</Badge> : null}
                  </div>
                  <DetailRow label="性格" value={character.personality} />
                  <DetailRow label="外貌" value={character.appearance} />
                  <DetailRow label="生图提示词" value={character.facePrompt} />
                  <DetailRow label="音色提示词" value={character.voiceTexture} />
                  <DetailRow label="背景" value={character.background} />
                  <DetailStates states={character.states} />
                </>
              );
            })() : type === "scene" ? (() => {
              const scene = source as StorySettingsScene;
              return (
                <>
                  {scene.sceneType ? <Badge variant="outline">{SCENE_TYPE_LABELS[scene.sceneType] ?? scene.sceneType}</Badge> : null}
                  <DetailRow label="概述" value={scene.summary} />
                  <DetailRow label="生图提示词" value={scene.environmentPrompt} />
                  <DetailRow label="剧情作用" value={scene.significance} />
                  <DetailStates states={scene.states} />
                </>
              );
            })() : (() => {
              const prop = source as StorySettingsProp;
              return (
                <>
                  <DetailRow label="生图提示词" value={prop.visualPrompt} />
                  <DetailStates states={prop.states} />
                </>
              );
            })()}
          </div>
        </AppDialogContent>
      ) : null}
    </Dialog>
  );
}

// 大纲编辑区右侧的设定资产面板：卡片只放类型和名字，点开弹窗看完整信息（生图提示词、
// 外观状态等）并可删除；工具栏为 左新增 / 中搜索框 / 右搜索按钮，新增走弹窗。
// 创建走正式设定接口，与「设定」页签共享缓存；名字实时进入大纲高亮名单。
export default function OutlineSettingsAside(props: OutlineSettingsAsideProps) {
  const queryClient = useQueryClient();
  const [keyword, setKeyword] = useState("");
  const [appliedKeyword, setAppliedKeyword] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [createType, setCreateType] = useState<AssetType>("character");
  const [createName, setCreateName] = useState("");
  const [createNote, setCreateNote] = useState("");
  const [detailId, setDetailId] = useState<string | null>(null);

  const assets = useMemo<AssetCard[]>(() => {
    const merged: AssetCard[] = [
      ...props.characters.map((character) => ({
        id: character.id,
        type: "character" as const,
        name: character.name,
        note: character.personality ?? "",
        updatedAt: character.updatedAt,
        source: character,
      })),
      ...props.scenes.map((scene) => ({
        id: scene.id,
        type: "scene" as const,
        name: scene.name,
        note: scene.summary ?? "",
        updatedAt: scene.updatedAt,
        source: scene,
      })),
      ...props.props.map((prop) => ({
        id: prop.id,
        type: "prop" as const,
        name: prop.name,
        note: prop.visualPrompt || prop.description || "",
        updatedAt: prop.updatedAt,
        source: prop,
      })),
    ];
    merged.sort((left, right) => (left.updatedAt < right.updatedAt ? 1 : -1));
    return merged;
  }, [props.characters, props.scenes, props.props]);

  const normalized = appliedKeyword.trim().toLowerCase();
  // 有搜索词时检索全库（找旧资产的入口）；没有时只显示本章脚本用到的资产——
  // 用到的排上面（按脚本里首次出现的顺序），没用到的不显示；脚本里用到了但
  // 还没有对应资产的（场景/角色按名字精确对应）在下方以橙红警告卡提示创建。
  const filtered = normalized
    ? assets.filter(
      (asset) =>
        asset.name.toLowerCase().includes(normalized)
        || asset.note.toLowerCase().includes(normalized),
    )
    : (() => {
        const usageKey = (asset: AssetCard) => `${asset.type}:${asset.name.trim()}`;
        const order = new Map(props.usage.usedOrderKeys.map((key, index) => [key, index]));
        const tail = props.usage.usedOrderKeys.length;
        return assets
          .filter((asset) => props.usage.usedKeys.has(usageKey(asset)))
          .sort((left, right) =>
            (order.get(usageKey(left)) ?? tail) - (order.get(usageKey(right)) ?? tail)
            || (left.updatedAt < right.updatedAt ? 1 : -1));
      })();
  const detailAsset = detailId ? assets.find((asset) => asset.id === detailId) ?? null : null;

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.novels.storySettingsCharacters(props.novelId) });
    await queryClient.invalidateQueries({ queryKey: queryKeys.novels.storySettingsScenes(props.novelId) });
    await queryClient.invalidateQueries({ queryKey: queryKeys.novels.storySettingsProps(props.novelId) });
    await queryClient.invalidateQueries({ queryKey: queryKeys.novels.storySettingsOverview(props.novelId) });
  };

  const createMutation = useMutation({
    mutationFn: async (): Promise<string> => {
      const name = createName.trim();
      if (createType === "character") {
        await createStorySettingsCharacter(props.novelId, {
          name,
          personality: createNote.trim() || undefined,
        });
      } else if (createType === "scene") {
        await createStorySettingsScene(props.novelId, {
          name,
          summary: createNote.trim() || undefined,
        });
      } else {
        // 道具只有名字和画面提示词：快速创建里写的一句说明直接作为提示词起点
        await createStorySettingsProp(props.novelId, {
          name,
          visualPrompt: createNote.trim() || undefined,
        });
      }
      return name;
    },
    onSuccess: async () => {
      await invalidate();
      toast.success(`${TYPE_LABELS[createType]}「${createName.trim()}」已创建，大纲里出现这个名字会高亮。`);
      setCreateName("");
      setCreateNote("");
      setCreateOpen(false);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "创建失败，请重试。"),
  });

  const applySearch = () => {
    setAppliedKeyword(keyword);
  };

  return (
    <aside className="flex max-h-[60vh] flex-col overflow-hidden rounded-3xl border border-border bg-background shadow-sm lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)]">
      <div className="border-b border-border p-4">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="icon"
            className="h-8 w-8 shrink-0"
            aria-label="新增设定"
            title="新增设定"
            onClick={() => setCreateOpen(true)}
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
          </Button>
          <Input
            value={keyword}
            aria-label="搜索设定"
            placeholder="搜索名称或说明"
            maxLength={40}
            className="h-8 min-w-0 flex-1"
            onChange={(event) => setKeyword(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                applySearch();
                event.currentTarget.blur();
              }
            }}
          />
          <Button
            type="button"
            size="icon"
            variant="outline"
            className="h-8 w-8 shrink-0"
            aria-label="搜索"
            onClick={applySearch}
          >
            <Search className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {filtered.length === 0 && (!normalized || props.usage.missing.length === 0) ? (
          <div className="flex h-full min-h-[120px] items-center justify-center text-sm text-muted-foreground">空</div>
        ) : (
          <ul className="space-y-2">
            {!normalized ? props.usage.missing.map((missing) => (
              <li key={`missing-${missing.type}-${missing.name}`}>
                <div className="w-full rounded-2xl border border-orange-500/50 bg-orange-500/10 p-3">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "inline-flex h-5 shrink-0 items-center rounded border px-1.5 text-[10px] font-medium leading-none",
                        "border-orange-500/40 bg-orange-500/15 text-orange-600 dark:text-orange-400",
                      )}
                    >
                      {TYPE_LABELS[missing.type]}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground" title="脚本里用到了，但设定里还没有这个名字">{missing.name}</span>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 shrink-0 border-orange-500/40 px-2 text-xs text-orange-700 dark:text-orange-400"
                      onClick={() => {
                        setCreateType(missing.type);
                        setCreateName(missing.name);
                        setCreateOpen(true);
                      }}
                    >
                      创建
                    </Button>
                  </div>
                  <p className="mt-1 text-xs leading-4 text-orange-600 dark:text-orange-400">脚本里用到了，但还没有生成设定</p>
                </div>
              </li>
            )) : null}
            {filtered.map((asset) => (
              <li key={`${asset.type}-${asset.id}`}>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-2xl border border-border/70 bg-background p-3 text-left transition-colors hover:border-primary/40"
                  onClick={() => setDetailId(asset.id)}
                >
                  <span
                    className={cn(
                      "inline-flex h-5 shrink-0 items-center rounded border px-1.5 text-[10px] font-medium leading-none",
                      TYPE_TONES[asset.type],
                    )}
                  >
                    {TYPE_LABELS[asset.type]}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{asset.name}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <AssetDetailDialog
        novelId={props.novelId}
        asset={detailAsset}
        onOpenChange={(open) => { if (!open) setDetailId(null); }}
        onDeleted={invalidate}
      />

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <AppDialogContent
          title="新增设定"
          footer={
            <>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>取消</Button>
              <Button
                onClick={() => createMutation.mutate()}
                disabled={createMutation.isPending || !createName.trim()}
              >
                {createMutation.isPending
                  ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                  : null}
                创建
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="asset-create-type">类型</label>
              <SelectControl
                id="asset-create-type"
                className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
                value={createType}
                onChange={(event) => setCreateType(event.target.value as AssetType)}
              >
                <option value="character">角色</option>
                <option value="scene">场景</option>
                <option value="prop">道具</option>
              </SelectControl>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="asset-create-name">名称</label>
              <Input
                id="asset-create-name"
                value={createName}
                maxLength={40}
                placeholder={createType === "character" ? "如：林川" : createType === "scene" ? "如：深海修理铺" : "如：会说话的旧潜艇"}
                onChange={(event) => setCreateName(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="asset-create-note">一句话说明（可选）</label>
              <Input
                id="asset-create-note"
                value={createNote}
                maxLength={120}
                placeholder="性格、用途或一句补充"
                onChange={(event) => setCreateNote(event.target.value)}
              />
            </div>
          </div>
        </AppDialogContent>
      </Dialog>
    </aside>
  );
}
