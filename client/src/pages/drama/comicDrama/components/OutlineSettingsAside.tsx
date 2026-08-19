import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Search } from "lucide-react";
import {
  createStorySettingsCharacter,
  createStorySettingsProp,
  createStorySettingsScene,
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

type AssetType = "character" | "scene" | "prop";

interface AssetCard {
  id: string;
  type: AssetType;
  name: string;
  note: string;
  updatedAt: string;
}

interface OutlineSettingsAsideProps {
  novelId: string;
  characters: StorySettingsCharacter[];
  scenes: StorySettingsScene[];
  props: StorySettingsProp[];
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

const CHARACTER_ROLE_OPTIONS = ["主角", "重要配角", "配角", "反派", "路人"];

// 大纲编辑区右侧的设定资产面板：固定在右侧、内部滚动，按最近更新排列的
// 角色/场景/道具卡片流；工具栏为 左新增 / 中搜索框 / 右搜索按钮，新增走弹窗。
// 创建走正式设定接口，与「设定」页签共享缓存；名字实时进入大纲高亮名单。
export default function OutlineSettingsAside(props: OutlineSettingsAsideProps) {
  const queryClient = useQueryClient();
  const [keyword, setKeyword] = useState("");
  const [appliedKeyword, setAppliedKeyword] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [createType, setCreateType] = useState<AssetType>("character");
  const [createName, setCreateName] = useState("");
  const [createNote, setCreateNote] = useState("");
  const [characterRole, setCharacterRole] = useState("配角");

  const assets = useMemo<AssetCard[]>(() => {
    const merged: AssetCard[] = [
      ...props.characters.map((character) => ({
        id: character.id,
        type: "character" as const,
        name: character.name,
        note: character.personality ?? "",
        updatedAt: character.updatedAt,
      })),
      ...props.scenes.map((scene) => ({
        id: scene.id,
        type: "scene" as const,
        name: scene.name,
        note: scene.summary ?? "",
        updatedAt: scene.updatedAt,
      })),
      ...props.props.map((prop) => ({
        id: prop.id,
        type: "prop" as const,
        name: prop.name,
        note: prop.description ?? "",
        updatedAt: prop.updatedAt,
      })),
    ];
    merged.sort((left, right) => (left.updatedAt < right.updatedAt ? 1 : -1));
    return merged;
  }, [props.characters, props.scenes, props.props]);

  const normalized = appliedKeyword.trim().toLowerCase();
  const filtered = normalized
    ? assets.filter(
        (asset) =>
          asset.name.toLowerCase().includes(normalized)
          || asset.note.toLowerCase().includes(normalized),
      )
    : assets;

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
          role: characterRole,
          personality: createNote.trim() || undefined,
        });
      } else if (createType === "scene") {
        await createStorySettingsScene(props.novelId, {
          name,
          summary: createNote.trim() || undefined,
        });
      } else {
        await createStorySettingsProp(props.novelId, {
          name,
          description: createNote.trim() || undefined,
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
      <div className="space-y-2.5 border-b border-border p-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-foreground">设定</h3>
          <span className="text-xs text-muted-foreground">名字在大纲里高亮</span>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" size="sm" className="h-8 shrink-0 px-2.5" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" aria-hidden="true" />新增
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
        {filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-sm leading-6 text-muted-foreground">
            {normalized
              ? `没有匹配「${appliedKeyword.trim()}」的设定。`
              : "还没有角色、场景或道具，点「新增」创建。"}
          </div>
        ) : (
          <ul className="space-y-2">
            {filtered.map((asset) => (
              <li
                key={`${asset.type}-${asset.id}`}
                className="rounded-2xl border border-border/70 bg-background p-3"
              >
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "inline-flex h-5 shrink-0 items-center rounded border px-1.5 text-[10px] font-medium leading-none",
                      TYPE_TONES[asset.type],
                    )}
                  >
                    {TYPE_LABELS[asset.type]}
                  </span>
                  <span className="min-w-0 truncate text-sm font-medium text-foreground">{asset.name}</span>
                </div>
                {asset.note ? (
                  <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{asset.note}</p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <AppDialogContent
          title="新增设定"
          description="创建后名字会自动在大纲正文里高亮。"
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
            {createType === "character" ? (
              <div className="space-y-1.5">
                <label className="text-sm font-medium" htmlFor="asset-create-role">角色定位</label>
                <SelectControl
                  id="asset-create-role"
                  className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
                  value={characterRole}
                  onChange={(event) => setCharacterRole(event.target.value)}
                >
                  {CHARACTER_ROLE_OPTIONS.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </SelectControl>
              </div>
            ) : null}
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
