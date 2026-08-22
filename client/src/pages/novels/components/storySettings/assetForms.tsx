import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { AudioLines, ImagePlus, Loader2, Mic2, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import {
  generateStoryAssetStateImage,
  generateStoryCharacterStateVoice,
} from "@/api/story/storySettings";
import AiButton from "@/components/common/AiButton";
import { LightboxImage } from "@/components/common/LightboxImage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import SelectControl from "@/components/common/SelectControl";
import {
  createStoryCharacterInitialState,
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
  /** 别名/昵称输入（顿号/逗号分隔，如「哥哥，晨哥」）；提交时归一为数组。 */
  aliases: string;
}

export const EMPTY_CHARACTER_FORM: CharacterAssetFormState = {
  name: "",
  gender: "unknown",
  aliases: "",
};

/** 表单别名的输入输出互转：输入按顿号/逗号/空格分隔，输出用顿号展示。 */
export function parseCharacterAliasInput(text: string): string[] {
  const seen = new Set<string>();
  for (const part of text.split(/[、，,;；\s]+/u)) {
    const trimmed = part.trim();
    if (trimmed) {
      seen.add(trimmed);
    }
  }
  return [...seen];
}

export function formatCharacterAliasList(aliases: string[] | null | undefined): string {
  return (aliases ?? []).filter(Boolean).join("、");
}

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
      <label className="block space-y-1">
        <span className="text-sm font-medium">别名</span>
        <Input
          value={value.aliases}
          placeholder="如：哥哥、晨哥（原文里对TA的其他称呼，多个用顿号分隔）"
          onChange={(event) => onChange({ aliases: event.target.value })}
        />
      </label>
    </div>
  );
}

export function createInitialCharacterState(
  input: Partial<StoryAssetState> & {
    name?: string | null;
    gender?: string | null;
  } = {},
): StoryAssetState {
  const defaultState = createStoryCharacterInitialState({
    name: input.name,
    gender: input.gender,
    ageGroup: input.ageGroup,
    appearance: input.description,
    facePrompt: input.imagePrompt,
    voiceTexture: input.voicePrompt,
  });
  return {
    ...defaultState,
    ...(input.description?.trim() ? { description: input.description.trim() } : {}),
    ...(input.imagePrompt?.trim() ? { imagePrompt: input.imagePrompt.trim() } : {}),
    ...(input.voicePrompt?.trim() ? { voicePrompt: input.voicePrompt.trim() } : {}),
    ...(input.image ? { image: input.image } : {}),
    ...(input.voice ? { voice: input.voice } : {}),
  };
}

export function newStateId(): string {
  return `state-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function buildStateImageSrc(url: string, generatedAt?: string): string {
  if (!generatedAt) return url;
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}v=${encodeURIComponent(generatedAt)}`;
}

