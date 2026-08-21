import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Pencil, Plus, Search, Sparkles, Trash2 } from "lucide-react";
import type { StorySettingsProp } from "@/api/story/storySettings";
import {
  createStorySettingsProp,
  deleteStorySettingsProp,
  generateStoryEntityDraft,
  getStorySettingsProps,
  updateStorySettingsProp,
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
  StoryAssetDetailDialog,
  type StoryAssetPresentation,
} from "@/components/storyAssets";
import {
  AssetStatesEditor,
  createInitialPropState,
  EMPTY_PROP_FORM,
  PropAssetFormFields,
  type PropAssetFormState,
} from "./assetForms";
import type { StoryAssetState } from "@ai-novel/shared/types/novelReferenceExtraction";

interface SettingsPropsTabProps {
  novelId: string;
  onChanged?: () => void | Promise<void>;
}

type PropFormState = PropAssetFormState;

function propStatesForEditor(prop: StorySettingsProp): StoryAssetState[] {
  return prop.states?.length > 0
    ? prop.states
    : [createInitialPropState(prop)];
}

function preparePropStatesForSave(
  states: StoryAssetState[],
  form: PropFormState,
  isCreating: boolean,
): StoryAssetState[] {
  if (!isCreating || states.length === 0) {
    return states;
  }
  const defaultInitialState = createInitialPropState({ name: "" });
  if (JSON.stringify(states[0]) !== JSON.stringify(defaultInitialState)) {
    return states;
  }
  return [createInitialPropState({ name: form.name.trim() }), ...states.slice(1)];
}

