import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Trash2 } from "lucide-react";
import type { StorySettingsCharacter } from "@/api/story/storySettings";
import {
  deleteStorySettingsCharacter,
  getStorySettingsCharacters,
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

interface SettingsCharactersTabProps {
  novelId: string;
  onChanged?: () => void | Promise<void>;
}

// 角色列表：卡片点开与漫剧脚本页右侧列表是同一个编辑弹窗（StoryAssetEditDialog），
// 新建/编辑/状态图音色都在弹窗里；这里的本地逻辑只剩 查询/搜索/删除。
export default function SettingsCharactersTab({ novelId, onChanged }: SettingsCharactersTabProps) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<StorySettingsCharacter | null>(null);
  const [creating, setCreating] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [appliedKeyword, setAppliedKeyword] = useState("");

  const charactersQuery = useQuery({
    queryKey: queryKeys.novels.storySettingsCharacters(novelId),
    queryFn: () => getStorySettingsCharacters(novelId),
  });
  const characters = charactersQuery.data?.data ?? [];
  const normalized = appliedKeyword.trim().toLowerCase();
  const filteredCharacters = normalized
    ? characters.filter((character) =>
        [
          character.name,
          ...character.states.flatMap((state) => [state.label, state.description, state.imagePrompt, state.voicePrompt ?? ""]),
        ]
          .filter((text): text is string => Boolean(text))
          .some((text) => text.toLowerCase().includes(normalized)))
    : characters;

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.novels.storySettingsCharacters(novelId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.novels.storySettingsOverview(novelId) }),
    ]);
    await onChanged?.();
  };

  const deleteMutation = useMutation({
    mutationFn: (characterId: string) => deleteStorySettingsCharacter(novelId, characterId),
    onSuccess: async () => {
      toast.success("角色已删除。");
      await invalidate();
    },
    onError: (error) => {
      toast.error("角色删除失败。", { description: error instanceof Error ? error.message : undefined });
    },
  });

  const openCreate = () => {
    setEditing(null);
    setCreating(true);
  };

  const openEdit = (character: StorySettingsCharacter) => {
    setCreating(false);
    setEditing(character);
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
          aria-label="添加角色"
          title="添加角色"
          onClick={openCreate}
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
        </Button>
        <Input
          value={keyword}
          aria-label="搜索角色"
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
      {charactersQuery.isLoading ? (
        <div className="text-sm text-muted-foreground">正在加载角色...</div>
      ) : filteredCharacters.length === 0 ? (
        <div className="flex min-h-[120px] items-center justify-center text-sm text-muted-foreground">空</div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {filteredCharacters.map((character) => {
            const asset = buildStoryAssetPresentation({ kind: "character", asset: character });
            return (
              <StoryAssetCard
                key={character.id}
                asset={asset}
                onOpen={() => openEdit(character)}
                actions={(
                  <>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                      aria-label="删除角色"
                      disabled={deleteMutation.isPending}
                      onClick={() => {
                        if (window.confirm(`删除角色「${character.name}」？已生成的分镜与配音不受影响。`)) {
                          deleteMutation.mutate(character.id);
                        }
                      }}
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
        kind="character"
        asset={editing}
        open={creating || editing !== null}
        onClose={closeDialog}
        onChanged={onChanged}
      />
    </div>
  );
}
