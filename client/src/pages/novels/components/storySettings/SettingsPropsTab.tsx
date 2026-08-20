import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Package, Pencil, Plus, Sparkles, Trash2 } from "lucide-react";
import type { StorySettingsProp } from "@/api/story/storySettings";
import {
  createStorySettingsProp,
  deleteStorySettingsProp,
  generateStoryEntityDraft,
  getStorySettingsCharacters,
  getStorySettingsProps,
  regenerateStorySettings,
  updateStorySettingsProp,
} from "@/api/story/storySettings";
import { queryKeys } from "@/api/queryKeys";
import AiButton from "@/components/common/AiButton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, AppDialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import SelectControl from "@/components/common/SelectControl";
import { toast } from "@/components/ui/toast";
import { AssetStatesEditor, EMPTY_PROP_FORM, PropAssetFormFields, type PropAssetFormState } from "./assetForms";
import type { StoryAssetState } from "@ai-novel/shared/types/novelReferenceExtraction";
import { cn } from "@/lib/utils";

interface SettingsPropsTabProps {
  novelId: string;
  onChanged?: () => void | Promise<void>;
}

type PropFormState = PropAssetFormState;

const IMPORTANCE_LABELS: Record<string, string> = {
  core: "核心",
  major: "重要",
  minor: "次要",
};

const PROP_TYPE_LABELS: Record<string, string> = {
  weapon: "兵器",
  accessory: "饰品",
  artifact: "法器/神器",
  document: "文书",
  furniture: "家具",
  object: "其他",
};