export default function SettingsPropsTab({ novelId, onChanged }: SettingsPropsTabProps) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<StorySettingsProp | null>(null);
  const [selectedAsset, setSelectedAsset] = useState<StoryAssetPresentation | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<PropFormState>(EMPTY_PROP_FORM);
  const [states, setStates] = useState<StoryAssetState[]>([]);
  const [hint, setHint] = useState("");
  const [keyword, setKeyword] = useState("");
  const [appliedKeyword, setAppliedKeyword] = useState("");

  const propsQuery = useQuery({
    queryKey: queryKeys.novels.storySettingsProps(novelId),
    queryFn: () => getStorySettingsProps(novelId),
  });
  const props = propsQuery.data?.data ?? [];
  const normalized = appliedKeyword.trim().toLowerCase();
  const filteredProps = normalized
    ? props.filter((prop) =>
        [prop.name, prop.visualPrompt, prop.description]
          .filter((text): text is string => Boolean(text))
          .some((text) => text.toLowerCase().includes(normalized)))
    : props;

  const statesValid = states.length > 0 && states.every((state) => Boolean(
    state.label.trim() && state.description.trim() && state.imagePrompt.trim(),
  ));

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.novels.storySettingsProps(novelId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.novels.storySettingsOverview(novelId) }),
    ]);
    await onChanged?.();
  };

  const saveMutation = useMutation({
    mutationFn: () => {
      const name = form.name.trim();
      const savedStates = preparePropStatesForSave(states, form, creating);
      const initial = savedStates[0];
      return editing
        ? updateStorySettingsProp(novelId, editing.id, {
          name,
          visualPrompt: initial?.imagePrompt?.trim() || null,
          // 旧字段表单里已不存在：编辑保存即清空，数据和界面保持一致
          description: null,
          plotFunction: null,
          ownerCharacterId: null,
          firstAppearHint: null,
          states: savedStates,
        })
        : createStorySettingsProp(novelId, {
          name,
          ...(initial?.imagePrompt?.trim() ? { visualPrompt: initial.imagePrompt.trim() } : {}),
          states: savedStates,
        });
    },
    onSuccess: async () => {
      toast.success(editing ? "道具已保存。" : "道具已添加。");
      closeDialog();
      await invalidate();
    },
    onError: (error) => {
      toast.error("道具保存失败。", { description: error instanceof Error ? error.message : undefined });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (propId: string) => deleteStorySettingsProp(novelId, propId),
    onSuccess: async () => {
      toast.success("道具已删除。");
      setSelectedAsset(null);
      await invalidate();
    },
    onError: (error) => {
      toast.error("道具删除失败。", { description: error instanceof Error ? error.message : undefined });
    },
  });

  const generateMutation = useMutation({
    mutationFn: () => generateStoryEntityDraft(novelId, "prop", hint),
    onSuccess: (response) => {
      const draft = response.data?.prop;
      if (!draft) {
        toast.error("AI 没有生成道具草稿，请重试。");
        return;
      }
      setForm({
        name: draft.name,
      });
      setStates([createInitialPropState(draft)]);
      toast.success("草稿已生成，可以直接修改后保存。");
    },
    onError: (error) => {
      toast.error("道具生成失败。", { description: error instanceof Error ? error.message : undefined });
    },
  });

  const openCreate = () => {
    setEditing(null);
    setCreating(true);
    setForm(EMPTY_PROP_FORM);
    setStates([createInitialPropState({ name: "" })]);
    setHint("");
  };

  const openEdit = (prop: StorySettingsProp) => {
    setCreating(false);
    setEditing(prop);
    setHint("");
    setForm({
      name: prop.name,
    });
    setStates(propStatesForEditor(prop));
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
          aria-label="添加道具"
          title="添加道具"
          onClick={openCreate}
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
        </Button>
        <Input
          value={keyword}
          aria-label="搜索道具"
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
      {propsQuery.isLoading ? (
        <div className="text-sm text-muted-foreground">正在加载道具...</div>
      ) : filteredProps.length === 0 ? (
        <div className="flex min-h-[120px] items-center justify-center text-sm text-muted-foreground">空</div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {filteredProps.map((prop) => {
            const asset = buildStoryAssetPresentation({ kind: "prop", asset: prop });
            return (
              <StoryAssetCard
                key={prop.id}
                asset={asset}
                onOpen={() => setSelectedAsset(asset)}
                actions={(
                  <>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(prop)} aria-label="编辑道具">
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive"
                      onClick={() => {
                        if (window.confirm(`删除道具「${prop.name}」？`)) deleteMutation.mutate(prop.id);
                      }}
                      disabled={deleteMutation.isPending}
                      aria-label="删除道具"
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

      <StoryAssetDetailDialog
        asset={selectedAsset}
        onOpenChange={(open) => { if (!open) setSelectedAsset(null); }}
        onEdit={selectedAsset ? () => {
          const source = selectedAsset.source as StorySettingsProp;
          setSelectedAsset(null);
          openEdit(source);
        } : undefined}
        onDelete={() => {
          if (selectedAsset && window.confirm(`删除道具「${selectedAsset.name}」？`)) {
            deleteMutation.mutate(selectedAsset.id);
          }
        }}
        deleting={deleteMutation.isPending}
      />

      <Dialog open={creating || editing !== null} onOpenChange={(open) => !open && closeDialog()}>
        <AppDialogContent
          className="max-w-6xl"
          title={editing ? "编辑道具" : "添加道具"}
          description={editing
            ? "管理道具名，以及每个状态的外观和图片提示词。"
            : "写一句提示（也可以留空），让 AI 生成道具草稿；生成后可以随意修改再保存。"}
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
                    placeholder="例如：外婆留下的怀表 / 一封烧掉一半的信"
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
                  {generateMutation.isPending ? "正在生成草稿..." : "AI 生成道具草稿"}
                </AiButton>
              </div>
            ) : null}
            <PropAssetFormFields
              value={form}
              onChange={(patch) => setForm((prev) => ({ ...prev, ...patch }))}
            />
            <AssetStatesEditor states={states} onChange={setStates} kind="prop" asset={editing ? { novelId, assetId: editing.id } : undefined} />
          </div>
        </AppDialogContent>
      </Dialog>
    </div>
  );
}
