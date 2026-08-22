import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AudioLines, ImagePlus, Loader2, Mic2, Plus, RefreshCw, Trash2 } from "lucide-react";
import {
  generateStoryAssetStateImage,
  generateStoryCharacterStateVoice,
  updateStorySettingsCharacter,
  updateStorySettingsProp,
  updateStorySettingsScene,
} from "@/api/story/storySettings";
import { queryKeys } from "@/api/queryKeys";
import AiButton from "@/components/common/AiButton";
import { LightboxImage } from "@/components/common/LightboxImage";
import { buildStateImageSrc } from "@/components/storyAssets";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import SelectControl from "@/components/common/SelectControl";
import {
  createStoryCharacterInitialState,
  type StoryAssetState,
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
            className="h-9 rounded-md border border-border bg-background px-2 text-sm"
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

export { buildStateImageSrc };

function getAssetStateLabel(state: StoryAssetState, stateIndex: number): string {
  const label = state.label?.trim();
  if (stateIndex === 0 && (label === "初始形象" || label === "初始状态")) {
    return "初始";
  }
  return label || "未命名状态";
}

// 状态编辑器（角色/场景/道具编辑弹窗共用）：左列状态列表 + 右侧当前状态直接编辑。
// 2026-08-22 用户决定的交互：
// - 所有字段行内直接可编辑，改完点「保存状态」落库；点「生成图片/生成音色」会先把
//   未保存的修改自动保存再生成，不用来回点；
// - 状态字段只有 状态名+年龄段（场景为类型/时间/天气）与图片提示词——状态名已能表达
//   成因，不再单列「状态变化」，保存时说明留空按状态名回填；
// - 图片：生成前在这里选参考图（任意其他状态的图）或留空直接生成全新形象；
// - 音色（仅角色）：音色提示词可直接写；「生成音色」合成新音色；旁边「选取音色」
//   把任意其他状态已生成的音色直接拿来用——不再有「沿用上一状态」的隐式模式；
// - 图片/音色提示词较长，用多行文本；「添加状态」在列表底部；区块不加标题。
export function AssetStatesEditor(props: {
  states: StoryAssetState[];
  onChange: (states: StoryAssetState[]) => void;
  kind: "character" | "scene" | "prop";
  /** 编辑已有资产时传入；生成与保存需要它调用接口（新建未保存的资产还没有 id） */
  asset?: { novelId: string; assetId: string };
}) {
  const { states, onChange, kind, asset } = props;
  const queryClient = useQueryClient();
  const [selectedStateId, setSelectedStateId] = useState<string | null>(states[0]?.id ?? null);
  const [voicePickerOpen, setVoicePickerOpen] = useState(false);
  const [localDirty, setLocalDirty] = useState(false);
  const showVoice = kind === "character";
  const showScene = kind === "scene";

  useEffect(() => {
    if (selectedStateId && states.some((state) => state.id === selectedStateId)) {
      return;
    }
    setSelectedStateId(states[0]?.id ?? null);
  }, [selectedStateId, states]);

  const invalidateSettings = async () => {
    if (!asset) {
      return;
    }
    const key = kind === "character"
      ? queryKeys.novels.storySettingsCharacters(asset.novelId)
      : kind === "scene"
        ? queryKeys.novels.storySettingsScenes(asset.novelId)
        : queryKeys.novels.storySettingsProps(asset.novelId);
    await queryClient.invalidateQueries({ queryKey: key });
    await queryClient.invalidateQueries({ queryKey: queryKeys.novels.storySettingsOverview(asset.novelId) });
  };

  /** 保存前归一：trim；说明与图片提示词留空按状态名兜底；每个状态都要有状态名。 */
  const normalizeStatesForSave = (source: StoryAssetState[]): StoryAssetState[] => {
    const invalid = source.find((state) => !state.label.trim());
    if (invalid) {
      throw new Error(`状态「${invalid.label.trim() || "未命名"}」还缺状态名。`);
    }
    return source.map((state) => {
      const label = state.label.trim();
      const description = state.description.trim() || label;
      return {
        ...state,
        label,
        description,
        imagePrompt: state.imagePrompt.trim() || description,
        ...(state.voicePrompt?.trim() ? { voicePrompt: state.voicePrompt.trim() } : {}),
      };
    });
  };

  const persistStates = async (next: StoryAssetState[]): Promise<StoryAssetState[]> => {
    if (!asset) {
      throw new Error("先保存资产，再管理状态。");
    }
    if (kind === "character") {
      const response = await updateStorySettingsCharacter(asset.novelId, asset.assetId, { states: next });
      return response.data?.states ?? next;
    }
    if (kind === "scene") {
      const response = await updateStorySettingsScene(asset.novelId, asset.assetId, { states: next });
      return response.data?.states ?? next;
    }
    const response = await updateStorySettingsProp(asset.novelId, asset.assetId, { states: next });
    return response.data?.states ?? next;
  };

  /** 生成前的统一动作：有未保存修改就先自动保存（服务端按最新 statesJson 取参考/提示词）。 */
  const flushLocalEdits = async () => {
    if (!localDirty) {
      return;
    }
    const saved = await persistStates(normalizeStatesForSave(states));
    onChange(saved);
  };

  const saveMutation = useMutation({
    mutationFn: async () => persistStates(normalizeStatesForSave(states)),
    onSuccess: async (saved) => {
      onChange(saved);
      setLocalDirty(false);
      await invalidateSettings();
      toast.success("状态已保存。");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "状态保存失败，请重试。"),
  });

  const imageMutation = useMutation({
    mutationFn: async (stateId: string) => {
      if (!asset) {
        throw new Error("先保存资产，再生成状态图。");
      }
      await flushLocalEdits();
      return generateStoryAssetStateImage(asset.novelId, kind, asset.assetId, stateId);
    },
    onSuccess: async (response) => {
      onChange(response.data?.states ?? []);
      setLocalDirty(false);
      await invalidateSettings();
      toast.success("状态图已生成。");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "状态图生成失败，请重试。"),
  });

  const voiceMutation = useMutation({
    mutationFn: async (stateId: string) => {
      if (!asset || kind !== "character") {
        throw new Error("先保存角色，再生成状态音色。");
      }
      await flushLocalEdits();
      return generateStoryCharacterStateVoice(asset.novelId, asset.assetId, stateId, "generate_new");
    },
    onSuccess: async (response) => {
      onChange(response.data?.states ?? []);
      setLocalDirty(false);
      setVoicePickerOpen(false);
      await invalidateSettings();
      toast.success("状态音色已生成。");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "状态音色生成失败，请重试。"),
  });

  const pickVoiceMutation = useMutation({
    mutationFn: async ({ stateId, sourceStateId }: { stateId: string; sourceStateId: string }) => {
      if (!asset || kind !== "character") {
        throw new Error("先保存角色，再选取状态音色。");
      }
      await flushLocalEdits();
      return generateStoryCharacterStateVoice(asset.novelId, asset.assetId, stateId, "reuse_previous", sourceStateId);
    },
    onSuccess: async (response) => {
      onChange(response.data?.states ?? []);
      setLocalDirty(false);
      setVoicePickerOpen(false);
      await invalidateSettings();
      toast.success("已应用所选状态的音色。");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "选取音色失败，请重试。"),
  });

  const updateState = (stateId: string, patch: Partial<StoryAssetState>) => {
    onChange(states.map((state) => (state.id === stateId ? { ...state, ...patch } : state)));
    setLocalDirty(true);
  };

  const addState = () => {
    const previous = states[states.length - 1];
    const id = newStateId();
    onChange([...states, {
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
    }]);
    setLocalDirty(true);
    setSelectedStateId(id);
    setVoicePickerOpen(false);
  };

  const removeState = (index: number) => {
    if (index === 0) {
      toast.error("初始状态不能删除。");
      return;
    }
    const removedId = states[index]?.id;
    onChange(states
      .filter((_state, position) => position !== index)
      .map((state) => (state.referenceStateId === removedId ? { ...state, referenceStateId: null } : state)));
    setLocalDirty(true);
  };

  const selectedIndex = states.findIndex((state) => state.id === selectedStateId);
  const selectedState = selectedIndex >= 0 ? states[selectedIndex] ?? null : null;
  const referenceOptions = selectedState ? states.filter((state) => state.id !== selectedState.id) : [];
  const voiceSourceOptions = selectedState
    ? states.filter((state) => state.id !== selectedState.id
      && state.voice?.status === "done"
      && Boolean(state.voice.sampleAudioUrl?.trim()))
    : [];
  const anyPending = imageMutation.isPending || voiceMutation.isPending || pickVoiceMutation.isPending || saveMutation.isPending;
  const generationDisabled = !asset || anyPending;

  return (
    <div className="flex flex-col items-stretch gap-4 lg:flex-row lg:items-start">
      <div className="flex max-h-[28rem] flex-col gap-1.5 self-start overflow-y-auto rounded-lg border border-border/60 bg-muted/20 p-2 lg:w-72 lg:shrink-0">
        {states.length === 0 ? (
          <div className="flex min-h-28 items-center justify-center rounded-md border border-dashed border-border px-3 text-center text-xs text-muted-foreground">
            还没有状态
          </div>
        ) : null}
        {states.map((state) => {
          const stateIndex = states.indexOf(state);
          const stateLabel = getAssetStateLabel(state, stateIndex);
          const isSelected = state.id === selectedStateId;
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
                  setSelectedStateId(state.id);
                  setVoicePickerOpen(false);
                }}
                disabled={anyPending}
              >
                {state.image?.url ? (
                  <img src={buildStateImageSrc(state.image.url, state.image.generatedAt)} alt={`${stateLabel} 状态图`} className="h-10 w-14 shrink-0 rounded-md border border-border object-cover" />
                ) : (
                  <div className="h-10 w-14 shrink-0 rounded-md border border-dashed border-border bg-muted/20" aria-label={`${stateLabel}尚未生成图片`} />
                )}
                <span className="min-w-0 truncate text-sm font-medium text-foreground">{stateLabel}</span>
              </button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive"
                aria-label={stateIndex === 0 ? "初始状态不能删除" : `删除${stateLabel}`}
                disabled={anyPending || stateIndex === 0}
                onClick={() => removeState(stateIndex)}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          );
        })}
        <Button type="button" variant="outline" size="sm" className="mt-1 w-full" onClick={addState} disabled={anyPending}>
          <Plus className="mr-1 h-3.5 w-3.5" aria-hidden="true" />添加状态
        </Button>
      </div>

      <div className="min-w-0 flex-1 space-y-3 rounded-lg border border-border/60 bg-background p-3">
        {selectedState ? (
          <>
            <section className="space-y-2" aria-label="状态图片">
              <div className="overflow-hidden rounded-lg border border-border/60 bg-muted/10">
                {selectedState.image?.url ? (
                  <LightboxImage
                    src={buildStateImageSrc(selectedState.image.url, selectedState.image.generatedAt)}
                    alt={`${getAssetStateLabel(selectedState, selectedIndex)} 状态图`}
                    fit="contain"
                    blurBackdrop={false}
                    className="aspect-[3/2] max-h-[28rem] w-full rounded-lg border-0"
                  />
                ) : (
                  <div
                    className="aspect-[3/2] max-h-[28rem] w-full rounded-lg bg-muted/10"
                    role="img"
                    aria-label={`${getAssetStateLabel(selectedState, selectedIndex)}尚未生成图片`}
                  />
                )}
              </div>
              <div className="flex flex-wrap items-end justify-between gap-2">
                <label className="min-w-40 flex-1 space-y-1">
                  <span className="text-xs font-medium">参考图</span>
                  <SelectControl
                    className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                    aria-label="生图参考"
                    value={selectedState.referenceStateId ?? ""}
                    disabled={selectedIndex === 0 || anyPending}
                    onChange={(event) => updateState(selectedState.id, { referenceStateId: event.target.value || null })}
                  >
                    <option value="">不参考，生成全新形象</option>
                    {referenceOptions.map((state) => (
                      <option key={state.id} value={state.id}>参考「{getAssetStateLabel(state, states.indexOf(state))}」</option>
                    ))}
                  </SelectControl>
                </label>
                <AiButton
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8"
                  disabled={generationDisabled}
                  title={!asset ? "先保存资产，再生成状态图" : undefined}
                  onClick={() => imageMutation.mutate(selectedState.id)}
                >
                  {imageMutation.isPending && imageMutation.variables === selectedState.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : selectedState.image?.url ? <RefreshCw className="h-3.5 w-3.5" /> : <ImagePlus className="h-3.5 w-3.5" />}
                  {imageMutation.isPending && imageMutation.variables === selectedState.id ? "生成中..." : selectedState.image?.url ? "重新生成图片" : "生成图片"}
                </AiButton>
              </div>
              {selectedIndex === 0 ? <p className="text-xs text-muted-foreground">初始状态是基础形象，直接生成。</p> : null}
              {selectedState.image?.error ? <p className="text-xs text-destructive">{selectedState.image.error}</p> : null}
            </section>

            <section className="grid gap-3 rounded-lg border border-border/60 bg-muted/20 p-3 md:grid-cols-2" aria-label="状态设定">
              <label className="block space-y-1">
                <span className="text-xs font-medium">状态名</span>
                <Input value={selectedState.label} placeholder="例如：警察制服 / 重伤 / 黑夜" onChange={(event) => updateState(selectedState.id, { label: event.target.value })} />
              </label>
              {showVoice ? (
                <label className="block space-y-1">
                  <span className="text-xs font-medium">年龄段</span>
                  <SelectControl
                    className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                    aria-label="状态年龄段"
                    value={selectedState.ageGroup ?? "youth"}
                    onChange={(event) => updateState(selectedState.id, { ageGroup: event.target.value as StoryAssetState["ageGroup"] })}
                  >
                    <option value="child">少年/儿童</option>
                    <option value="youth">青年</option>
                    <option value="middle">中年</option>
                    <option value="elder">老年</option>
                  </SelectControl>
                </label>
              ) : null}
              {showScene ? (
                <div className="grid grid-cols-3 gap-2 md:col-span-2">
                  <label className="block min-w-0 space-y-1">
                    <span className="text-xs font-medium">场景类型</span>
                    <SelectControl
                      className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                      aria-label="状态场景类型"
                      value={selectedState.sceneType ?? ""}
                      onChange={(event) => updateState(selectedState.id, { sceneType: event.target.value ? event.target.value as StoryAssetState["sceneType"] : null })}
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
                      onChange={(event) => updateState(selectedState.id, { timeOfDay: event.target.value ? event.target.value as StoryAssetState["timeOfDay"] : null })}
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
                      onChange={(event) => updateState(selectedState.id, { weather: event.target.value ? event.target.value as StoryAssetState["weather"] : null })}
                    >
                      <option value="">未设定</option>
                      <option value="sunny">晴天</option>
                      <option value="cloudy">阴天</option>
                      <option value="rainy">雨天</option>
                    </SelectControl>
                  </label>
                </div>
              ) : null}
              <label className="block space-y-1 md:col-span-2">
                <span className="text-xs font-medium">图片提示词</span>
                <Textarea
                  rows={3}
                  value={selectedState.imagePrompt}
                  placeholder="留空则按状态名生成；内容较长时可换行写"
                  onChange={(event) => updateState(selectedState.id, { imagePrompt: event.target.value })}
                />
              </label>
            </section>

            {showVoice ? (
              <section className="space-y-3 rounded-lg border border-border/60 bg-muted/20 p-3" aria-label="状态音色">
                <label className="block space-y-1">
                  <span className="text-xs font-medium">音色提示词</span>
                  <Textarea
                    rows={2}
                    value={selectedState.voicePrompt ?? ""}
                    placeholder={selectedIndex === 0 ? "例如：低沉清晰的青年男声" : "例如：虚弱沙哑，带喘息"}
                    onChange={(event) => updateState(selectedState.id, { voicePrompt: event.target.value })}
                  />
                </label>
                <div className="flex flex-wrap justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={!asset || voiceSourceOptions.length === 0 || anyPending}
                    title={voiceSourceOptions.length === 0 ? "还没有其他状态生成过音色" : "把另一个状态已生成的音色直接拿来用"}
                    onClick={() => setVoicePickerOpen((open) => !open)}
                  >
                    <AudioLines className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />选取音色
                  </Button>
                  <AiButton
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={generationDisabled}
                    onClick={() => voiceMutation.mutate(selectedState.id)}
                  >
                    {voiceMutation.isPending && voiceMutation.variables === selectedState.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mic2 className="h-3.5 w-3.5" />}
                    {voiceMutation.isPending && voiceMutation.variables === selectedState.id ? "生成中..." : "生成音色"}
                  </AiButton>
                </div>
                {voicePickerOpen ? (
                  <div className="space-y-1.5 rounded-md border border-dashed border-border bg-background p-2">
                    <p className="text-xs text-muted-foreground">选一个状态，把它的音色拿过来用：</p>
                    {voiceSourceOptions.map((state) => (
                      <button
                        key={state.id}
                        type="button"
                        className="flex w-full items-center justify-between gap-2 rounded-md bg-muted/40 px-2.5 py-2 text-left text-sm transition-colors hover:bg-muted/70 disabled:opacity-50"
                        disabled={pickVoiceMutation.isPending}
                        onClick={() => pickVoiceMutation.mutate({ stateId: selectedState.id, sourceStateId: state.id })}
                      >
                        <span className="min-w-0 shrink-0 font-medium text-foreground">{getAssetStateLabel(state, states.indexOf(state))}</span>
                        <span className="min-w-0 truncate text-xs text-muted-foreground">{state.voicePrompt || state.voice?.prompt || ""}</span>
                      </button>
                    ))}
                    <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setVoicePickerOpen(false)}>取消</Button>
                  </div>
                ) : null}
                {selectedState.voice?.sampleAudioUrl ? <audio controls preload="metadata" src={selectedState.voice.sampleAudioUrl} className="h-8 w-full" /> : null}
                {selectedState.voice?.error ? <p className="text-xs text-destructive">{selectedState.voice.error}</p> : null}
              </section>
            ) : null}

            <div className="flex items-center justify-between gap-2 border-t border-border/60 pt-3">
              {asset ? (
                <>
                  <p className="text-xs text-muted-foreground">
                    {localDirty ? "状态已修改，点「保存状态」生效；直接点生成也会先自动保存。" : "修改状态后记得保存。"}
                  </p>
                  <Button type="button" size="sm" onClick={() => saveMutation.mutate()} disabled={!localDirty || anyPending}>
                    {saveMutation.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
                    {saveMutation.isPending ? "保存中..." : "保存状态"}
                  </Button>
                </>
              ) : (
                <p className="text-xs text-muted-foreground">保存资产后，这里可以生成图片{showVoice ? "和音色" : ""}。</p>
              )}
            </div>
          </>
        ) : (
          <div className="flex min-h-64 items-center justify-center px-4 text-center text-sm text-muted-foreground">
            点左下「添加状态」，在这里编辑{showVoice ? "角色" : showScene ? "场景" : "道具"}的外观状态。
          </div>
        )}
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
