import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Search } from "lucide-react";
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
import SelectControl from "@/components/common/SelectControl";
import { Button } from "@/components/ui/button";
import { AppDialogContent, Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { createInitialCharacterState } from "@/pages/novels/components/storySettings/assetForms";
import StoryAssetEditDialog from "@/pages/novels/components/storySettings/StoryAssetEditDialog";
import { invalidateStorySettingsCaches } from "@/pages/drama/comicDrama/storySettingsSync";
import {
  buildStoryAssetPresentation,
  StoryAssetCard,
  type StoryAssetKind,
  type StoryAssetPresentation,
} from "@/components/storyAssets";

type AssetType = StoryAssetKind;

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

// 大纲编辑区右侧的设定资产面板：卡片展示统一摘要，点开与「资产」页签同一个
// 可编辑可保存的弹窗（StoryAssetEditDialog，弹窗底部可删除，删除走二次确认）；
// 工具栏为 左新增 / 中搜索框 / 右搜索按钮，新增走弹窗。
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
  // 删除二次确认（2026-08-23 用户要求）：先弹确认框，确认后才真正删除。
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const assets = useMemo<StoryAssetPresentation[]>(() => {
    const merged: StoryAssetPresentation[] = [
      ...props.characters.map((character) => buildStoryAssetPresentation({ kind: "character", asset: character })),
      ...props.scenes.map((scene) => buildStoryAssetPresentation({ kind: "scene", asset: scene })),
      ...props.props.map((prop) => buildStoryAssetPresentation({ kind: "prop", asset: prop })),
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
        || asset.summary.toLowerCase().includes(normalized),
    )
    : (() => {
        const usageKey = (asset: StoryAssetPresentation) => `${asset.kind}:${asset.name.trim()}`;
        const order = new Map(props.usage.usedOrderKeys.map((key, index) => [key, index]));
        const tail = props.usage.usedOrderKeys.length;
        return assets
          .filter((asset) => props.usage.usedKeys.has(usageKey(asset)))
          .sort((left, right) =>
            (order.get(usageKey(left)) ?? tail) - (order.get(usageKey(right)) ?? tail)
            || (left.updatedAt < right.updatedAt ? 1 : -1));
      })();
  const detailAsset = detailId ? assets.find((asset) => asset.id === detailId) ?? null : null;

  const invalidate = () => invalidateStorySettingsCaches(queryClient, props.novelId);

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!detailAsset) return;
      if (detailAsset.kind === "character") {
        const character = detailAsset.source as StorySettingsCharacter;
        await deleteStorySettingsCharacter(props.novelId, character.id);
      } else if (detailAsset.kind === "scene") {
        const scene = detailAsset.source as StorySettingsScene;
        await deleteStorySettingsScene(props.novelId, scene.id);
      } else {
        const prop = detailAsset.source as StorySettingsProp;
        await deleteStorySettingsProp(props.novelId, prop.id);
      }
    },
    onSuccess: async () => {
      if (detailAsset) {
        toast.success(`${TYPE_LABELS[detailAsset.kind]}「${detailAsset.name}」已删除。`);
      }
      setDetailId(null);
      setDeleteConfirmOpen(false);
      await invalidate();
    },
    onError: (error) => toast.error("删除失败", { description: error instanceof Error ? error.message : undefined }),
  });

  const createMutation = useMutation({
    mutationFn: async (): Promise<string> => {
      const name = createName.trim();
      if (createType === "character") {
        await createStorySettingsCharacter(props.novelId, {
          name,
          states: [createInitialCharacterState({
            name,
            gender: "unknown",
            description: createNote.trim() || "角色默认外观",
            imagePrompt: createNote.trim() || "角色默认外观",
          })],
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
              <li key={`${asset.kind}-${asset.id}`}>
                <StoryAssetCard asset={asset} compact onOpen={() => setDetailId(asset.id)} />
              </li>
            ))}
          </ul>
        )}
      </div>

      <StoryAssetEditDialog
        novelId={props.novelId}
        kind={detailAsset?.kind ?? "character"}
        asset={detailAsset?.source ?? null}
        open={detailAsset !== null}
        onClose={() => setDetailId(null)}
        onChanged={invalidate}
        onDelete={() => setDeleteConfirmOpen(true)}
      />

      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AppDialogContent
          title={detailAsset ? `删除${detailAsset.typeLabel}「${detailAsset.name}」` : "删除"}
          footer={
            <>
              <Button variant="outline" onClick={() => setDeleteConfirmOpen(false)} disabled={deleteMutation.isPending}>取消</Button>
              <Button
                variant="destructive"
                disabled={deleteMutation.isPending}
                onClick={() => deleteMutation.mutate()}
              >
                {deleteMutation.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" /> : null}
                删除
              </Button>
            </>
          }
        >
          <p className="text-sm leading-6 text-muted-foreground">删除后不可恢复，已生成的状态图与音色会一起删除。</p>
        </AppDialogContent>
      </Dialog>

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
              <label className="text-sm font-medium" htmlFor="asset-create-note">{createType === "character" ? "默认状态说明（可选）" : "一句话说明（可选）"}</label>
              <Input
                id="asset-create-note"
                value={createNote}
                maxLength={120}
                placeholder={createType === "character" ? "例如：青年，黑色短发，穿深色战斗服" : "性格、用途或一句补充"}
                onChange={(event) => setCreateNote(event.target.value)}
              />
            </div>
          </div>
        </AppDialogContent>
      </Dialog>
    </aside>
  );
}
