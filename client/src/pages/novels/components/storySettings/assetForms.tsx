import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { AudioLines, ImagePlus, Loader2, Mic2, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import {
  generateStoryAssetStateImage,
  generateStoryCharacterStateVoice,
} from "@/api/story/storySettings";
import AiButton from "@/components/common/AiButton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import SelectControl from "@/components/common/SelectControl";
import {
  getDefaultStoryAssetStateVoiceMode,
  resolveStoryAssetStateAncestors,
  resolveStoryAssetStateReferenceId,
  type StoryAssetState,
  type StoryAssetStateVoiceMode,
} from "@ai-novel/shared/types/novelReferenceExtraction";

// 设定资产的共用表单：设定中心三个资产页签的编辑弹窗与漫剧「提取」的应用弹窗
// 复用同一套字段组件——两边字段、文案、占位完全一致，提取出来的资产和手动建的
// 资产是同一种东西，编辑体验也必须一致。
// 角色基础表单只保留身份字段；年龄、外貌和音色都属于角色状态，避免同一份设定
// 在角色表单和状态编辑器里重复填写。

export interface CharacterAssetFormState {
  name: string;
  gender: string;
}

export const EMPTY_CHARACTER_FORM: CharacterAssetFormState = {
  name: "",
  gender: "unknown",
};

export function CharacterAssetFormFields(props: {
  value: CharacterAssetFormState;
  onChange: (patch: Partial<CharacterAssetFormState>) => void;
}) {
  const { value, onChange } = props;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <label className="block space-y-1">
          <span className="text-sm font-medium">姓名</span>
          <Input value={value.name} onChange={(event) => onChange({ name: event.target.value })} />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium">性别</span>
          <SelectControl
            className="h-9 rounded-md border bg-background px-2 text-sm"
            value={value.gender}
            onChange={(event) => onChange({ gender: event.target.value })}
          >
            <option value="unknown">未设定</option>
            <option value="male">男</option>
            <option value="female">女</option>
            <option value="other">其他</option>
          </SelectControl>
        </label>
      </div>
    </div>
  );
}

export function createInitialCharacterState(
  input: Partial<StoryAssetState> = {},
): StoryAssetState {
  return {
    id: "initial",
    label: "初始状态",
    description: input.description ?? "",
    imagePrompt: input.imagePrompt ?? "",
    ageGroup: input.ageGroup ?? "youth",
    referenceStateId: null,
    ...(input.voicePrompt ? { voicePrompt: input.voicePrompt } : {}),
    ...(input.image ? { image: input.image } : {}),
    ...(input.voice ? { voice: input.voice } : {}),
  };
}

