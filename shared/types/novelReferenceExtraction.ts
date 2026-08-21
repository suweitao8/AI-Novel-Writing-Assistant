// 参考小说设定提取契约（v5）：漫剧工作室「解析」时从本章参考文本提取出的
// 角色 / 场景 / 道具 / 世界观建议。结果随章节持久化（Chapter.referenceExtractionJson），
// 用户在「提取」页签逐条核对修改后点「应用」创建进设定中心。
// v5 起角色带结构化 gender/ageGroup/physique（应用时直接预填设定表单）；
// v3 的 stateLabel/stateNote 提取时已不再生成，仅为已持久化的旧结果保留。

/** 资产状态生成图：状态编辑器点「生成图」后写入；按 referenceStateId 取另一状态的图当参考。 */
export interface StoryAssetStateImage {
  status: "idle" | "generating" | "done" | "error";
  url?: string;
  prompt?: string;
  provider?: string;
  generatedAt?: string;
  error?: string;
}

/** 状态音色的操作模式：沿用上一状态的试听，或为当前状态重新合成。 */
export type StoryAssetStateVoiceMode = "reuse_previous" | "generate_new";

export function getDefaultStoryAssetStateVoiceMode(
  states: Array<{ id: string }>,
  stateId: string,
): StoryAssetStateVoiceMode {
  const index = states.findIndex((state) => state.id === stateId);
  return index > 0 ? "reuse_previous" : "generate_new";
}

/** 角色状态的音色资产（试听音频以 data URL 形式随 statesJson 保存）。 */
export interface StoryAssetStateVoice {
  status: "idle" | "generating" | "done" | "error";
  mode: StoryAssetStateVoiceMode;
  sourceStateId?: string | null;
  sampleAudioUrl?: string;
  prompt?: string;
  generatedAt?: string;
  error?: string;
}

export type StoryAssetAgeGroup = "child" | "youth" | "middle" | "elder";

const STORY_ASSET_AGE_GROUPS = new Set<StoryAssetAgeGroup>(["child", "youth", "middle", "elder"]);
const STORY_ASSET_AGE_LABELS: Record<StoryAssetAgeGroup, string> = {
  child: "少年/儿童",
  youth: "青年",
  middle: "中年",
  elder: "老年",
};

/** 角色状态归并时读取的旧角色字段；旧列保留，但不再作为新的编辑入口。 */
export interface StoryCharacterLegacyFields {
  gender?: string | null;
  ageGroup?: string | null;
  physique?: string | null;
  attireStyle?: string | null;
  facePrompt?: string | null;
  appearance?: string | null;
  voiceTexture?: string | null;
}

/** 资产外观状态：同一资产随剧情推进的外观形态（换装/受伤/昼夜/损坏…）。 */
export interface StoryAssetState {
  id: string;
  /** 状态短名，如 初始/警察制服/受伤/黑夜/破损 */
  label: string;
  /** 这个状态下外观发生了什么（一句话） */
  description: string;
  /** 该状态的画面提示词（生图用） */
  imagePrompt: string;
  /** 该状态的音色提示词（配音用，仅角色有） */
  voicePrompt?: string;
  /** 角色状态的年龄段；场景/道具状态不使用。 */
  ageGroup?: StoryAssetAgeGroup;
  /** 来自第几章（初始状态可空） */
  chapterOrder?: number;
  /**
   * 生成该状态图片时用哪个状态的图当参考（同一资产内的状态 id）：
   * 典型用法是新状态参考上一状态（保持长相一致只换装/加伤），也可参考任意别的
   * 状态；不填＝不用参考图，直接生成全新形象（2026-08-20 用户要求的灵活配置）。
   */
  referenceStateId?: string | null;
  /** 该状态已生成的图片（状态编辑器生成/重新生成；文件在服务端，URL 随 statesJson 持久化） */
  image?: StoryAssetStateImage;
  /** 该状态的音色试听与复用来源（角色状态专用，场景/道具不使用）。 */
  voice?: StoryAssetStateVoice;
}

/**
 * 旧状态数据没有 referenceStateId 时的兼容规则：默认引用上一状态；首状态没有上游，
 * 用 null 表示不参考。显式 null 永远保留，代表用户主动选择了不参考。
 */
export function resolveStoryAssetStateReferenceId(
  states: StoryAssetState[],
  state: Pick<StoryAssetState, "id" | "referenceStateId">,
): string | null {
  if (state.referenceStateId !== undefined) {
    return state.referenceStateId;
  }
  const index = states.findIndex((item) => item.id === state.id);
  return index > 0 ? states[index - 1]?.id ?? null : null;
}

/** 读写 statesJson 前统一补齐旧数据的默认参考值，不改变显式取消参考。 */
export function normalizeStoryAssetStates(states: StoryAssetState[]): StoryAssetState[] {
  return states.map((state) => ({
    ...state,
    referenceStateId: resolveStoryAssetStateReferenceId(states, state),
  }));
}

function normalizeStoryAssetAgeGroup(value: unknown): StoryAssetAgeGroup | null {
  return typeof value === "string" && STORY_ASSET_AGE_GROUPS.has(value as StoryAssetAgeGroup)
    ? value as StoryAssetAgeGroup
    : null;
}

function compactText(...values: Array<string | null | undefined>): string {
  return values.map((value) => value?.trim()).filter(Boolean).join("，");
}

