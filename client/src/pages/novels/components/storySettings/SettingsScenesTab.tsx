import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, MapPin, Pencil, Plus, Trash2 } from "lucide-react";
import type { StorySettingsScene } from "@/api/storySettings";
import {
  createStorySettingsScene,
  deleteStorySettingsScene,
  getStorySettingsScenes,
  regenerateStorySettings,
  updateStorySettingsScene,
} from "@/api/storySettings";
import { queryKeys } from "@/api/queryKeys";
import AiButton from "@/components/common/AiButton";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, AppDialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";

interface SettingsScenesTabProps {
  novelId: string;
  onChanged?: () => void | Promise<void>;
}

interface SceneFormState {
  name: string;
  summary: string;
  significance: string;
}

const EMPTY_FORM: SceneFormState = { name: "", summary: "", significance: "" };

export default function SettingsScenesTab({ novelId, onChanged }: SettingsScenesTabProps) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<StorySettingsScene | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<SceneFormState>(EMPTY_FORM);

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
        summary: form.summary.trim() || null,
        significance: form.significance.trim() || null,
      })
      : createStorySettingsScene(novelId, {
        name: form.name.trim(),
        summary: form.summary.trim() || undefined,
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

  const openCreate = () => {
    setEditing(null);
    setCreating(true);
    setForm(EMPTY_FORM);
  };

  const openEdit = (scene: StorySettingsScene) => {
    setCreating(false);
    setEditing(scene);
    setForm({
      name: scene.name,
      summary: scene.summary ?? "",
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
                {scene.summary ? <p className="text-xs leading-5 text-muted-foreground">{scene.summary}</p> : null}
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
          description="写清场景的氛围和它在故事里的作用，正文会自动使用。"
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
            <label className="block space-y-1">
              <span className="text-sm font-medium">场景名</span>
              <Input
                value={form.name}
                placeholder="例如：废弃地铁站"
                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
              />
            </label>
            <label className="block space-y-1">
              <span className="text-sm font-medium">氛围 / 环境描述</span>
              <Input
                value={form.summary}
                placeholder="这个地方长什么样、有什么感觉"
                onChange={(event) => setForm((prev) => ({ ...prev, summary: event.target.value }))}
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
