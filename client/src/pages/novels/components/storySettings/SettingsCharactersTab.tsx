import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Pencil, UserRound } from "lucide-react";
import type { StorySettingsCharacter } from "@/api/storySettings";
import { getStorySettingsCharacters, regenerateStorySettings, updateStorySettingsCharacter } from "@/api/storySettings";
import { queryKeys } from "@/api/queryKeys";
import AiButton from "@/components/common/AiButton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, AppDialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";

interface SettingsCharactersTabProps {
  novelId: string;
  onChanged?: () => void | Promise<void>;
}

interface CharacterFormState {
  name: string;
  role: string;
  personality: string;
  appearance: string;
  background: string;
}

const EMPTY_FORM: CharacterFormState = { name: "", role: "", personality: "", appearance: "", background: "" };

export default function SettingsCharactersTab({ novelId, onChanged }: SettingsCharactersTabProps) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<StorySettingsCharacter | null>(null);
  const [form, setForm] = useState<CharacterFormState>(EMPTY_FORM);

  const charactersQuery = useQuery({
    queryKey: queryKeys.novels.storySettingsCharacters(novelId),
    queryFn: () => getStorySettingsCharacters(novelId),
  });
  const characters = charactersQuery.data?.data ?? [];

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.novels.storySettingsCharacters(novelId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.novels.storySettingsOverview(novelId) }),
    ]);
    await onChanged?.();
  };

  const saveMutation = useMutation({
    mutationFn: () => updateStorySettingsCharacter(novelId, editing!.id, {
      name: form.name.trim(),
      role: form.role.trim(),
      personality: form.personality.trim() || null,
      appearance: form.appearance.trim() || null,
      background: form.background.trim() || null,
    }),
    onSuccess: async () => {
      toast.success("角色已保存。");
      setEditing(null);
      await invalidate();
    },
    onError: (error) => {
      toast.error("角色保存失败。", { description: error instanceof Error ? error.message : undefined });
    },
  });

  const regenerateMutation = useMutation({
    mutationFn: () => regenerateStorySettings(novelId, "characters"),
    onSuccess: async () => {
      toast.success("已补充缺失的角色。");
      await invalidate();
    },
    onError: (error) => {
      toast.error("角色生成失败。", { description: error instanceof Error ? error.message : undefined });
    },
  });

  const openEdit = (character: StorySettingsCharacter) => {
    setEditing(character);
    setForm({
      name: character.name,
      role: character.role,
      personality: character.personality ?? "",
      appearance: character.appearance ?? "",
      background: character.background ?? "",
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          故事里的每个人物。AI 会按这里的性格写他们的言行；改设定后，后续正文会跟着新设定走。
        </p>
        <AiButton
          variant="outline"
          size="sm"
          onClick={() => regenerateMutation.mutate()}
          disabled={regenerateMutation.isPending}
        >
          {regenerateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {regenerateMutation.isPending ? "生成中..." : "AI 补充角色"}
        </AiButton>
      </div>
      {charactersQuery.isLoading ? (
        <div className="text-sm text-muted-foreground">正在加载角色...</div>
      ) : characters.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            还没有角色。点上面的「AI 补充角色」，AI 会根据小说想法创建主角和配角。
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {characters.map((character) => (
            <Card key={character.id} className="min-w-0">
              <CardContent className="space-y-2 py-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <UserRound className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="truncate font-medium text-foreground">{character.name}</span>
                    <Badge variant="secondary" className="shrink-0">{character.role}</Badge>
                  </div>
                  <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => openEdit(character)} aria-label="编辑角色">
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                </div>
                {character.personality ? (
                  <p className="text-xs leading-5 text-muted-foreground">{character.personality}</p>
                ) : null}
                {character.appearance ? (
                  <p className="text-xs leading-5 text-muted-foreground">外貌：{character.appearance}</p>
                ) : null}
                {character.background ? (
                  <p className="text-xs leading-5 text-muted-foreground">背景：{character.background}</p>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <AppDialogContent
          title="编辑角色"
          description="调整角色设定后，后续生成的人物言行会按新设定走。"
          footer={
            <>
              <Button variant="outline" onClick={() => setEditing(null)} disabled={saveMutation.isPending}>取消</Button>
              <Button
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending || !form.name.trim() || !form.role.trim()}
              >
                {saveMutation.isPending ? "保存中..." : "保存"}
              </Button>
            </>
          }
        >
          <div className="space-y-3">
            <label className="block space-y-1">
              <span className="text-sm font-medium">姓名</span>
              <Input value={form.name} onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))} />
            </label>
            <label className="block space-y-1">
              <span className="text-sm font-medium">身份定位</span>
              <Input
                value={form.role}
                placeholder="例如：主角 / 对手 / 师父"
                onChange={(event) => setForm((prev) => ({ ...prev, role: event.target.value }))}
              />
            </label>
            <label className="block space-y-1">
              <span className="text-sm font-medium">性格（说话方式与行动倾向）</span>
              <Input value={form.personality} onChange={(event) => setForm((prev) => ({ ...prev, personality: event.target.value }))} />
            </label>
            <label className="block space-y-1">
              <span className="text-sm font-medium">外貌</span>
              <Input value={form.appearance} onChange={(event) => setForm((prev) => ({ ...prev, appearance: event.target.value }))} />
            </label>
            <label className="block space-y-1">
              <span className="text-sm font-medium">背景</span>
              <Input value={form.background} onChange={(event) => setForm((prev) => ({ ...prev, background: event.target.value }))} />
            </label>
          </div>
        </AppDialogContent>
      </Dialog>
    </div>
  );
}