export function newStateId(): string {
  return `state-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function getStateVoiceMode(states: StoryAssetState[], stateId: string): StoryAssetStateVoiceMode {
  const defaultMode = getDefaultStoryAssetStateVoiceMode(states, stateId);
  if (defaultMode === "generate_new") {
    return defaultMode;
  }
  const previous = resolveStoryAssetStateAncestors(states, stateId)
    .find((state) => state.voice?.status === "done" && Boolean(state.voice.sampleAudioUrl?.trim()));
  return previous
    ? "reuse_previous"
    : "generate_new";
}

// 外观状态编辑器（角色/场景/道具编辑弹窗共用）：同一资产随剧情变化的外观形态
// （换装/受伤/昼夜/损坏…）。每个状态可配置生图参考方式——参考同一资产的另一个
// 状态的图（典型：新状态参考上一状态，保持长相一致只换装/加伤），或不参考直接
// 生成全新形象；「生成图」按这个配置取参考图直接产出该状态的图（2026-08-20 用户
// 要求的灵活配置，图片生成即时落库并回填缩略图）。
export function AssetStatesEditor(props: {
  states: StoryAssetState[];
  onChange: (states: StoryAssetState[]) => void;
  kind: "character" | "scene" | "prop";
  /** 编辑已有资产时传入；「生成图」需要它调用生成接口（新建未保存的资产还没有 id） */
  asset?: { novelId: string; assetId: string };
}) {
  const { states, onChange, kind, asset } = props;
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [draft, setDraft] = useState<StoryAssetState | null>(null);
  const [selectedStateId, setSelectedStateId] = useState<string | null>(states[0]?.id ?? null);
  const [voiceModeOverride, setVoiceModeOverride] = useState<StoryAssetStateVoiceMode | null>(null);
  const [showAdvancedPrompts, setShowAdvancedPrompts] = useState(false);
  // 角色弹窗的总保存仍由外层负责；本地改过状态后先禁止直接生成，避免服务端按旧 statesJson 生图/生音色。
  const [localDirty, setLocalDirty] = useState(false);
  const showVoice = kind === "character";

  useEffect(() => {
    if (draft) return;
    if (selectedStateId && states.some((state) => state.id === selectedStateId)) return;
    setSelectedStateId(states[0]?.id ?? null);
  }, [draft, selectedStateId, states]);

  const imageMutation = useMutation({
    mutationFn: (stateId: string) => {
      if (!asset) {
        throw new Error("先保存资产，再生成状态图。");
      }
      return generateStoryAssetStateImage(asset.novelId, kind, asset.assetId, stateId);
    },
    onSuccess: async (response) => {
      // 服务端把生成结果写进了 statesJson：用返回的 states 覆盖本地编辑态，
      // 这样弹窗后续「保存」带回的就是含 image 字段的最新数据
      const updated = response.data?.states ?? [];
      onChange(updated);
      setLocalDirty(false);
      setVoiceModeOverride(null);
      toast.success("状态图已生成。");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "状态图生成失败，请重试。"),
  });

  const voiceMutation = useMutation({
    mutationFn: ({ stateId, mode }: { stateId: string; mode: StoryAssetStateVoiceMode }) => {
      if (!asset || kind !== "character") {
        throw new Error("先保存角色，再生成状态音色。");
      }
      return generateStoryCharacterStateVoice(asset.novelId, asset.assetId, stateId, mode);
    },
    onSuccess: (response) => {
      const updated = response.data?.states ?? [];
      onChange(updated);
      setLocalDirty(false);
      setVoiceModeOverride(null);
      toast.success("状态音色已生成。");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "状态音色生成失败，请重试。"),
  });

  const startCreate = () => {
    const previous = states[states.length - 1];
    setEditingIndex(null);
    const id = newStateId();
    setSelectedStateId(id);
    setVoiceModeOverride(null);
    setShowAdvancedPrompts(false);
    setDraft({
      id,
      label: "",
      description: "",
      imagePrompt: "",
      ...(showVoice ? { ageGroup: previous?.ageGroup ?? "youth" } : {}),
      referenceStateId: previous?.id ?? null,
    });
  };
  const startEdit = (index: number) => {
    const state = states[index];
    if (!state) return;
    setEditingIndex(index);
    setSelectedStateId(state.id);
    setVoiceModeOverride(null);
    setShowAdvancedPrompts(false);
    setDraft({
      ...state,
      referenceStateId: resolveStoryAssetStateReferenceId(states, state),
    });
  };
  const cancelDraft = () => {
    setDraft(null);
    setEditingIndex(null);
    setVoiceModeOverride(null);
    setSelectedStateId((current) => states.some((state) => state.id === current) ? current : states[0]?.id ?? null);
  };
  const draftValid = Boolean(
    draft?.label.trim()
      && draft?.description.trim()
      && (showVoice || draft?.imagePrompt.trim()),
  );
  const commit = () => {
    if (!draft || !draftValid) {
      return;
    }
    const cleaned: StoryAssetState = {
      id: draft.id,
      label: draft.label.trim(),
      description: draft.description.trim(),
      imagePrompt: draft.imagePrompt.trim() || draft.description.trim(),
      ...(showVoice && draft.voicePrompt?.trim() ? { voicePrompt: draft.voicePrompt.trim() } : {}),
      ...(showVoice && draft.ageGroup ? { ageGroup: draft.ageGroup } : {}),
      referenceStateId: draft.referenceStateId ?? null,
      ...(draft.chapterOrder ? { chapterOrder: draft.chapterOrder } : {}),
      ...(draft.image ? { image: draft.image } : {}),
      ...(draft.voice ? { voice: draft.voice } : {}),
    };
    const nextStates = editingIndex === null
      ? [...states, cleaned]
      : states.map((state, index) => (index === editingIndex ? cleaned : state));
    onChange(nextStates);
    setLocalDirty(true);
    cancelDraft();
    setSelectedStateId(cleaned.id);
  };
  const remove = (index: number) => {
    if (index === 0) {
      toast.error("初始状态不能删除。");
      return;
    }
    const removedId = states[index]?.id;
    const nextStates = states
      .filter((_state, position) => position !== index)
      .map((state) => (state.referenceStateId === removedId ? { ...state, referenceStateId: null } : state));
    onChange(nextStates);
    setLocalDirty(true);
    setSelectedStateId(nextStates[0]?.id ?? null);
  };

  const selectedState = draft ?? states.find((state) => state.id === selectedStateId) ?? states[0] ?? null;
  const referenceOptions = states.filter((state) => state.id !== selectedState?.id);
  const selectedStateIndex = selectedState ? states.findIndex((state) => state.id === selectedState.id) : -1;
  const voiceStates = selectedState && selectedStateIndex < 0 ? [...states, selectedState] : states;
  const voiceMode: StoryAssetStateVoiceMode = voiceModeOverride
    ?? selectedState?.voice?.mode
    ?? (selectedState ? getStateVoiceMode(voiceStates, selectedState.id) : "generate_new");
  const isUnsavedDraft = draft !== null && editingIndex === null;
  const generationDisabled = !asset || localDirty || draft !== null || imageMutation.isPending || voiceMutation.isPending;
  const referenceLabel = selectedState?.referenceStateId
    ? states.find((state) => state.id === selectedState.referenceStateId)?.label ?? "已删除状态"
    : "不参考";
  const statusLabel = selectedState?.image?.status === "done"
    ? "已生成"
    : selectedState?.image?.status === "generating"
      ? "生成中"
      : selectedState?.image?.status === "error"
        ? "生成失败"
        : "未生成";
  const voiceStatusLabel = selectedState?.voice?.status === "done"
    ? "已生成"
    : selectedState?.voice?.status === "generating"
      ? "生成中"
      : selectedState?.voice?.status === "error"
        ? "生成失败"
        : "未生成";

  const updateDraft = (patch: Partial<StoryAssetState>) => {
    setDraft((current) => current ? { ...current, ...patch } : current);
  };
  const changeVoiceMode = (mode: StoryAssetStateVoiceMode) => {
    setVoiceModeOverride(mode);
    if (draft) {
      setDraft({
        ...draft,
        voice: {
          ...(draft.voice ?? { status: "idle" as const }),
          mode,
        },
      });
    }
  };

  return (
    <div className="space-y-3 rounded-lg border border-border/70 p-3">
      <div className="flex items-center justify-between">
        <div>
          <span className="text-sm font-medium">{showVoice ? "角色状态" : "外观状态"}</span>
          <span className="ml-2 text-xs text-muted-foreground">选择状态查看图片、描述和生成状态</span>
        </div>
        <Button type="button" variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={startCreate} disabled={draft !== null || imageMutation.isPending || voiceMutation.isPending}>
          <Plus className="mr-1 h-3.5 w-3.5" aria-hidden="true" />添加状态
        </Button>
      </div>
      <div className="grid gap-3 lg:grid-cols-[minmax(0,0.78fr)_minmax(0,1.42fr)]">
        <div className="min-w-0 space-y-1.5 rounded-lg border border-border/60 bg-muted/20 p-2">
          {states.length === 0 && !draft ? (
            <div className="flex min-h-28 items-center justify-center rounded-md border border-dashed border-border px-3 text-center text-xs text-muted-foreground">
              还没有状态
            </div>
          ) : null}
          {states.map((state) => {
            const isSelected = state.id === selectedStateId && !draft;
            const stateIndex = states.findIndex((item) => item.id === state.id);
            const effectiveReferenceId = resolveStoryAssetStateReferenceId(states, state);
            return (
              <div key={state.id} className="flex items-start gap-1">
                <button
                  type="button"
                  className={cn(
                    "flex min-w-0 flex-1 items-start gap-2 rounded-md border px-2 py-2 text-left transition-colors",
                    isSelected ? "border-primary/50 bg-background shadow-sm" : "border-transparent hover:border-border hover:bg-background/70",
                  )}
                  aria-pressed={isSelected}
                  onClick={() => {
                    if (!draft) {
                      setSelectedStateId(state.id);
                      setVoiceModeOverride(null);
                    }
                  }}
                  disabled={draft !== null}
                >
                  {state.image?.url ? (
                    <img src={state.image.url} alt={`${state.label} 状态图`} className="h-10 w-14 shrink-0 rounded-md border border-border object-cover" />
                  ) : (
                    <div className="flex h-10 w-14 shrink-0 items-center justify-center rounded-md border border-dashed border-border text-muted-foreground">
                      <ImagePlus className="h-4 w-4" aria-hidden="true" />
                    </div>
                  )}
                  <span className="min-w-0 space-y-1">
                    <span className="flex flex-wrap items-center gap-1.5 text-sm font-medium text-foreground">
                      <span className="truncate">{state.label || "未命名状态"}</span>
                      {state.chapterOrder ? <span className="text-[11px] text-muted-foreground">第{state.chapterOrder}章</span> : null}
                    </span>
                    <span className="flex flex-wrap gap-1">
                      <Badge variant={state.image?.status === "done" ? "secondary" : "outline"} className="px-1.5 py-0 text-[10px]">图：{state.image?.status === "done" ? "已生成" : "待生成"}</Badge>
                      {showVoice ? <Badge variant={state.voice?.status === "done" ? "secondary" : "outline"} className="px-1.5 py-0 text-[10px]">音：{state.voice?.status === "done" ? "已生成" : "待生成"}</Badge> : null}
                      <span className="max-w-full truncate text-[10px] text-muted-foreground">参考：{effectiveReferenceId ? states.find((item) => item.id === effectiveReferenceId)?.label ?? "已删除" : "不参考"}</span>
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">{state.description || "填写状态描述"}</span>
                  </span>
                </button>
                <div className="flex shrink-0 flex-col gap-0.5 pt-1">
                  <Button type="button" variant="ghost" size="icon" className="h-6 w-6" aria-label={`编辑${state.label || "状态"}`} disabled={draft !== null} onClick={() => startEdit(stateIndex)}>
                    <Pencil className="h-3 w-3" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive" aria-label={stateIndex === 0 ? "初始状态不能删除" : `删除${state.label || "状态"}`} disabled={draft !== null || stateIndex === 0} onClick={() => remove(stateIndex)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            );
          })}
          {draft && isUnsavedDraft ? (
            <div className="rounded-md border border-dashed border-primary/50 bg-background px-2 py-2 text-xs text-primary">正在编辑新状态</div>
          ) : null}
        </div>

        <div className="min-w-0 rounded-lg border border-border/60 bg-background p-3">
          {selectedState ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="truncate text-sm font-semibold">{selectedState.label || "未命名状态"}</h4>
                    {draft ? <Badge variant="outline">编辑中</Badge> : null}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">参考：{referenceLabel}</p>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  {!draft ? (
                    <Button type="button" variant="outline" size="sm" className="h-8" onClick={() => startEdit(selectedStateIndex)} disabled={selectedStateIndex < 0 || imageMutation.isPending || voiceMutation.isPending}>
                      <Pencil className="mr-1.5 h-3.5 w-3.5" />编辑状态
                    </Button>
                  ) : null}
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-[minmax(0,1.04fr)_minmax(0,0.96fr)]">
                <div className="space-y-2">
                  <div className="overflow-hidden rounded-lg border border-border/60 bg-muted/20">
                    {selectedState.image?.url ? (
                      <img src={selectedState.image.url} alt={`${selectedState.label} 状态图`} className="aspect-video w-full object-cover" />
                    ) : (
                      <div className="flex aspect-video items-center justify-center text-xs text-muted-foreground">暂无状态图</div>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Badge variant={selectedState.image?.status === "done" ? "secondary" : selectedState.image?.status === "error" ? "destructive" : "outline"}>
                      图片：{statusLabel}
                    </Badge>
                    <AiButton
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={generationDisabled}
                      title={localDirty ? "保存角色后再生成状态图" : undefined}
                      onClick={() => imageMutation.mutate(selectedState.id)}
                    >
                      {imageMutation.isPending && imageMutation.variables === selectedState.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : selectedState.image?.url ? <RefreshCw className="h-3.5 w-3.5" /> : <ImagePlus className="h-3.5 w-3.5" />}
                      {imageMutation.isPending && imageMutation.variables === selectedState.id ? "生成中..." : selectedState.image?.url ? "重新生成图片" : "生成图片"}
                    </AiButton>
                  </div>
                  {selectedState.image?.error ? <p className="text-xs text-destructive">{selectedState.image.error}</p> : null}
                </div>

                <div className="space-y-2.5">
                  <label className="block space-y-1">
                    <span className="text-xs font-medium">状态名</span>
                    <Input value={selectedState.label} placeholder="例如：警察制服 / 重伤 / 黑夜" disabled={!draft} onChange={(event) => updateDraft({ label: event.target.value })} />
                  </label>
                  <label className="block space-y-1">
                    <span className="text-xs font-medium">生图参考</span>
                    <SelectControl
                      className="h-9 rounded-md border bg-background px-2 text-sm"
                      aria-label="生图参考"
                      value={selectedState.referenceStateId ?? ""}
                      disabled={!draft || selectedStateIndex === 0}
                      onChange={(event) => updateDraft({ referenceStateId: event.target.value || null })}
                    >
                      <option value="">不参考，直接生成新形象</option>
                      {referenceOptions.map((state) => <option key={state.id} value={state.id}>参考「{state.label}」</option>)}
                    </SelectControl>
                  </label>
                  <label className="block space-y-1">
                    <span className="text-xs font-medium">状态变化</span>
                    <Input value={selectedState.description} placeholder={showVoice ? "例如：战斗后左臂受伤，换成破损外套" : "这个状态下发生了什么变化"} disabled={!draft} onChange={(event) => updateDraft({ description: event.target.value })} />
                  </label>
                  {showVoice ? (
                    <label className="block space-y-1">
                      <span className="text-xs font-medium">年龄段</span>
                      <SelectControl
                        className="h-9 rounded-md border bg-background px-2 text-sm"
                        aria-label="状态年龄段"
                        value={selectedState.ageGroup ?? "youth"}
                        disabled={!draft}
                        onChange={(event) => updateDraft({ ageGroup: event.target.value as StoryAssetState["ageGroup"] })}
                      >
                        <option value="child">少年/儿童</option>
                        <option value="youth">青年</option>
                        <option value="middle">中年</option>
                        <option value="elder">老年</option>
                      </SelectControl>
                    </label>
                  ) : null}
                  {showVoice ? (
                    <label className="block space-y-1">
                      <span className="text-xs font-medium">音色变化</span>
                      <Input
                        value={selectedState.voicePrompt ?? ""}
                        placeholder={selectedStateIndex === 0 ? "例如：低沉清晰的青年男声" : "留空则沿用上一状态音色"}
                        disabled={!draft}
                        onChange={(event) => updateDraft({ voicePrompt: event.target.value })}
                      />
                    </label>
                  ) : null}
                  {showVoice ? (
                    <div className="flex justify-end">
                      <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setShowAdvancedPrompts((current) => !current)}>
                        {showAdvancedPrompts ? "收起高级提示词" : "高级提示词"}
                      </Button>
                    </div>
                  ) : null}
                  {(!showVoice || showAdvancedPrompts) ? (
                    <label className="block space-y-1">
                      <span className="text-xs font-medium">图片提示词</span>
                      <Input value={selectedState.imagePrompt} placeholder="留空则按状态变化生成" disabled={!draft} onChange={(event) => updateDraft({ imagePrompt: event.target.value })} />
                    </label>
                  ) : null}
                  {showVoice ? (
                    <>
                  <div className="space-y-2 rounded-md border border-border/60 bg-muted/20 p-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="flex items-center gap-1.5 text-xs font-medium"><AudioLines className="h-3.5 w-3.5" />状态音色</span>
                          <Badge variant={selectedState.voice?.status === "done" ? "secondary" : selectedState.voice?.status === "error" ? "destructive" : "outline"}>{voiceStatusLabel}</Badge>
                        </div>
                        <SelectControl
                          className="h-9 rounded-md border bg-background px-2 text-sm"
                          aria-label="状态音色处理方式"
                          value={voiceMode}
                          disabled={localDirty || imageMutation.isPending || voiceMutation.isPending}
                          onChange={(event) => changeVoiceMode(event.target.value as StoryAssetStateVoiceMode)}
                        >
                          <option value="reuse_previous">沿用上一状态音色</option>
                          <option value="generate_new">生成新的音色</option>
                        </SelectControl>
                        {selectedState.voice?.sampleAudioUrl ? <audio controls preload="none" src={selectedState.voice.sampleAudioUrl} className="h-8 w-full" /> : null}
                        <div className="flex justify-end">
                          <AiButton
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={generationDisabled}
                            title={localDirty ? "保存角色后再生成状态音色" : undefined}
                            onClick={() => voiceMutation.mutate({ stateId: selectedState.id, mode: voiceMode })}
                          >
                            {voiceMutation.isPending && voiceMutation.variables?.stateId === selectedState.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mic2 className="h-3.5 w-3.5" />}
                            {voiceMutation.isPending && voiceMutation.variables?.stateId === selectedState.id ? "处理中..." : voiceMode === "reuse_previous" ? "沿用上一状态音色" : "生成新音色"}
                          </AiButton>
                        </div>
                        {selectedState.voice?.error ? <p className="text-xs text-destructive">{selectedState.voice.error}</p> : null}
                      </div>
                    </>
                  ) : null}
                </div>
              </div>

              {draft ? (
                <div className="flex justify-end gap-2 border-t border-border/60 pt-3">
                  <Button type="button" variant="outline" size="sm" onClick={cancelDraft}>取消</Button>
                  <Button type="button" size="sm" onClick={commit} disabled={!draftValid}>确定</Button>
                </div>
              ) : null}
              {localDirty ? <p className="text-xs text-muted-foreground">状态设定已修改，请先保存角色，再生成图片或音色。</p> : null}
            </div>
          ) : (
            <div className="flex min-h-64 items-center justify-center text-center text-sm text-muted-foreground">添加一个状态后，在这里查看和编辑状态资产。</div>
          )}
        </div>
      </div>
    </div>
  );
}

export interface SceneAssetFormState {
  name: string;
  sceneType: string;
  timeOfDay: string;
  weather: string;
  environmentPrompt: string;
}

export const EMPTY_SCENE_FORM: SceneAssetFormState = {
  name: "",
  sceneType: "",
  timeOfDay: "",
  weather: "",
  environmentPrompt: "",
};

export function SceneAssetFormFields(props: {
  value: SceneAssetFormState;
  onChange: (patch: Partial<SceneAssetFormState>) => void;
}) {
  const { value, onChange } = props;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <label className="block space-y-1">
          <span className="text-sm font-medium">场景名</span>
          <Input
            value={value.name}
            placeholder="例如：废弃地铁站"
            onChange={(event) => onChange({ name: event.target.value })}
          />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium">场景类型</span>
          <SelectControl
            className="h-9 rounded-md border bg-background px-2 text-sm"
            value={value.sceneType}
            onChange={(event) => onChange({ sceneType: event.target.value })}
          >
            <option value="">未设定</option>
            <option value="interior">室内</option>
            <option value="exterior">室外</option>
            <option value="nature">自然</option>
          </SelectControl>
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium">时间</span>
          <SelectControl
            className="h-9 rounded-md border bg-background px-2 text-sm"
            value={value.timeOfDay}
            onChange={(event) => onChange({ timeOfDay: event.target.value })}
          >
            <option value="">未设定</option>
            <option value="morning">早上</option>
            <option value="noon">中午</option>
            <option value="night">晚上</option>
          </SelectControl>
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium">天气</span>
          <SelectControl
            className="h-9 rounded-md border bg-background px-2 text-sm"
            value={value.weather}
            onChange={(event) => onChange({ weather: event.target.value })}
          >
            <option value="">未设定</option>
            <option value="sunny">晴天</option>
            <option value="cloudy">阴天</option>
            <option value="rainy">雨天</option>
          </SelectControl>
        </label>
      </div>
      <label className="block space-y-1">
        <span className="text-sm font-medium">图片提示词（生成场景图时使用）</span>
        <Input
          value={value.environmentPrompt}
          placeholder="光线、空间布局、材质风格；时间与天气用上面的选项"
          onChange={(event) => onChange({ environmentPrompt: event.target.value })}
        />
      </label>
    </div>
  );
}

// 道具表单只留做视频要用的字段（2026-08-19 用户决定：道具就是道具名 + 图片提示词，
// 类型/持有者/重要度/剧情功能等对生成画面没有作用；数据库旧字段保留，编辑保存时清空）。
export interface PropAssetFormState {
  name: string;
  visualPrompt: string;
}

export const EMPTY_PROP_FORM: PropAssetFormState = {
  name: "",
  visualPrompt: "",
};

export function PropAssetFormFields(props: {
  value: PropAssetFormState;
  onChange: (patch: Partial<PropAssetFormState>) => void;
}) {
  const { value, onChange } = props;
  return (
    <div className="space-y-3">
      <label className="block space-y-1">
        <span className="text-sm font-medium">道具名</span>
        <Input
          value={value.name}
          placeholder="例如：外婆留下的怀表"
          onChange={(event) => onChange({ name: event.target.value })}
        />
      </label>
      <label className="block space-y-1">
        <span className="text-sm font-medium">图片提示词（生成道具图时使用）</span>
        <Input
          value={value.visualPrompt}
          placeholder="材质、工艺、尺寸、色泽、纹饰"
          onChange={(event) => onChange({ visualPrompt: event.target.value })}
        />
      </label>
    </div>
  );
}
