import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Pencil, Sparkles, Trash2, UserRound } from "lucide-react";
import type { StorySettingsCharacter } from "@/api/story/storySettings";
import {
  createStorySettingsCharacter,
  deleteStorySettingsCharacter,
  generateStoryEntityDraft,
  getStorySettingsCharacters,
  regenerateStorySettings,
  updateStorySettingsCharacter,
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

interface SettingsCharactersTabProps {
  novelId: string;
  onChanged?: () => void | Promise<void>;
}

interface CharacterFormState {
  name: string;
  role: string;
  gender: string;
  ageGroup: string;
  physique: string;
  attireStyle: string;
  facePrompt: string;
  personality: string;
  appearance: string;
  background: string;
}

const EMPTY_FORM: CharacterFormState = {
  name: "",
  role: "",
  gender: "unknown",
  ageGroup: "",
  physique: "",
  attireStyle: "",
  facePrompt: "",
  personality: "",
  appearance: "",
  background: "",
};

const AGE_GROUP_LABELS: Record<string, string> = {
  child: "少年/儿童",
  youth: "青年",
  middle: "中年",
  elder: "老年",
};

const GENDER_LABELS: Record<string, string> = {
  male: "男",
  female: "女",
  other: "其他",
  unknown: "未设定",
};

export default function SettingsCharactersTab({ novelId, onChanged }: SettingsCharactersTabProps) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<StorySettingsCharacter | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<CharacterFormState>(EMPTY_FORM);
  const [hint, setHint] = useState("");

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
    mutationFn: () => {
      const payload = {
        name: form.name.trim(),
        role: form.role.trim(),
        gender: form.gender || undefined,
        ageGroup: form.ageGroup || undefined,
        physique: form.physique.trim() || undefined,
        attireStyle: form.attireStyle.trim() || undefined,
        facePrompt: form.facePrompt.trim() || undefined,
        personality: form.personality.trim() || undefined,
        appearance: form.appearance.trim() || undefined,
        background: form.background.trim() || undefined,
      };
      return editing
        ? updateStorySettingsCharacter(novelId, editing.id, payload)
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
        role: draft.role,
        gender: draft.gender || "unknown",
        ageGroup: draft.ageGroup || "",
        physique: draft.physique ?? "",
        attireStyle: draft.attireStyle ?? "",
        facePrompt: draft.facePrompt ?? "",
        personality: draft.personality ?? "",
        appearance: draft.appearance ?? "",
        background: draft.background ?? "",
      });
      toast.success("草稿已生成，可以直接修改后保存。");
    },
    onError: (error) => {
      toast.error("角色生成失败。", { description: error instanceof Error ? error.message : undefined });
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
    setForm(EMPTY_FORM);
    setHint("");
  };

  const openEdit = (character: StorySettingsCharacter) => {
    setCreating(false);
    setEditing(character);
    setHint("");
    setForm({
      name: character.name,
      role: character.role,
      gender: character.gender ?? "unknown",
      ageGroup: character.ageGroup ?? "",
      physique: character.physique ?? "",
      attireStyle: character.attireStyle ?? "",
      facePrompt: character.facePrompt ?? "",
      personality: character.personality ?? "",
      appearance: character.appearance ?? "",
      background: character.background ?? "",
    });
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
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          故事里的每个人物。AI 会按这里的性格写他们的言行；改设定后，后续正文会跟着新设定走。
        </p>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={openCreate}>
            添加角色
          </Button>
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
      </div>
      {charactersQuery.isLoading ? (
        <div className="text-sm text-muted-foreground">正在加载角色...</div>
      ) : characters.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            还没有角色。点「添加角色」用一句提示（如「男大学生」）让 AI 生成完整设定，或点「AI 补充角色」自动创建主角阵容。
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {characters.map((character) => (
            <Card key={character.id} className="min-w-0">
              <CardContent className="space-y-2 py-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <UserRound className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="truncate font-medium text-foreground">{character.name}</span>
                    <Badge variant="secondary" className="shrink-0">{character.role}</Badge>
                    {character.gender && character.gender !== "unknown" ? (
                      <Badge variant="outline" className="shrink-0">{GENDER_LABELS[character.gender] ?? character.gender}</Badge>
                    ) : null}
                    {character.ageGroup ? (
                      <Badge variant="outline" className="shrink-0">{AGE_GROUP_LABELS[character.ageGroup] ?? character.ageGroup}</Badge>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => openEdit(character)} aria-label="编辑角色">
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
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
                  </div>
                </div>
                {character.personality ? (
                  <p className="text-xs leading-5 text-muted-foreground">{character.personality}</p>
                ) : null}
                {character.appearance || character.physique || character.attireStyle ? (
                  <p className="text-xs leading-5 text-muted-foreground">
                    外貌：{character.appearance || [character.physique, character.attireStyle].filter(Boolean).join("，")}
                  </p>
                ) : null}
                {character.voiceTexture ? (
                  <p className="text-xs leading-5 text-muted-foreground">音色：{character.voiceTexture}</p>
                ) : null}
                {character.states.length > 0 ? (
                  <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                    {character.states.map((state) => (
                      <span
                        key={state.id}
                        className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] text-amber-600 dark:text-amber-400"
                        title={[
                          state.description,
                          state.imagePrompt ? `画面：${state.imagePrompt}` : "",
                          state.voicePrompt ? `音色：${state.voicePrompt}` : "",
                        ].filter(Boolean).join("\n")}
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
          title={editing ? "编辑角色" : "添加角色"}
          description={editing
            ? "调整角色设定后，后续生成的人物言行会按新设定走。"
            : "写一句提示（也可以留空），让 AI 生成完整角色草稿；生成后可以随意修改再保存。"}
          footer={
            <>
              <Button variant="outline" onClick={closeDialog} disabled={saveMutation.isPending}>取消</Button>
              <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !form.name.trim() || !form.role.trim()}>
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
            <div className="grid grid-cols-2 gap-3">
              <label className="block space-y-1">
                <span className="text-sm font-medium">姓名</span>
                <Input value={form.name} onChange={(event) => updateField({ name: event.target.value })} />
              </label>
              <label className="block space-y-1">
                <span className="text-sm font-medium">身份定位</span>
                <Input
                  value={form.role}
                  placeholder="例如：主角 / 对手 / 师父"
                  onChange={(event) => updateField({ role: event.target.value })}
                />
              </label>
              <label className="block space-y-1">
                <span className="text-sm font-medium">性别</span>
                <SelectControl
                  className="h-9 rounded-md border bg-background px-2 text-sm"
                  value={form.gender}
                  onChange={(event) => updateField({ gender: event.target.value })}
                >
                  <option value="unknown">未设定</option>
                  <option value="male">男</option>
                  <option value="female">女</option>
                  <option value="other">其他</option>
                </SelectControl>
              </label>
              <label className="block space-y-1">
                <span className="text-sm font-medium">年龄段</span>
                <SelectControl
                  className="h-9 rounded-md border bg-background px-2 text-sm"
                  value={form.ageGroup}
                  onChange={(event) => updateField({ ageGroup: event.target.value })}
                >
                  <option value="">未设定</option>
                  <option value="child">少年/儿童</option>
                  <option value="youth">青年</option>
                  <option value="middle">中年</option>
                  <option value="elder">老年</option>
                </SelectControl>
              </label>
            </div>
            <label className="block space-y-1">
              <span className="text-sm font-medium">体型</span>
              <Input
                value={form.physique}
                placeholder="例如：高瘦 / 娇小 / 壮实"
                onChange={(event) => updateField({ physique: event.target.value })}
              />
            </label>
            <label className="block space-y-1">
              <span className="text-sm font-medium">性格（说话方式与行动倾向）</span>
              <Input value={form.personality} onChange={(event) => updateField({ personality: event.target.value })} />
            </label>
            <label className="block space-y-1">
              <span className="text-sm font-medium">外貌</span>
              <Input value={form.appearance} onChange={(event) => updateField({ appearance: event.target.value })} />
            </label>
            <label className="block space-y-1">
              <span className="text-sm font-medium">默认着装</span>
              <Input value={form.attireStyle} onChange={(event) => updateField({ attireStyle: event.target.value })} />
            </label>
            <label className="block space-y-1">
              <span className="text-sm font-medium">面部锚点（生成角色立绘时使用）</span>
              <Input
                value={form.facePrompt}
                placeholder="性别、年龄段、发型发色、眼睛、肤色、脸型；不要写服装"
                onChange={(event) => updateField({ facePrompt: event.target.value })}
              />
            </label>
            <label className="block space-y-1">
              <span className="text-sm font-medium">背景</span>
              <Input value={form.background} onChange={(event) => updateField({ background: event.target.value })} />
            </label>
          </div>
        </AppDialogContent>
      </Dialog>
    </div>
  );
}