function legacyAppearance(legacy: StoryCharacterLegacyFields): string {
  return compactText(
    legacy.appearance,
    [legacy.physique, legacy.attireStyle].filter((value) => value?.trim()).join("，"),
  ) || "角色初始外观";
}

function genderLabel(value: string | null | undefined): string {
  return value === "male" ? "男性"
    : value === "female" ? "女性"
      : value === "other" ? "其他性别"
        : "";
}

function stateImagePrompt(
  state: { imagePrompt?: string | null; description?: string | null; ageGroup?: StoryAssetAgeGroup },
  legacy: StoryCharacterLegacyFields,
): string {
  const age = state.ageGroup ? STORY_ASSET_AGE_LABELS[state.ageGroup] : "";
  return compactText(
    state.imagePrompt,
    compactText(genderLabel(legacy.gender), age),
    state.description,
  ) || legacyAppearance(legacy);
}

/**
 * 把角色旧的外貌/音色字段归并到状态资产，并补齐状态默认值。
 * 这是确定性的契约归一化，不会覆盖已有状态的人工提示词或已生成资产。
 */
export function normalizeStoryCharacterStates(
  states: StoryAssetState[] | null | undefined,
  legacy: StoryCharacterLegacyFields = {},
): StoryAssetState[] {
  const source = (states ?? []).filter((state) => (
    typeof state?.id === "string" && state.id.trim() && typeof state?.label === "string" && state.label.trim()
  ));
  const initialAge = normalizeStoryAssetAgeGroup(legacy.ageGroup) ?? "youth";
  const initialDescription = legacyAppearance(legacy);
  const initialImagePrompt = compactText(legacy.facePrompt, initialDescription)
    || compactText(genderLabel(legacy.gender), STORY_ASSET_AGE_LABELS[initialAge], initialDescription);
  const working = source.length > 0
    ? source
    : [{
      id: "initial",
      label: "初始状态",
      description: initialDescription,
      imagePrompt: initialImagePrompt,
      ageGroup: initialAge,
      ...(legacy.voiceTexture?.trim() ? { voicePrompt: legacy.voiceTexture.trim() } : {}),
      referenceStateId: null,
    } satisfies StoryAssetState];

  let previousAge = initialAge;
  const normalized = working.map((state, index) => {
    const ageGroup = normalizeStoryAssetAgeGroup(state.ageGroup) ?? (index === 0 ? initialAge : previousAge);
    previousAge = ageGroup;
    const description = state.description?.trim()
      || (index === 0 ? initialDescription : working[index - 1]?.description?.trim() || initialDescription);
    const imagePrompt = state.imagePrompt?.trim()
      || stateImagePrompt({ description, ageGroup }, legacy);
    return {
      ...state,
      label: state.label.trim(),
      description,
      imagePrompt,
      ageGroup,
    };
  });
  return normalizeStoryAssetStates(normalized);
}

export interface ReferenceExtractItem {
  name: string;
  description: string;
  /** 图片提示词（角色/场景/道具统一命名；场景=环境画面，道具=实物画面） */
  imagePrompt?: string;
  /** 场景时间（morning/noon/night；v6 起场景条目结构化输出，原文看不出为 null；道具无此字段） */
  timeOfDay?: "morning" | "noon" | "night" | null;
  /** 场景天气（sunny/cloudy/rainy；仅场景条目） */
  weather?: "sunny" | "cloudy" | "rainy" | null;
  /** 外观状态短名：同名资产本章发生重大外观变化时才有 */
  stateLabel?: string;
  /** 外观变化说明：发生了什么、相对上一状态变了哪里 */
  stateNote?: string;
}

export interface ReferenceExtractCharacter {
  name: string;
  /** 身份定位（v5 起不再生成——参考小说只处理成脚本，不判断男主女主；仅为已持久化的旧结果保留） */
  role?: string;
  /** 性别（v5 起结构化输出；unknown=原文看不出） */
  gender?: "male" | "female" | "other" | "unknown";
  /** 年龄段（child=少年/儿童、youth=青年、middle=中年、elder=老年；null=原文推不出） */
  ageGroup?: "child" | "youth" | "middle" | "elder" | null;
  /** 体型短词（v2 起不再生成：体型并入 appearance；仅为已持久化的旧结果保留） */
  physique?: string;
  /** 一句话概述（角色以 appearance 为主，description 仅兜底） */
  description?: string;
  /** 外貌体型一句话（v2 起含体型：发型发色、五官、穿着、标志性特征；性别/年龄段走结构化字段不在此重复） */
  appearance?: string;
  /** 性格一句话（v2 起不再生成，仅为旧结果保留；视频创作只关注画面/音色提示词） */
  personality?: string;
  /** 角色画面提示词（生图用） */
  imagePrompt?: string;
  /** 音色提示词（配音用） */
  voicePrompt?: string;
  /** 以下为 v3 时期外观状态机字段：提取环节已不再生成，仅为已持久化的旧提取结果保留 */
  stateLabel?: string;
  stateNote?: string;
}

export interface ReferenceExtractionPayload {
  characters: ReferenceExtractCharacter[];
  scenes: ReferenceExtractItem[];
  props: ReferenceExtractItem[];
  worldview: Array<{ name: string; description: string }>;
}
