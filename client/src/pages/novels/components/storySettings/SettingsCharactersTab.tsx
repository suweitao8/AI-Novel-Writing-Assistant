import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Search, Sparkles, Trash2 } from "lucide-react";
import type { StorySettingsCharacter } from "@/api/story/storySettings";
import {
  createStorySettingsCharacter,
  deleteStorySettingsCharacter,
  generateStoryEntityDraft,
  getStorySettingsCharacters,
  updateStorySettingsCharacter,
} from "@/api/story/storySettings";
import { queryKeys } from "@/api/queryKeys";
import AiButton from "@/components/common/AiButton";
import { Button } from "@/components/ui/button";
import { Dialog, AppDialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import SelectControl from "@/components/common/SelectControl";
import { toast } from "@/components/ui/toast";
import {
  buildStoryAssetPresentation,
  StoryAssetCard,
} from "@/components/storyAssets";
import {
  AssetStatesEditor,
  CharacterAssetFormFields,
  createInitialCharacterState,
  EMPTY_CHARACTER_FORM,
  type CharacterAssetFormState,
} from "./assetForms";
import type { StoryAssetState } from "@ai-novel/shared/types/novelReferenceExtraction";

interface SettingsCharactersTabProps {
  novelId: string;
  onChanged?: () => void | Promise<void>;
}

type CharacterFormState = CharacterAssetFormState;

export function prepareCharacterStatesForSave(
  states: StoryAssetState[],
  form: CharacterFormState,
  isCreating: boolean,
): StoryAssetState[] {
  if (!isCreating || states.length === 0) {
    return states;
  }
  const defaultInitialState = createInitialCharacterState({ gender: EMPTY_CHARACTER_FORM.gender });
  if (JSON.stringify(states[0]) !== JSON.stringify(defaultInitialState)) {
    return states;
  }
  return [
    createInitialCharacterState({
      name: form.name.trim(),
      gender: form.gender || "unknown",
    }),
    ...states.slice(1),
  ];
}

export default function SettingsCharactersTab({ novelId, onChanged }: SettingsCharactersTabProps) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<StorySettingsCharacter | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<CharacterFormState>(EMPTY_CHARACTER_FORM);
  const [states, setStates] = useState<StoryAssetState[]>([]);
  const [hint, setHint] = useState("");
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

  const statesValid = states.length > 0 && states.every((state) => Boolean(state.label.trim() && state.description.trim()));

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.novels.storySettingsCharacters(novelId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.novels.storySettingsOverview(novelId) }),
    ]);
    await onChanged?.();
  };

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = {
        name: form.name.trim(),
        gender: form.gender || undefined,
        states: prepareCharacterStatesForSave(states, form, creating),
      };
      return editing
        ? updateStorySettingsCharacter(novelId, editing.id, {
            ...payload,
          })
        : createStorySettingsCharacter(novelId, payload);
    },
    onSuccess: async () => {
      toast.success(editing ? "角色已保存。" : "角色已添加。");
      closeDialog();
      await invalidate();
    },
    onError: (error) => {
      toast.error("角色保存失败。", { description: error instanceof Error ? error.message : undefined });
    },
  });

  const generateMutation = useMutation({
    mutationFn: () => generateStoryEntityDraft(novelId, "character", hint),
    onSuccess: (response) => {
      const draft = response.data?.character;
      if (!draft) {
        toast.error("AI 没有生成角色草稿，请重试。");
        return;
      }
      setForm({
        name: draft.name,
        gender: draft.gender || "unknown",
      });
      setStates([createInitialCharacterState({
        name: draft.name,
        gender: draft.gender || "unknown",
        ageGroup: draft.ageGroup as StoryAssetState["ageGroup"],
        description: [draft.appearance, draft.physique, draft.attireStyle].filter(Boolean).join("；") || "角色初始外观",
        imagePrompt: [draft.facePrompt, draft.appearance, draft.physique, draft.attireStyle].filter(Boolean).join("；") || "角色初始外观",
        ...(draft.voicePrompt ? { voicePrompt: draft.voicePrompt } : {}),
      })]);
      toast.success("草稿已生成，可以直接修改后保存。");
    },
    onError: (error) => {
      toast.error("角色生成失败。", { description: error instanceof Error ? error.message : undefined });
    },
  });

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
    setForm(EMPTY_CHARACTER_FORM);
    setStates([createInitialCharacterState({ gender: EMPTY_CHARACTER_FORM.gender })]);
    setHint("");
  };

  const openEdit = (character: StorySettingsCharacter) => {
    setCreating(false);
    setEditing(character);
    setHint("");
    setForm({
      name: character.name,
      gender: character.gender ?? "unknown",
    });
    setStates(character.states?.length
      ? character.states
      : [createInitialCharacterState({ name: character.name, gender: character.gender ?? "unknown" })]);
  };

  const closeDialog = () => {
    setEditing(null);
    setCreating(false);
  };

  const updateField = (patch: Partial<CharacterFormState>) => {
    setForm((prev) => ({ ...prev, ...patch }));
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

      <Dialog open={creating || editing !== null} onOpenChange={(open) => !open && closeDialog()}>
        <AppDialogContent
          className="max-w-6xl"
          title={editing ? "编辑角色" : "添加角色"}
          description={editing
            ? "调整角色设定后，后续生成的人物言行会按新设定走。"
            : "写一句提示（也可以留空），让 AI 生成完整角色草稿；生成后可以随意修改再保存。"}
          footer={
            <>
              <Button variant="outline" onClick={closeDialog} disabled={saveMutation.isPending}>取消</Button>
              <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !form.name.trim() || !statesValid}>
                {saveMutation.isPending ? "保存中..." : "保存"}
              </Button>
            </>
          }
        >
          <div className="space-y-3">
            {creating ? (
              <div className="space-y-2 rounded-lg border border-dashed border-border bg-muted/30 p-3">
                <label className="block space-y-1">
                  <span className="text-sm font-medium">AI 生成提示</span>
                  <Input
                    value={hint}
                    placeholder="例如：男大学生 / 退休老刑警 / 神秘的古董店老板娘"
                    onChange={(event) => setHint(event.target.value)}
                    disabled={generateMutation.isPending}
                  />
                </label>
                <AiButton
                  className="w-full"
                  variant="outline"
                  onClick={() => generateMutation.mutate()}
                  disabled={generateMutation.isPending}
                >
                  {generateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  {generateMutation.isPending ? "正在生成草稿..." : "AI 生成角色草稿"}
                </AiButton>
                <p className="text-xs leading-5 text-muted-foreground">
                  提示里写的性别、年龄、职业会被保留，其余由 AI 合理发明（含随机姓名）。
                </p>
              </div>
            ) : null}
            <CharacterAssetFormFields value={form} onChange={updateField} />
            <AssetStatesEditor states={states} onChange={setStates} kind="character" novelId={novelId} assetName={form.name || undefined} asset={editing ? { novelId, assetId: editing.id } : undefined} />
          </div>
        </AppDialogContent>
      </Dialog>
    </div>
  );
}
