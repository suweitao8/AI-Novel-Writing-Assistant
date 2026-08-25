import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AudioLines, Box, ImagePlus, Loader2, Mic2, Plus, RefreshCw, Square, Trash2, Wand2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  cancelStoryAssetStateImage,
  generateStoryCharacterStateVoice,
  getStorySettingsCharacters,
  getStorySettingsProps,
  getStorySettingsScenes,
  tweakStoryStateImagePrompt,
  updateStorySettingsCharacter,
  updateStorySettingsProp,
  updateStorySettingsScene,
} from "@/api/story/storySettings";
import { getDramaVisualStyles } from "@/api/media/drama";
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
  STORY_ASSET_WEAR_TAG_OPTIONS,
  type StoryAssetState,
  type StoryAssetWearTag,
} from "@ai-novel/shared/types/novelReferenceExtraction";
import {
  getStoryAssetImageRequestState,
  requestStoryAssetImage,
} from "./storyAssetImageRequestCoordinator";
import { buildScene3dEditorPath } from "@/pages/drama/comicDrama/navigation/studioNavigation";

// 设定资产的共用表单：设定中心三个资产页签的编辑弹窗与漫剧「提取」的应用弹窗
// 复用同一套字段组件——两边字段、文案、占位完全一致，提取出来的资产和手动建的
// 资产是同一种东西，编辑体验也必须一致。
// 角色基础表单只保留身份字段；年龄、外貌和音色都属于角色状态，避免同一份设定
// 在角色表单和状态编辑器里重复填写。

export interface CharacterAssetFormState {
  name: string;
  gender: string;
}

// 状态未选时代风格时的默认值：与服务端内置默认预设一致（DRAMA_VISUAL_STYLE_PRESETS 的
// realistic 预设，label「现代都市」）；空值在生成状态图时也按这个预设出图。
const DEFAULT_ERA_STYLE_LABEL = "现代都市";

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
    ...(input.eraStyle?.trim() ? { eraStyle: input.eraStyle.trim() } : {}),
  };
}