function getAssetStateLabel(state: StoryAssetState, stateIndex: number): string {
  const label = state.label?.trim();
  if (stateIndex === 0 && (label === "初始形象" || label === "初始状态")) {
    return "初始";
  }
  return label || "未命名状态";
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
  // 角色弹窗的总保存仍由外层负责；本地改过状态后先禁止直接生成，避免服务端按旧 statesJson 生图/生音色。
  const [localDirty, setLocalDirty] = useState(false);
  const showVoice = kind === "character";
  const showScene = kind === "scene";
  const stateTitle = showVoice ? "角色状态" : showScene ? "场景状态" : "道具状态";

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
    setDraft({
      id,
      label: "",
      description: "",
      imagePrompt: "",
      ...(showVoice ? { ageGroup: previous?.ageGroup ?? "youth" } : {}),
      ...(showScene ? {
        sceneType: previous?.sceneType ?? null,
        timeOfDay: previous?.timeOfDay ?? null,
        weather: previous?.weather ?? null,
      } : {}),
      referenceStateId: previous?.id ?? null,
    });
  };
  const startEdit = (index: number) => {
    const state = states[index];
    if (!state) return;
    setEditingIndex(index);
    setSelectedStateId(state.id);
    setVoiceModeOverride(null);
    setDraft({
      ...state,
      ...(index === 0 ? { label: getAssetStateLabel(state, index) } : {}),
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
      ...(showScene ? {
        sceneType: draft.sceneType ?? null,
        timeOfDay: draft.timeOfDay ?? null,
        weather: draft.weather ?? null,
      } : {}),
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
  const selectedStateLabel = selectedState && selectedStateIndex === 0
    ? getAssetStateLabel(selectedState, selectedStateIndex)
    : selectedState?.label ?? "";
  const voiceStates = selectedState && selectedStateIndex < 0 ? [...states, selectedState] : states;
  const voiceMode: StoryAssetStateVoiceMode = voiceModeOverride
    ?? selectedState?.voice?.mode
    ?? (selectedState ? getStateVoiceMode(voiceStates, selectedState.id) : "generate_new");
  const generationDisabled = !asset || localDirty || draft !== null || imageMutation.isPending || voiceMutation.isPending;

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
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <span className="text-sm font-medium">{stateTitle}</span>
        </div>
        <Button type="button" variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={startCreate} disabled={draft !== null || imageMutation.isPending || voiceMutation.isPending}>
          <Plus className="mr-1 h-3.5 w-3.5" aria-hidden="true" />添加状态
        </Button>
      </div>
      <div className="flex flex-col items-stretch gap-4 lg:flex-row lg:items-start">
        <div className="self-start h-max min-w-0 max-h-[28rem] overflow-y-auto space-y-1.5 rounded-lg border border-border/60 bg-muted/20 p-2 lg:w-72 lg:shrink-0">
          {states.length === 0 && !draft ? (
            <div className="flex min-h-28 items-center justify-center rounded-md border border-dashed border-border px-3 text-center text-xs text-muted-foreground">
              还没有状态
            </div>
          ) : null}
          {states.map((state) => {
            const isSelected = state.id === selectedStateId && !draft;
            const stateIndex = states.findIndex((item) => item.id === state.id);
            const stateLabel = getAssetStateLabel(state, stateIndex);
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
                    <img src={buildStateImageSrc(state.image.url, state.image.generatedAt)} alt={`${stateLabel} 状态图`} className="h-10 w-14 shrink-0 rounded-md border border-border object-cover" />
                  ) : (
                    <div className="h-10 w-14 shrink-0 rounded-md border border-dashed border-border bg-muted/20" aria-label={`${stateLabel}尚未生成图片`} />
                  )}
                  <span className="min-w-0 truncate text-sm font-medium text-foreground">{stateLabel}</span>
                </button>
                <div className="flex shrink-0 flex-col gap-0.5 pt-1">
                  <Button type="button" variant="ghost" size="icon" className="h-6 w-6" aria-label={`编辑${stateLabel}`} disabled={draft !== null} onClick={() => startEdit(stateIndex)}>
                    <Pencil className="h-3 w-3" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive" aria-label={stateIndex === 0 ? "初始状态不能删除" : `删除${state.label || "状态"}`} disabled={draft !== null || stateIndex === 0} onClick={() => remove(stateIndex)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="min-w-0 flex-1 rounded-lg border border-border/60 bg-background p-3">
          {selectedState ? (
            <div className="space-y-3">
              <div className="space-y-4">
                <section className="space-y-2" aria-label="状态图片">
                  <div className="overflow-hidden rounded-lg border border-border/60 bg-muted/10">
                    {selectedState.image?.url ? (
                      <LightboxImage
                        src={buildStateImageSrc(selectedState.image.url, selectedState.image.generatedAt)}
                        alt={`${selectedStateLabel} 状态图`}
                        fit="contain"
                        blurBackdrop={false}
                        className="aspect-[3/2] max-h-[28rem] w-full rounded-lg border-0"
                      />
                    ) : (
                      <div
                        className="aspect-[3/2] max-h-[28rem] w-full rounded-lg bg-muted/10"
                        role="img"
                        aria-label={`${selectedStateLabel || "状态"}尚未生成图片`}
                      />
                    )}
                  </div>
                  <div className="flex justify-end gap-2">
                    {!draft ? (
                      <Button type="button" variant="outline" size="sm" className="h-8" onClick={() => startEdit(selectedStateIndex)} disabled={selectedStateIndex < 0 || imageMutation.isPending || voiceMutation.isPending}>
                        <Pencil className="mr-1.5 h-3.5 w-3.5" />编辑状态
                      </Button>
                    ) : null}
                    <AiButton
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={generationDisabled}
                      title={localDirty ? "保存状态设定后再生成状态图" : undefined}
                      onClick={() => imageMutation.mutate(selectedState.id)}
                    >
                      {imageMutation.isPending && imageMutation.variables === selectedState.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : selectedState.image?.url ? <RefreshCw className="h-3.5 w-3.5" /> : <ImagePlus className="h-3.5 w-3.5" />}
                      {imageMutation.isPending && imageMutation.variables === selectedState.id ? "生成中..." : selectedState.image?.url ? "重新生成图片" : "生成图片"}
                    </AiButton>
                  </div>
                  {selectedState.image?.error ? <p className="text-xs text-destructive">{selectedState.image.error}</p> : null}
                </section>

                <section className="space-y-3 rounded-lg border border-border/60 bg-muted/20 p-3" aria-label="图片设定">
                  <h5 className="text-xs font-semibold text-foreground">图片设定</h5>
                  <div className="grid gap-3 md:grid-cols-2">
                  <label className="block space-y-1">
                    <span className="text-xs font-medium">状态名</span>
                    <Input value={selectedStateLabel} placeholder="例如：警察制服 / 重伤 / 黑夜" disabled={!draft} onChange={(event) => updateDraft({ label: event.target.value })} />
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
                      {referenceOptions.map((state) => <option key={state.id} value={state.id}>参考「{getAssetStateLabel(state, states.findIndex((item) => item.id === state.id))}」</option>)}
                    </SelectControl>
                  </label>
                  <label className="block space-y-1">
                    <span className="text-xs font-medium">状态变化</span>
                    <Input value={selectedState.description} placeholder={showVoice ? "例如：战斗后左臂受伤，换成破损外套" : "这个状态下发生了什么变化"} disabled={!draft} onChange={(event) => updateDraft({ description: event.target.value })} />
                  </label>
                  {showScene ? (
                    <div className="grid grid-cols-3 gap-2">
                      <label className="block min-w-0 space-y-1">
                        <span className="text-xs font-medium">场景类型</span>
                        <SelectControl
                          className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                          aria-label="状态场景类型"
                          value={selectedState.sceneType ?? ""}
                          disabled={!draft}
                          onChange={(event) => updateDraft({ sceneType: event.target.value ? event.target.value as StoryAssetState["sceneType"] : null })}
                        >
                          <option value="">未设定</option>
                          <option value="interior">室内</option>
                          <option value="exterior">室外</option>
                          <option value="nature">自然</option>
                        </SelectControl>
                      </label>
                      <label className="block min-w-0 space-y-1">
                        <span className="text-xs font-medium">时间</span>
                        <SelectControl
                          className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                          aria-label="状态时间"
                          value={selectedState.timeOfDay ?? ""}
                          disabled={!draft}
                          onChange={(event) => updateDraft({ timeOfDay: event.target.value ? event.target.value as StoryAssetState["timeOfDay"] : null })}
                        >
                          <option value="">未设定</option>
                          <option value="morning">早上</option>
                          <option value="noon">中午</option>
                          <option value="night">晚上</option>
                        </SelectControl>
                      </label>
                      <label className="block min-w-0 space-y-1">
                        <span className="text-xs font-medium">天气</span>
                        <SelectControl
                          className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                          aria-label="状态天气"
                          value={selectedState.weather ?? ""}
                          disabled={!draft}
                          onChange={(event) => updateDraft({ weather: event.target.value ? event.target.value as StoryAssetState["weather"] : null })}
                        >
                          <option value="">未设定</option>
                          <option value="sunny">晴天</option>
                          <option value="cloudy">阴天</option>
                          <option value="rainy">雨天</option>
                        </SelectControl>
                      </label>
                    </div>
                  ) : null}
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
                  <label className="block space-y-1 md:col-span-2">
                    <span className="text-xs font-medium">图片提示词</span>
                    <Input value={selectedState.imagePrompt} placeholder="留空则按状态变化生成" disabled={!draft} onChange={(event) => updateDraft({ imagePrompt: event.target.value })} />
                  </label>
                  </div>
                </section>
                {showVoice ? (
                  <section className="space-y-3 rounded-lg border border-border/60 bg-muted/20 p-3" aria-label="状态音色">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                      <AudioLines className="h-3.5 w-3.5" />音色
                    </div>
                    <label className="block space-y-1">
                      <span className="text-xs font-medium">音色提示词</span>
                      <Input
                        value={selectedState.voicePrompt ?? ""}
                        placeholder={selectedStateIndex === 0 ? "例如：低沉清晰的青年男声" : "留空则沿用上一状态音色"}
                        disabled={!draft}
                        onChange={(event) => updateDraft({ voicePrompt: event.target.value })}
                      />
                    </label>
                    <label className="block space-y-1">
                      <span className="text-xs font-medium">处理方式</span>
                      <SelectControl
                        className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                        aria-label="状态音色处理方式"
                        value={voiceMode}
                        disabled={localDirty || imageMutation.isPending || voiceMutation.isPending}
                        onChange={(event) => changeVoiceMode(event.target.value as StoryAssetStateVoiceMode)}
                      >
                        <option value="reuse_previous">沿用上一状态音色</option>
                        <option value="generate_new">生成新的音色</option>
                      </SelectControl>
                    </label>
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
                  </section>
                ) : null}
                </div>

              {draft ? (
                <div className="flex justify-end gap-2 border-t border-border/60 pt-3">
                  <Button type="button" variant="outline" size="sm" onClick={cancelDraft}>取消状态</Button>
                  <Button type="button" size="sm" onClick={commit} disabled={!draftValid}>确定</Button>
                </div>
              ) : null}
              {localDirty ? <p className="text-xs text-muted-foreground">状态设定已修改，请先保存资产，再生成图片或音色。</p> : null}
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
}

export function createInitialSceneState(input: {
  name: string;
  sceneType?: string | null;
  timeOfDay?: string | null;
  weather?: string | null;
  summary?: string | null;
  environmentPrompt?: string | null;
}): StoryAssetState {
  const description = input.summary?.trim() || input.environmentPrompt?.trim() || `${input.name.trim()}初始状态`;
  const imagePrompt = input.environmentPrompt?.trim() || description;
  return {
    id: "initial",
    label: "初始状态",
    description,
    imagePrompt,
    sceneType: input.sceneType === "interior" || input.sceneType === "exterior" || input.sceneType === "nature"
      ? input.sceneType
      : null,
    timeOfDay: input.timeOfDay === "morning" || input.timeOfDay === "noon" || input.timeOfDay === "night"
      ? input.timeOfDay
      : null,
    weather: input.weather === "sunny" || input.weather === "cloudy" || input.weather === "rainy"
      ? input.weather
      : null,
    referenceStateId: null,
  };
}

export const EMPTY_SCENE_FORM: SceneAssetFormState = {
  name: "",
};

export function SceneAssetFormFields(props: {
  value: SceneAssetFormState;
  onChange: (patch: Partial<SceneAssetFormState>) => void;
}) {
  const { value, onChange } = props;
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium">场景名</span>
      <Input
        value={value.name}
        placeholder="例如：废弃地铁站"
        onChange={(event) => onChange({ name: event.target.value })}
      />
    </label>
  );
}

// 道具表单只保留名称；画面提示词属于具体状态，数据库旧字段继续用于兼容读取。
export interface PropAssetFormState {
  name: string;
}

export function createInitialPropState(input: {
  name: string;
  description?: string | null;
  visualPrompt?: string | null;
}): StoryAssetState {
  const description = input.description?.trim() || input.visualPrompt?.trim() || `${input.name.trim()}初始状态`;
  return {
    id: "initial",
    label: "初始状态",
    description,
    imagePrompt: input.visualPrompt?.trim() || description,
    referenceStateId: null,
  };
}

export const EMPTY_PROP_FORM: PropAssetFormState = {
  name: "",
};

export function PropAssetFormFields(props: {
  value: PropAssetFormState;
  onChange: (patch: Partial<PropAssetFormState>) => void;
}) {
  const { value, onChange } = props;
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium">道具名</span>
      <Input
        value={value.name}
        placeholder="例如：外婆留下的怀表"
        onChange={(event) => onChange({ name: event.target.value })}
      />
    </label>
  );
}
