import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Trash2 } from "lucide-react";
import type { StorySettingsScene } from "@/api/story/storySettings";
import {
  deleteStorySettingsScene,
  getStorySettingsScenes,
} from "@/api/story/storySettings";
import { queryKeys } from "@/api/queryKeys";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import {
  buildStoryAssetPresentation,
  StoryAssetCard,
} from "@/components/storyAssets";
import StoryAssetEditDialog from "./StoryAssetEditDialog";

interface SettingsScenesTabProps {
  novelId: string;
  onChanged?: () => void | Promise<void>;
}

// 场景列表：卡片点开与漫剧脚本页右侧列表是同一个编辑弹窗（StoryAssetEditDialog），
// 新建/编辑/状态图都在弹窗里；这里的本地逻辑只剩 查询/搜索/删除。
export default function SettingsScenesTab({ novelId, onChanged }: SettingsScenesTabProps) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<StorySettingsScene | null>(null);
  const [creating, setCreating] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [appliedKeyword, setAppliedKeyword] = useState("");

  const scenesQuery = useQuery({
    queryKey: queryKeys.novels.storySettingsScenes(novelId),
    queryFn: () => getStorySettingsScenes(novelId),
  });
  const scenes = scenesQuery.data?.data ?? [];
  const normalized = appliedKeyword.trim().toLowerCase();
  const filteredScenes = normalized
    ? scenes.filter((scene) =>
        [scene.name, scene.summary, scene.environmentPrompt, scene.significance]
          .filter((text): text is string => Boolean(text))
          .some((text) => text.toLowerCase().includes(normalized)))
    : scenes;

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.novels.storySettingsScenes(novelId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.novels.storySettingsOverview(novelId) }),
    ]);
    await onChanged?.();
  };

  const deleteMutation = useMutation({
    mutationFn: (sceneId: string) => deleteStorySettingsScene(novelId, sceneId),
    onSuccess: async () => {
      toast.success("场景已删除。");
      await invalidate();
    },
    onError: (error) => {
      toast.error("场景删除失败。", { description: error instanceof Error ? error.message : undefined });
    },
  });

  const openCreate = () => {
    setEditing(null);
    setCreating(true);
  };

  const openEdit = (scene: StorySettingsScene) => {
    setCreating(false);
    setEditing(scene);
  };

  const closeDialog = () => {
    setEditing(null);
    setCreating(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button
          type="button"
          size="icon"
          className="h-8 w-8 shrink-0"
          aria-label="添加场景"
          title="添加场景"
          onClick={openCreate}
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
        </Button>
        <Input
          value={keyword}
          aria-label="搜索场景"
          placeholder="搜索名称或说明"
          maxLength={40}
          className="h-9 min-w-0 max-w-sm flex-1"
          onChange={(event) => setKeyword(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              setAppliedKeyword(keyword);
              event.currentTarget.blur();
            }
          }}
        />
        <Button
          type="button"
          size="icon"
          variant="outline"
          className="h-9 w-9 shrink-0"
          aria-label="搜索"
          onClick={() => setAppliedKeyword(keyword)}
        >
          <Search className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
      {scenesQuery.isLoading ? (
        <div className="text-sm text-muted-foreground">正在加载场景...</div>
      ) : filteredScenes.length === 0 ? (
        <div className="flex min-h-[120px] items-center justify-center text-sm text-muted-foreground">空</div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {filteredScenes.map((scene) => {
            const asset = buildStoryAssetPresentation({ kind: "scene", asset: scene });
            return (
              <StoryAssetCard
                key={scene.id}
                asset={asset}
                onOpen={() => openEdit(scene)}
                actions={(
                  <>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive"
                      onClick={() => {
                        if (window.confirm(`删除场景「${scene.name}」？`)) deleteMutation.mutate(scene.id);
                      }}
                      disabled={deleteMutation.isPending}
                      aria-label="删除场景"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </>
                )}
              />
            );
          })}
        </div>
      )}

      <StoryAssetEditDialog
        novelId={novelId}
        kind="scene"
        asset={editing}
        open={creating || editing !== null}
        onClose={closeDialog}
        onChanged={onChanged}
      />
    </div>
  );
}
