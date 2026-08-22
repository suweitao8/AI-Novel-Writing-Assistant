import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Search, Sparkles, Trash2 } from "lucide-react";
import type { StorySettingsScene } from "@/api/story/storySettings";
import {
  createStorySettingsScene,
  deleteStorySettingsScene,
  generateStoryEntityDraft,
  getStorySettingsScenes,
  updateStorySettingsScene,
} from "@/api/story/storySettings";
import { queryKeys } from "@/api/queryKeys";
import AiButton from "@/components/common/AiButton";
import { Button } from "@/components/ui/button";
import { Dialog, AppDialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import {
  buildStoryAssetPresentation,
  StoryAssetCard,
} from "@/components/storyAssets";
import {
  AssetStatesEditor,
  createInitialSceneState,
  EMPTY_SCENE_FORM,
  SceneAssetFormFields,
  type SceneAssetFormState,
} from "./assetForms";
import type { StoryAssetState } from "@ai-novel/shared/types/novelReferenceExtraction";

interface SettingsScenesTabProps {
  novelId: string;
  onChanged?: () => void | Promise<void>;
}

type SceneFormState = SceneAssetFormState;

function sceneStatesForEditor(scene: StorySettingsScene): StoryAssetState[] {
  return scene.states?.length > 0
    ? scene.states
    : [createInitialSceneState(scene)];
}

function prepareSceneStatesForSave(
  states: StoryAssetState[],
  form: SceneFormState,
  isCreating: boolean,
): StoryAssetState[] {
  if (!isCreating || states.length === 0) {
    return states;
  }
  const defaultInitialState = createInitialSceneState({ name: "" });
  if (JSON.stringify(states[0]) !== JSON.stringify(defaultInitialState)) {
    return states;
  }
  return [createInitialSceneState({ name: form.name.trim() }), ...states.slice(1)];
}

export default function SettingsScenesTab({ novelId, onChanged }: SettingsScenesTabProps) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<StorySettingsScene | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<SceneFormState>(EMPTY_SCENE_FORM);
  const [states, setStates] = useState<StoryAssetState[]>([]);
  const [hint, setHint] = useState("");
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

  const statesValid = states.length > 0 && states.every((state) => Boolean(
    state.label.trim() && state.description.trim() && state.imagePrompt.trim(),
  ));

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.novels.storySettingsScenes(novelId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.novels.storySettingsOverview(novelId) }),
    ]);
    await onChanged?.();
  };

  const saveMutation = useMutation({
    mutationFn: () => {
      const savedStates = prepareSceneStatesForSave(states, form, creating);
      const initial = savedStates[0];
      const compatibilityFields = {
        sceneType: initial?.sceneType ?? null,
        summary: initial?.description?.trim() || null,
        environmentPrompt: initial?.imagePrompt?.trim() || null,
        timeOfDay: initial?.timeOfDay ?? null,
        weather: initial?.weather ?? null,
      };
      return editing
        ? updateStorySettingsScene(novelId, editing.id, {
          name: form.name.trim(),
          ...compatibilityFields,
          states: savedStates,
        })
        : createStorySettingsScene(novelId, {
          name: form.name.trim(),
          ...(compatibilityFields.sceneType ? { sceneType: compatibilityFields.sceneType } : {}),
          ...(compatibilityFields.summary ? { summary: compatibilityFields.summary } : {}),
          ...(compatibilityFields.environmentPrompt ? { environmentPrompt: compatibilityFields.environmentPrompt } : {}),
          ...(compatibilityFields.timeOfDay ? { timeOfDay: compatibilityFields.timeOfDay } : {}),
          ...(compatibilityFields.weather ? { weather: compatibilityFields.weather } : {}),
          states: savedStates,
        });
    },
    onSuccess: async () => {
      toast.success(editing ? "场景已保存。" : "场景已添加。");
      setEditing(null);
      setCreating(false);
      await invalidate();
    },
    onError: (error) => {
      toast.error("场景保存失败。", { description: error instanceof Error ? error.message : undefined });
    },
  });

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

  const generateMutation = useMutation({
    mutationFn: () => generateStoryEntityDraft(novelId, "scene", hint),
    onSuccess: (response) => {
      const draft = response.data?.scene;
      if (!draft) {
        toast.error("AI 没有生成场景草稿，请重试。");
        return;
      }
      setForm({
        name: draft.name,
      });
      setStates([createInitialSceneState(draft)]);
      toast.success("草稿已生成，可以直接修改后保存。");
    },
    onError: (error) => {
      toast.error("场景生成失败。", { description: error instanceof Error ? error.message : undefined });
    },
  });

  const openCreate = () => {
    setEditing(null);
    setCreating(true);
    setForm(EMPTY_SCENE_FORM);
    setStates([createInitialSceneState({ name: "" })]);
    setHint("");
  };

  const openEdit = (scene: StorySettingsScene) => {
    setCreating(false);
    setEditing(scene);
    setHint("");
    setForm({ name: scene.name });
    setStates(sceneStatesForEditor(scene));
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

      <Dialog open={creating || editing !== null} onOpenChange={(open) => !open && closeDialog()}>
        <AppDialogContent
          className="max-w-6xl"
          title={editing ? "编辑场景" : "添加场景"}
          description={editing
            ? "管理场景名，以及每个状态的空间、时间、天气和画面提示词。"
            : "写一句提示（也可以留空），让 AI 生成完整场景草稿；生成后可以随意修改再保存。"}
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
                    placeholder="例如：深夜的便利店 / 雨后的老巷子"
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
                  {generateMutation.isPending ? "正在生成草稿..." : "AI 生成场景草稿"}
                </AiButton>
              </div>
            ) : null}
            <SceneAssetFormFields value={form} onChange={(patch) => setForm((prev) => ({ ...prev, ...patch }))} />
            <AssetStatesEditor states={states} onChange={setStates} kind="scene" asset={editing ? { novelId, assetId: editing.id } : undefined} />
          </div>
        </AppDialogContent>
      </Dialog>
    </div>
  );
}