export function newStateId(): string {
  return `state-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export { buildStateImageSrc };

function getAssetStateLabel(state: StoryAssetState, stateIndex: number): string {
  const label = state.label?.trim();
  if (stateIndex === 0 && (label === "默认" || label === "初始形象" || label === "初始状态")) {
    return "默认";
  }
  return label || "未命名状态";
}

/** 生成中的实时耗时（2026-08-23 用户要求）：挂载即开始计秒，让用户看得到已经等了多久、
 * 判断是不是环境问题卡住（服务端 3 分钟自动超时，也可随时点「终止」）。 */
function GeneratingElapsedLabel() {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  useEffect(() => {
    const startedAt = Date.now();
    setElapsedSeconds(0);
    const timer = setInterval(() => {
      setElapsedSeconds(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    }, 1000);
    return () => clearInterval(timer);
  }, []);
  const formatted = elapsedSeconds < 60
    ? `${elapsedSeconds} 秒`
    : `${Math.floor(elapsedSeconds / 60)} 分 ${elapsedSeconds % 60} 秒`;
  return <>生成中 {formatted}</>;
}

/** 保存前归一：trim；说明与图片提示词留空按状态名兜底；每个状态都要有状态名。
 * 状态不再单独保存（2026-08-22 用户决定统一由弹窗「保存」落库），编辑弹窗与提取
 * 应用弹窗的保存都要走这份归一，保证各处校验与兜底一致。 */
export function normalizeStatesForSave(source: StoryAssetState[]): StoryAssetState[] {
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
}

// 状态编辑器（角色/场景/道具编辑弹窗共用）：左列状态列表 + 右侧当前状态直接编辑。
// 2026-08-22 用户决定的交互：
// - 所有字段行内直接可编辑，统一由弹窗「保存」一次落库（状态不单独保存，2026-08-22
//   用户决定）；点「生成图片/生成音色」会先把未保存的状态自动存好再生成；
// - 状态字段只有 状态名+年龄段（场景为类型/时间/天气）与图片提示词——状态名已能表达
//   成因，不再单列「状态变化」，保存时说明留空按状态名回填；
// - 图片：生成前在这里选参考图（任意其他状态的图）或留空直接生成全新形象；
//   场景状态图按普通 2:1 图片展示；需要空间预览或摆位时进入独立的 3D 编辑；
// - 图片提示词可 AI 微调：复用旧状态提示词时，写一句要改的地方（如「去掉身上的
//   伤」）即可，AI 只改指令涉及的部分；改完随状态一起保存，不单独落库；
// - 音色（仅角色）：音色提示词可直接写；「生成音色」合成新音色；旁边「选取音色」
//   把任意其他状态已生成的音色直接拿来用——不再有「沿用上一状态」的隐式模式；
// - 图片/音色提示词较长，用多行文本；「添加状态」在列表底部；区块不加标题。
// - 生成在服务端完成，关掉弹窗也不会中断：编辑器挂着资产列表查询——打开弹窗即取
//   最新结果，仍有 generating 状态时轮询到完成；用户未保存的修改不会被同步覆盖。
export function AssetStatesEditor(props: {
  states: StoryAssetState[];
  onChange: (states: StoryAssetState[]) => void;
  kind: "character" | "scene" | "prop";
  /** 提示词微调等 AI 接口按小说走，资产还没保存（没有 id）也能用。 */
  novelId: string;
  /** 资产名（角色名/场景名/道具名），给提示词微调当上下文；新建未命名可省略。 */
  assetName?: string;
  /** 编辑已有资产时传入；生成与保存需要它调用接口（新建未保存的资产还没有 id） */
  asset?: { novelId: string; assetId: string };
}) {
  const { states, onChange, kind, novelId, assetName, asset } = props;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedStateId, setSelectedStateId] = useState<string | null>(states[0]?.id ?? null);
  const [voicePickerOpen, setVoicePickerOpen] = useState(false);
  const [localDirty, setLocalDirty] = useState(false);
  const [promptTweak, setPromptTweak] = useState("");
  // 添加状态的模板选择（null=未在添加；空串=空白创建；其他=作为模板的状态 id）。
  const [addFromStateId, setAddFromStateId] = useState<string | null>(null);
  // 图片区比例跟随资产画幅：场景状态图保持 2:1，角色/道具设计图严格 16:9。
  const stateImageAspect = kind === "scene" ? "aspect-[2/1]" : "aspect-video";
  const showVoice = kind === "character";
  const showScene = kind === "scene";

  useEffect(() => {
    if (selectedStateId && states.some((state) => state.id === selectedStateId)) {
      return;
    }
    setSelectedStateId(states[0]?.id ?? null);
  }, [selectedStateId, states]);

  // 微调指令只对当前选中的状态生效，切状态即复位。
  useEffect(() => {
    setPromptTweak("");
  }, [selectedStateId]);

  // 后台生成跟进：生成是服务端在请求内完成的——弹窗关掉后服务端仍会跑完并落库
  //（断连不中断，2026-08-22 实测确认）。这里挂同一份资产列表查询：每次打开弹窗先取
  // 最新数据（拿到已生成完的图片/音色），有状态还在 generating 时每 3 秒轮询；
  // 表单干净（没有未保存修改）时把服务端状态同步回来。用户未保存的修改永远优先。
  const anyServerGenerating = states.some((state) => state.image?.status === "generating" || state.voice?.status === "generating");
  const watchQueryKey = asset
    ? (kind === "character"
      ? queryKeys.novels.storySettingsCharacters(asset.novelId)
      : kind === "scene"
        ? queryKeys.novels.storySettingsScenes(asset.novelId)
        : queryKeys.novels.storySettingsProps(asset.novelId))
    : null;
  const watchQuery = useQuery({
    queryKey: watchQueryKey ?? ["novels", "story-settings", novelId, kind, "watch"],
    queryFn: async () => {
      if (!asset) {
        return null;
      }
      return kind === "character"
        ? getStorySettingsCharacters(asset.novelId)
        : kind === "scene"
          ? getStorySettingsScenes(asset.novelId)
          : getStorySettingsProps(asset.novelId);
    },
    enabled: Boolean(asset),
    refetchInterval: anyServerGenerating ? 3000 : false,
  });

  useEffect(() => {
    if (!asset || localDirty) {
      return;
    }
    const rows = watchQuery.data?.data;
    if (!Array.isArray(rows)) {
      return;
    }
    const serverStates = (rows as Array<{ id: string; states?: StoryAssetState[] }>)
      .find((row) => row.id === asset.assetId)?.states;
    if (!serverStates?.length) {
      return;
    }
    if (JSON.stringify(serverStates) !== JSON.stringify(states)) {
      onChange(serverStates);
    }
  }, [watchQuery.data, asset, localDirty, states, onChange]);

  // 时代风格选项：全局时代画风库（GET /drama/visual-styles 返回内置预设 + 全局自定义，
  // 2026-08-22 起不再读本书 artStyles）；值用 label，与脚本画风标记同一命名空间；
  // 未选时默认「现代都市」（与服务端生成时的空值兜底一致）。
  const visualStylesQuery = useQuery({
    queryKey: queryKeys.drama.visualStyles,
    queryFn: getDramaVisualStyles,
  });
  const eraStyleOptions = useMemo(
    () => (visualStylesQuery.data?.data ?? []).map((style) => style.label).filter(Boolean),
    [visualStylesQuery.data],
  );

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

  /** 保存前归一见模块级 normalizeStatesForSave（弹窗「保存」统一落库）。 */

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

  /** 生成前的统一动作：有未保存修改就先自动保存（服务端按最新 statesJson 取参考/提示词）。
   * 保存入口只有弹窗的「保存」——这里只是生成前的自动落库，不影响用户继续编辑。 */
  const flushLocalEdits = async () => {
    if (!localDirty) {
      return;
    }
    const saved = await persistStates(normalizeStatesForSave(states));
    onChange(saved);
  };

  const imageMutation = useMutation({
    mutationFn: async (stateId: string) => {
      if (!asset) {
        throw new Error("先保存资产，再生成状态图。");
      }
      await flushLocalEdits();
      return requestStoryAssetImage({
        novelId: asset.novelId,
        kind,
        assetId: asset.assetId,
        stateId,
      });
    },
    onSuccess: async (response) => {
      onChange(response.data?.states ?? []);
      setLocalDirty(false);
      await invalidateSettings();
      toast.success("状态图已生成。");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "状态图生成失败，请重试。"),
  });

  // 终止生成中的状态图（代理切错、生成卡住时停掉重来，不等超时）。
  const cancelImageMutation = useMutation({
    mutationFn: async (stateId: string) => {
      if (!asset) {
        throw new Error("资产还未保存。");
      }
      return cancelStoryAssetStateImage(asset.novelId, kind, asset.assetId, stateId);
    },
    onSuccess: async (response) => {
      onChange(response.data?.states ?? []);
      await invalidateSettings();
      toast.success("已终止生成，可重新生成。");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "终止生成失败，请重试。"),
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

  // 提示词微调：AI 只改指令涉及的部分，结果写回当前状态的图片提示词（随状态一起保存）。
  const promptTweakMutation = useMutation({
    mutationFn: async ({ stateId, instruction }: { stateId: string; instruction: string }) => {
      const state = states.find((item) => item.id === stateId);
      const response = await tweakStoryStateImagePrompt(novelId, {
        kind,
        assetName,
        stateLabel: state?.label?.trim() || undefined,
        imagePrompt: state?.imagePrompt?.trim() || undefined,
        instruction,
      });
      return response.data?.imagePrompt ?? "";
    },
    onSuccess: (imagePrompt, variables) => {
      if (!imagePrompt) {
        toast.error("没能改写出新的图片提示词，请换个说法再试。");
        return;
      }
      updateState(variables.stateId, { imagePrompt });
      setPromptTweak("");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "提示词改写失败，请重试。"),
  });

  const addState = (templateStateId: string | null) => {
    const template = templateStateId ? states.find((state) => state.id === templateStateId) ?? null : null;
    const previous = states[states.length - 1];
    const id = newStateId();
    // 基于所选状态创建（2026-08-23 用户要求，同日二次调整为全量复制）：挑最接近新状态的
    // 旧状态当模板，全部属性原封不动复制过来——描述/图片提示词/音色提示词/时代风格/年龄段
    // （或场景的时间天气），已生成的图片与音色也直接拿来用（URL 指向模板的文件，重新生成时
    // 才会写自己的）。状态名在模板名后加数字（初始形象→初始形象2→初始形象3…），生图参考
    // 指向模板状态：重新生成时以模板的图锁定同一形象，只画状态差异。
    let nextState: StoryAssetState;
    if (template) {
      const baseLabel = template.label?.trim() || "状态";
      let label = `${baseLabel}2`;
      for (let suffix = 2; states.some((state) => state.label === label); suffix += 1) {
        label = `${baseLabel}${suffix}`;
      }
      nextState = { ...template, id, label, referenceStateId: template.id };
    } else {
      nextState = {
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
      };
    }
    onChange([...states, nextState]);
    setLocalDirty(true);
    setSelectedStateId(id);
    setVoicePickerOpen(false);
  };

  const removeState = (index: number) => {
    if (index === 0) {
      toast.error("默认状态不能删除。");
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
  const anyPending = imageMutation.isPending || cancelImageMutation.isPending || voiceMutation.isPending || pickVoiceMutation.isPending || promptTweakMutation.isPending;
  const imageRequestState = asset && selectedStateId
    ? getStoryAssetImageRequestState({
      novelId: asset.novelId,
      kind,
      assetId: asset.assetId,
      stateId: selectedStateId,
    })
    : null;
  const imageRequestActive = imageRequestState === "queued" || imageRequestState === "running";
  // 服务端仍在生成（弹窗重开/轮询读到的 generating 态）：按钮显示生成中并禁用重复触发。
  const serverImageGenerating = selectedState?.image?.status === "generating";
  const generationDisabled = !asset || anyPending || imageRequestActive || serverImageGenerating;
  const imageGenerating = (imageMutation.isPending && imageMutation.variables === selectedStateId)
    || Boolean(serverImageGenerating)
    || imageRequestActive;
  const serverVoiceGenerating = selectedState?.voice?.status === "generating";

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
                aria-label={stateIndex === 0 ? "默认状态不能删除" : `删除${stateLabel}`}
                disabled={anyPending || stateIndex === 0}
                onClick={() => removeState(stateIndex)}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          );
        })}
        {addFromStateId !== null ? (
          <div className="mt-1 space-y-1.5 rounded-md border border-border bg-background p-2">
            <SelectControl
              className="h-9 w-full rounded-md border bg-background px-2 text-sm"
              aria-label="基于哪个状态创建新状态"
              value={addFromStateId}
              onChange={(event) => setAddFromStateId(event.target.value)}
            >
              <option value="">空白状态（不复制内容）</option>
              {states.map((state, index) => (
                <option key={state.id} value={state.id}>复制「{getAssetStateLabel(state, index)}」</option>
              ))}
            </SelectControl>
            <div className="flex gap-1.5">
              <Button
                type="button"
                size="sm"
                className="flex-1"
                disabled={anyPending}
                onClick={() => {
                  addState(addFromStateId || null);
                  setAddFromStateId(null);
                }}
              >
                <Plus className="mr-1 h-3.5 w-3.5" aria-hidden="true" />创建状态
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => setAddFromStateId(null)}>取消</Button>
            </div>
          </div>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-1 w-full"
            disabled={anyPending}
            onClick={() => setAddFromStateId(states[states.length - 1]?.id ?? "")}
          >
            <Plus className="mr-1 h-3.5 w-3.5" aria-hidden="true" />添加状态
          </Button>
        )}
      </div>

      <div className="min-w-0 flex-1 space-y-3 rounded-lg border border-border/60 bg-background p-3">
        {selectedState ? (
          <>
            <section className="space-y-2" aria-label="状态图片">
              <div className="relative overflow-hidden rounded-lg border border-border/60 bg-muted/10">
                {selectedState.image?.url ? (
                  <LightboxImage
                    src={buildStateImageSrc(selectedState.image.url, selectedState.image.generatedAt)}
                    alt={`${getAssetStateLabel(selectedState, selectedIndex)} 状态图`}
                    fit="contain"
                    blurBackdrop={false}
                    className={cn(stateImageAspect, "w-full rounded-lg border-0")}
                  />
                ) : (
                  <div
                    className={cn(stateImageAspect, "w-full rounded-lg bg-muted/10")}
                    role="img"
                    aria-label={`${getAssetStateLabel(selectedState, selectedIndex)}尚未生成图片`}
                  />
                )}
              </div>
              {kind === "scene" && selectedState.image?.url ? (
                <div className="flex justify-end pt-2" role="group" aria-label="场景 3D 操作">
                  {asset ? (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="h-7 px-2 text-xs shadow-sm"
                      disabled={anyPending}
                      aria-label={`编辑${getAssetStateLabel(selectedState, selectedIndex)}状态的 3D 场景`}
                      onClick={() => navigate(buildScene3dEditorPath(asset.novelId, asset.assetId, selectedState.id))}
                    >
                      <Box className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                      3D编辑
                    </Button>
                  ) : null}
                </div>
              ) : null}
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
                  {imageGenerating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : selectedState.image?.url ? <RefreshCw className="h-3.5 w-3.5" /> : <ImagePlus className="h-3.5 w-3.5" />}
                  {imageGenerating ? <GeneratingElapsedLabel /> : selectedState.image?.url ? "重新生成图片" : "生成图片"}
                </AiButton>
                {imageGenerating ? (
                  <AiButton
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8"
                    disabled={cancelImageMutation.isPending || !asset || imageRequestState === "queued"}
                    title={imageRequestState === "queued" ? "图片已排队，开始生成后可终止。" : "停止本次生成，可重新发起"}
                    onClick={() => cancelImageMutation.mutate(selectedState.id)}
                  >
                    {cancelImageMutation.isPending && cancelImageMutation.variables === selectedState.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Square className="h-3.5 w-3.5" aria-hidden="true" />}
                    {cancelImageMutation.isPending && cancelImageMutation.variables === selectedState.id ? "终止中..." : "终止"}
                  </AiButton>
                ) : null}
              </div>
              {selectedIndex === 0 ? <p className="text-xs text-muted-foreground">默认状态是基础形象，直接生成。</p> : null}
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
              <label className="block space-y-1">
                <span className="text-xs font-medium">时代风格</span>
                <SelectControl
                  className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                  aria-label="状态时代风格"
                  value={selectedState.eraStyle?.trim() || DEFAULT_ERA_STYLE_LABEL}
                  disabled={anyPending}
                  onChange={(event) => updateState(selectedState.id, { eraStyle: event.target.value || null })}
                >
                  {[...new Set([
                    DEFAULT_ERA_STYLE_LABEL,
                    ...eraStyleOptions,
                    ...(selectedState.eraStyle && selectedState.eraStyle !== DEFAULT_ERA_STYLE_LABEL ? [selectedState.eraStyle] : []),
                  ])].map((label) => (
                    <option key={label} value={label}>{label}</option>
                  ))}
                </SelectControl>
              </label>
              {showVoice ? (
                <div className="space-y-1.5 md:col-span-2">
                  <span className="text-xs font-medium">身上状态</span>
                  <div className="flex flex-wrap gap-1.5">
                    {STORY_ASSET_WEAR_TAG_OPTIONS.map((tag) => {
                      const active = (selectedState.wearTags ?? []).includes(tag.id);
                      return (
                        <Button
                          key={tag.id}
                          type="button"
                          size="sm"
                          variant={active ? "default" : "outline"}
                          className={cn("h-7 rounded-full px-3 text-xs", active && "font-medium")}
                          aria-pressed={active}
                          disabled={anyPending}
                          onClick={() => {
                            const next = active
                              ? (selectedState.wearTags ?? []).filter((item) => item !== tag.id)
                              : [...(selectedState.wearTags ?? []), tag.id as StoryAssetWearTag];
                            updateState(selectedState.id, { wearTags: next.length > 0 ? next : undefined });
                          }}
                        >
                          {tag.label}
                        </Button>
                      );
                    })}
                  </div>
                </div>
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
              <div className="flex items-center gap-2 md:col-span-2">
                <Input
                  value={promptTweak}
                  className="h-8 text-xs"
                  placeholder={kind === "character"
                    ? "要改哪里？如：去掉身上的伤、换成黑色外套"
                    : kind === "scene"
                      ? "要改哪里？如：改成夜晚下雨"
                      : "要改哪里？如：表面加一道裂痕"}
                  disabled={anyPending}
                  onChange={(event) => setPromptTweak(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && promptTweak.trim() && !anyPending) {
                      event.preventDefault();
                      promptTweakMutation.mutate({ stateId: selectedState.id, instruction: promptTweak.trim() });
                    }
                  }}
                />
                <AiButton
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 shrink-0"
                  disabled={!promptTweak.trim() || anyPending}
                  title="按上面这句小改动，让 AI 改写图片提示词"
                  onClick={() => promptTweakMutation.mutate({ stateId: selectedState.id, instruction: promptTweak.trim() })}
                >
                  {promptTweakMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" aria-hidden="true" />}
                  {promptTweakMutation.isPending ? "改写中..." : "改写"}
                </AiButton>
              </div>
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
                    disabled={generationDisabled || serverVoiceGenerating}
                    onClick={() => voiceMutation.mutate(selectedState.id)}
                  >
                    {(voiceMutation.isPending && voiceMutation.variables === selectedState.id) || serverVoiceGenerating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mic2 className="h-3.5 w-3.5" />}
                    {(voiceMutation.isPending && voiceMutation.variables === selectedState.id) || serverVoiceGenerating ? "生成中..." : "生成音色"}
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

            {!asset ? (
              <p className="border-t border-border/60 pt-3 text-xs text-muted-foreground">保存资产后，这里可以生成图片{showVoice ? "和音色" : ""}。</p>
            ) : null}
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
  eraStyle?: string | null;
}): StoryAssetState {
  const description = input.summary?.trim() || input.environmentPrompt?.trim() || `${input.name.trim()}默认状态`;
  const imagePrompt = input.environmentPrompt?.trim() || description;
  return {
    id: "initial",
    label: "默认",
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
    ...(input.eraStyle?.trim() ? { eraStyle: input.eraStyle.trim() } : {}),
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
  eraStyle?: string | null;
}): StoryAssetState {
  const description = input.description?.trim() || input.visualPrompt?.trim() || `${input.name.trim()}默认状态`;
  return {
    id: "initial",
    label: "默认",
    description,
    imagePrompt: input.visualPrompt?.trim() || description,
    referenceStateId: null,
    ...(input.eraStyle?.trim() ? { eraStyle: input.eraStyle.trim() } : {}),
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
