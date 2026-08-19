import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, MapPin, Pencil, Plus, Sparkles, Trash2 } from "lucide-react";
import type { StorySettingsScene } from "@/api/story/storySettings";
import {
  createStorySettingsScene,
  deleteStorySettingsScene,
  generateStoryEntityDraft,
  getStorySettingsScenes,
  regenerateStorySettings,
  updateStorySettingsScene,
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

interface SettingsScenesTabProps {
  novelId: string;
  onChanged?: () => void | Promise<void>;
}

interface SceneFormState {
  name: string;
  sceneType: string;
  summary: string;
  environmentPrompt: string;
  significance: string;
}

const EMPTY_FORM: SceneFormState = { name: "", sceneType: "", summary: "", environmentPrompt: "", significance: "" };

const SCENE_TYPE_LABELS: Record<string, string> = {
  interior: "室内",
  exterior: "室外",
  nature: "自然",
};

export default function SettingsScenesTab({ novelId, onChanged }: SettingsScenesTabProps) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<StorySettingsScene | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<SceneFormState>(EMPTY_FORM);
  const [hint, setHint] = useState("");

  const scenesQuery = useQuery({
    queryKey: queryKeys.novels.storySettingsScenes(novelId),
    queryFn: () => getStorySettingsScenes(novelId),
  });
  const scenes = scenesQuery.data?.data ?? [];

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.novels.storySettingsScenes(novelId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.novels.storySettingsOverview(novelId) }),
    ]);
    await onChanged?.();
  };

  const saveMutation = useMutation({
    mutationFn: () => editing
      ? updateStorySettingsScene(novelId, editing.id, {
        name: form.name.trim(),
        sceneType: form.sceneType || null,
        summary: form.summary.trim() || null,
        environmentPrompt: form.environmentPrompt.trim() || null,
        significance: form.significance.trim() || null,
      })
      : createStorySettingsScene(novelId, {
        name: form.name.trim(),
        sceneType: form.sceneType || undefined,
        summary: form.summary.trim() || undefined,
        environmentPrompt: form.environmentPrompt.trim() || undefined,
        significance: form.significance.trim() || undefined,
      }),
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

  const regenerateMutation = useMutation({
    mutationFn: () => regenerateStorySettings(novelId, "scenes"),
    onSuccess: async () => {
      toast.success("场景已重新生成。");
      await invalidate();
    },
    onError: (error) => {
      toast.error("场景生成失败。", { description: error instanceof Error ? error.message : undefined });
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
        sceneType: draft.sceneType || "",
        summary: draft.summary ?? "",
        environmentPrompt: draft.environmentPrompt ?? "",
        significance: draft.significance ?? "",
      });
      toast.success("草稿已生成，可以直接修改后保存。");
    },
    onError: (error) => {
      toast.error("场景生成失败。", { description: error instanceof Error ? error.message : undefined });
    },
  });

  const openCreate = () => {
    setEditing(null);
    setCreating(true);
    setForm(EMPTY_FORM);
    setHint("");
  };

  const openEdit = (scene: StorySettingsScene) => {
    setCreating(false);
    setEditing(scene);
    setHint("");
    setForm({
      name: scene.name,
      sceneType: scene.sceneType ?? "",
      summary: scene.summary ?? "",
      environmentPrompt: scene.environmentPrompt ?? "",
      significance: scene.significance ?? "",
    });
  };

  const closeDialog = () => {
    setEditing(null);
    setCreating(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          故事发生的地方。正文会优先发生在这些场景里，并带上这里写的氛围。
        </p>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4" />
            添加场景
          </Button>
          <AiButton
            variant="outline"
            size="sm"
            onClick={() => regenerateMutation.mutate()}
            disabled={regenerateMutation.isPending}
          >
            {regenerateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {regenerateMutation.isPending ? "生成中..." : "AI 生成场景"}
          </AiButton>
        </div>
      </div>
      {scenesQuery.isLoading ? (
        <div className="text-sm text-muted-foreground">正在加载场景...</div>
      ) : scenes.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            还没有场景。点「AI 生成场景」让 AI 根据故事需要创建地点，或手动添加。
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {scenes.map((scene) => (
            <Card key={scene.id} className="min-w-0">
              <CardContent className="space-y-2 py-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="truncate font-medium text-foreground">{scene.name}</span>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(scene)} aria-label="编辑场景">
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive"
                      onClick={() => deleteMutation.mutate(scene.id)}
                      disabled={deleteMutation.isPending}
                      aria-label="删除场景"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                {scene.sceneType ? (
                  <Badge variant="outline">{SCENE_TYPE_LABELS[scene.sceneType] ?? scene.sceneType}</Badge>
                ) : null}
                {scene.summary ? <p className="text-xs leading-5 text-muted-foreground">{scene.summary}</p> : null}
                {scene.environmentPrompt ? (
                  <p className="text-xs leading-5 text-muted-foreground">环境：{scene.environmentPrompt}</p>
                ) : null}
                {scene.significance ? (
                  <p className="text-xs leading-5 text-muted-foreground">故事作用：{scene.significance}</p>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={creating || editing !== null} onOpenChange={(open) => !open && closeDialog()}>
        <AppDialogContent
          title={editing ? "编辑场景" : "添加场景"}
          description={editing
            ? "写清场景的氛围和它在故事里的作用，正文会自动使用。"
            : "写一句提示（也可以留空），让 AI 生成完整场景草稿；生成后可以随意修改再保存。"}
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
            <div className="grid grid-cols-2 gap-3">
            <label className="block space-y-1">
              <span className="text-sm font-medium">场景名</span>
              <Input
                value={form.name}
                placeholder="例如：废弃地铁站"
                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
              />
            </label>
            <label className="block space-y-1">
              <span className="text-sm font-medium">场景类型</span>
              <SelectControl
                className="h-9 rounded-md border bg-background px-2 text-sm"
                value={form.sceneType}
                onChange={(event) => setForm((prev) => ({ ...prev, sceneType: event.target.value }))}
              >
                <option value="">未设定</option>
                <option value="interior">室内</option>
                <option value="exterior">室外</option>
                <option value="nature">自然</option>
              </SelectControl>
            </label>
            </div>
            <label className="block space-y-1">
              <span className="text-sm font-medium">氛围 / 环境描述</span>
              <Input
                value={form.summary}
                placeholder="这个地方长什么样、有什么感觉"
                onChange={(event) => setForm((prev) => ({ ...prev, summary: event.target.value }))}
              />
            </label>
            <label className="block space-y-1">
              <span className="text-sm font-medium">环境提示词（生成场景图时使用）</span>
              <Input
                value={form.environmentPrompt}
                placeholder="正面/左右/背面的可见布局、光源、材质风格"
                onChange={(event) => setForm((prev) => ({ ...prev, environmentPrompt: event.target.value }))}
              />
            </label>
            <label className="block space-y-1">
              <span className="text-sm font-medium">故事作用</span>
              <Input
                value={form.significance}
                placeholder="为什么故事要在这里发生"
                onChange={(event) => setForm((prev) => ({ ...prev, significance: event.target.value }))}
              />
            </label>
          </div>
        </AppDialogContent>
      </Dialog>
    </div>
  );
}