export default function SettingsPropsTab({ novelId, onChanged }: SettingsPropsTabProps) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<StorySettingsProp | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<PropFormState>(EMPTY_PROP_FORM);
  const [states, setStates] = useState<StoryAssetState[]>([]);
  const [hint, setHint] = useState("");

  const propsQuery = useQuery({
    queryKey: queryKeys.novels.storySettingsProps(novelId),
    queryFn: () => getStorySettingsProps(novelId),
  });
  const charactersQuery = useQuery({
    queryKey: queryKeys.novels.storySettingsCharacters(novelId),
    queryFn: () => getStorySettingsCharacters(novelId),
  });
  const props = propsQuery.data?.data ?? [];
  const characters = charactersQuery.data?.data ?? [];

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.novels.storySettingsProps(novelId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.novels.storySettingsOverview(novelId) }),
    ]);
    await onChanged?.();
  };

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = {
        name: form.name.trim(),
        propType: form.propType || "object",
        description: form.description.trim() || null,
        plotFunction: form.plotFunction.trim() || null,
        visualPrompt: form.visualPrompt.trim() || null,
        ownerCharacterId: form.ownerCharacterId || null,
        importance: form.importance,
        firstAppearHint: form.firstAppearHint.trim() || null,
      };
      return editing
        ? updateStorySettingsProp(novelId, editing.id, { ...payload, states })
        : createStorySettingsProp(novelId, {
          ...payload,
          description: payload.description ?? undefined,
          plotFunction: payload.plotFunction ?? undefined,
          visualPrompt: payload.visualPrompt ?? undefined,
          ownerCharacterId: payload.ownerCharacterId ?? undefined,
          firstAppearHint: payload.firstAppearHint ?? undefined,
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
      await invalidate();
    },
    onError: (error) => {
      toast.error("道具删除失败。", { description: error instanceof Error ? error.message : undefined });
    },
  });

  const regenerateMutation = useMutation({
    mutationFn: () => regenerateStorySettings(novelId, "props"),
    onSuccess: async () => {
      toast.success("道具已重新生成。");
      await invalidate();
    },
    onError: (error) => {
      toast.error("道具生成失败。", { description: error instanceof Error ? error.message : undefined });
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
        propType: draft.propType || "object",
        description: draft.description ?? "",
        plotFunction: draft.plotFunction ?? "",
        visualPrompt: draft.visualPrompt ?? "",
        ownerCharacterId: "",
        importance: draft.importance || "major",
        firstAppearHint: draft.firstAppearHint ?? "",
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
      propType: prop.propType || "object",
      description: prop.description ?? "",
      plotFunction: prop.plotFunction ?? "",
      visualPrompt: prop.visualPrompt ?? "",
      ownerCharacterId: prop.ownerCharacterId ?? "",
      importance: prop.importance,
      firstAppearHint: prop.firstAppearHint ?? "",
    });
    setStates(prop.states ?? []);
  };

  const closeDialog = () => {
    setEditing(null);
    setCreating(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          推动剧情或埋伏笔的关键物品。正文会按这里的功能和登场安排使用它们。
        </p>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4" />
            添加道具
          </Button>
          <AiButton
            variant="outline"
            size="sm"
            onClick={() => regenerateMutation.mutate()}
            disabled={regenerateMutation.isPending}
          >
            {regenerateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {regenerateMutation.isPending ? "生成中..." : "AI 生成道具"}
          </AiButton>
        </div>
      </div>
      {propsQuery.isLoading ? (
        <div className="text-sm text-muted-foreground">正在加载道具...</div>
      ) : props.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            还没有关键道具。点「AI 生成道具」让 AI 根据剧情需要设计，或手动添加。
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {props.map((prop) => (
            <Card key={prop.id} className="min-w-0">
              <CardContent className="space-y-2 py-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <Package className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="truncate font-medium text-foreground">{prop.name}</span>
                    <Badge variant="secondary" className="shrink-0">
                      {PROP_TYPE_LABELS[prop.propType] ?? prop.propType}
                    </Badge>
                    <Badge
                      variant="outline"
                      className={cn(
                        "shrink-0",
                        prop.importance === "core" && "border-primary text-primary",
                      )}
                    >
                      {IMPORTANCE_LABELS[prop.importance] ?? prop.importance}
                    </Badge>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(prop)} aria-label="编辑道具">
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive"
                      onClick={() => deleteMutation.mutate(prop.id)}
                      disabled={deleteMutation.isPending}
                      aria-label="删除道具"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                {prop.description ? <p className="text-xs leading-5 text-muted-foreground">{prop.description}</p> : null}
                {prop.plotFunction ? (
                  <p className="text-xs leading-5 text-muted-foreground">剧情功能：{prop.plotFunction}</p>
                ) : null}
                {prop.visualPrompt ? (
                  <p className="text-xs leading-5 text-muted-foreground">视觉：{prop.visualPrompt}</p>
                ) : null}
                {prop.ownerCharacterName ? (
                  <p className="text-xs leading-5 text-muted-foreground">持有者：{prop.ownerCharacterName}</p>
                ) : null}
                {prop.states.length > 0 ? (
                  <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                    {prop.states.map((state) => (
                      <span
                        key={state.id}
                        className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] text-amber-600 dark:text-amber-400"
                        title={[state.description, state.imagePrompt ? `画面：${state.imagePrompt}` : ""].filter(Boolean).join("\n")}
                      >
                        {state.label}{state.chapterOrder ? `·第${state.chapterOrder}章` : ""}
                      </span>
                    ))}
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={creating || editing !== null} onOpenChange={(open) => !open && closeDialog()}>
        <AppDialogContent
          title={editing ? "编辑道具" : "添加道具"}
          description={editing
            ? "写清道具的来历和它在剧情里的作用，避免正文里凭空冒出万能道具。"
            : "写一句提示（也可以留空），让 AI 生成完整道具草稿；生成后可以随意修改再保存。"}
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
              characters={characters.map((character) => ({ id: character.id, name: character.name }))}
            />
            {editing ? (
              <AssetStatesEditor states={states} onChange={setStates} kind="prop" />
            ) : null}
          </div>
        </AppDialogContent>
      </Dialog>
    </div>
  );
}
