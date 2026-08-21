import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, ImagePlus, Pencil, Plus, Search, Sparkles, Trash2 } from "lucide-react";
import type { StorySettingsProp } from "@/api/story/storySettings";
import {
  createStorySettingsProp,
  deleteStorySettingsProp,
  generateStoryEntityDraft,
  generateStoryPropImage,
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
import { AssetStatesEditor, EMPTY_PROP_FORM, PropAssetFormFields, type PropAssetFormState } from "./assetForms";
import type { StoryAssetState } from "@ai-novel/shared/types/novelReferenceExtraction";

interface SettingsPropsTabProps {
  novelId: string;
  onChanged?: () => void | Promise<void>;
}

type PropFormState = PropAssetFormState;

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
      const visualPrompt = form.visualPrompt.trim();
      return editing
        ? updateStorySettingsProp(novelId, editing.id, {
          name,
          visualPrompt: visualPrompt || null,
          // 旧字段表单里已不存在：编辑保存即清空，数据和界面保持一致
          description: null,
          plotFunction: null,
          ownerCharacterId: null,
          firstAppearHint: null,
          states,
        })
        : createStorySettingsProp(novelId, { name, visualPrompt: visualPrompt || undefined });
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

  // 45° 透视参考图：同步生成，完成后就地展示。
  const imageMutation = useMutation({
    mutationFn: () => {
      if (!editing) {
        throw new Error("请先保存道具再生成图片。");
      }
      return generateStoryPropImage(novelId, editing.id);
    },
    onSuccess: async (result) => {
      const image = result.data ?? null;
      setEditing((prev) => (prev ? { ...prev, image } : prev));
      await invalidate();
      toast.success("道具图片已生成。");
    },
    onError: (error) => {
      toast.error("道具图片生成失败。", { description: error instanceof Error ? error.message : undefined });
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
        // 旧草稿可能只写了外观描述：没有提示词时把它带进来当画面提示词的起点
        visualPrompt: draft.visualPrompt || draft.description || "",
      });
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
    setStates([]);
    setHint("");
  };

  const openEdit = (prop: StorySettingsProp) => {
    setCreating(false);
    setEditing(prop);
    setHint("");
    setForm({
      name: prop.name,
      // 旧道具可能只写了外观描述：没有提示词时带进来，避免一保存就把内容弄丢
      visualPrompt: prop.visualPrompt || prop.description || "",
    });
    setStates(prop.states ?? []);
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
          title={editing ? "编辑道具" : "添加道具"}
          description={editing
            ? "核对道具名和画面提示词，生成道具图时直接使用。"
            : "写一句提示（也可以留空），让 AI 生成道具草稿；生成后可以随意修改再保存。"}
          footer={
            <>
              <Button variant="outline" onClick={closeDialog} disabled={saveMutation.isPending}>取消</Button>
              <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !form.name.trim()}>
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
            {editing ? (
              <div className="space-y-2 rounded-lg border border-border bg-muted/20 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">45° 透视参考图</span>
                  <Button size="sm" variant="outline" onClick={() => imageMutation.mutate()} disabled={imageMutation.isPending}>
                    {imageMutation.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <ImagePlus className="mr-1 h-4 w-4" />}
                    {imageMutation.isPending ? "生成中..." : editing.image?.url ? "重新生成" : "生成图片"}
                  </Button>
                </div>
                {editing.image?.url ? (
                  <img src={editing.image.url} alt={`${editing.name} 参考图`} className="max-h-64 w-full rounded-lg border border-border object-contain" />
                ) : (
                  <p className="text-xs leading-5 text-muted-foreground">还没有图片。生成后，道具出现在分镜画面里时会作为参考图。</p>
                )}
              </div>
            ) : null}
            {editing ? (
              <AssetStatesEditor states={states} onChange={setStates} kind="prop" asset={{ novelId, assetId: editing.id }} />
            ) : null}
          </div>
        </AppDialogContent>
      </Dialog>
    </div>
  );
}
