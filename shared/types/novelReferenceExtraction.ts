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

/** 场景状态的结构化环境字段；它们随场景状态变化，不再绑定在场景资产顶层。 */
export type StoryAssetSceneType = "interior" | "exterior" | "nature";
export type StoryAssetTimeOfDay = "morning" | "noon" | "night";
export type StoryAssetWeather = "sunny" | "cloudy" | "rainy";

const STORY_ASSET_AGE_GROUPS = new Set<StoryAssetAgeGroup>(["child", "youth", "middle", "elder"]);
const STORY_ASSET_SCENE_TYPES = new Set<StoryAssetSceneType>(["interior", "exterior", "nature"]);
const STORY_ASSET_TIMES_OF_DAY = new Set<StoryAssetTimeOfDay>(["morning", "noon", "night"]);
const STORY_ASSET_WEATHERS = new Set<StoryAssetWeather>(["sunny", "cloudy", "rainy"]);
const STORY_ASSET_AGE_LABELS: Record<StoryAssetAgeGroup, string> = {
  child: "少年/儿童",
  youth: "青年",
  middle: "中年",
  elder: "老年",
};

/** 角色状态归并时读取的旧角色字段；旧列保留，但不再作为新的编辑入口。 */
export interface StoryCharacterLegacyFields {
  name?: string | null;
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
  /** 场景状态的空间类型；角色/道具状态不使用。 */
  sceneType?: StoryAssetSceneType | null;
  /** 场景状态的时间；角色/道具状态不使用。 */
  timeOfDay?: StoryAssetTimeOfDay | null;
  /** 场景状态的天气；角色/道具状态不使用。 */
  weather?: StoryAssetWeather | null;
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
 * 状态写入载荷：提示词可由服务端按状态变化补齐，归一化后的 StoryAssetState
 * 才保证 description/imagePrompt 一定是可直接消费的字符串。
 */
export type StoryAssetStateInput = Omit<StoryAssetState, "description" | "imagePrompt"> & {
  description?: string | null;
  imagePrompt?: string | null;
};

/** 创建资产初始状态时可从旧字段或提取结果带入的默认值。 */
export interface StoryAssetStateDefaults {
  id?: string;
  label?: string;
  description?: string | null;
  imagePrompt?: string | null;
  ageGroup?: StoryAssetAgeGroup | null;
  sceneType?: StoryAssetSceneType | null;
  timeOfDay?: StoryAssetTimeOfDay | null;
  weather?: StoryAssetWeather | null;
  voicePrompt?: string | null;
  chapterOrder?: number;
}

/** 所有角色、场景、道具都必须至少有一个可供后续生成使用的初始状态。 */
export function createStoryAssetInitialState(
  input: StoryAssetStateDefaults = {},
): StoryAssetState {
  const description = input.description?.trim() || "资产初始状态";
  const imagePrompt = input.imagePrompt?.trim() || description;
  return {
    id: input.id?.trim() || "initial",
    label: input.label?.trim() || "初始状态",
    description,
    imagePrompt,
    ...(input.ageGroup ? { ageGroup: input.ageGroup } : {}),
    ...(input.sceneType !== undefined && input.sceneType !== null ? { sceneType: input.sceneType } : {}),
    ...(input.timeOfDay !== undefined && input.timeOfDay !== null ? { timeOfDay: input.timeOfDay } : {}),
    ...(input.weather !== undefined && input.weather !== null ? { weather: input.weather } : {}),
    ...(input.voicePrompt?.trim() ? { voicePrompt: input.voicePrompt.trim() } : {}),
    ...(input.chapterOrder !== undefined ? { chapterOrder: input.chapterOrder } : {}),
    referenceStateId: null,
  };
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
    return state.referenceStateId && states.some((item) => item.id === state.referenceStateId)
      ? state.referenceStateId
      : null;
  }
  const index = states.findIndex((item) => item.id === state.id);
  return index > 0 ? states[index - 1]?.id ?? null : null;
}

/** 读写 statesJson 前统一补齐旧数据的默认参考值，不改变显式取消参考。 */
export function normalizeStoryAssetStates(
  states: StoryAssetStateInput[] | null | undefined,
  initialState: StoryAssetStateDefaults = {},
): StoryAssetState[] {
  const source = (states ?? []).filter(isStoryAssetStateRecord);
  const fallbackDescription = initialState.description?.trim() || "资产初始状态";
  const fallbackImagePrompt = initialState.imagePrompt?.trim() || fallbackDescription;
  const working = source.length > 0
    ? source.map((state, index) => {
      const description = typeof state.description === "string" && state.description.trim()
        ? state.description.trim()
        : (index === 0 ? fallbackDescription : "状态变化");
      return {
        ...state,
        id: state.id.trim(),
        label: state.label.trim(),
        description,
        imagePrompt: typeof state.imagePrompt === "string" && state.imagePrompt.trim()
          ? state.imagePrompt.trim()
          : (index === 0 ? fallbackImagePrompt : description),
        ...(index === 0 && state.sceneType === undefined && initialState.sceneType !== undefined
          ? { sceneType: initialState.sceneType }
          : {}),
        ...(index === 0 && state.timeOfDay === undefined && initialState.timeOfDay !== undefined
          ? { timeOfDay: initialState.timeOfDay }
          : {}),
        ...(index === 0 && state.weather === undefined && initialState.weather !== undefined
          ? { weather: initialState.weather }
          : {}),
      };
    })
    : [createStoryAssetInitialState(initialState)];
  return working.map((state, index) => ({
    ...state,
    referenceStateId: index === 0 ? null : resolveStoryAssetStateReferenceId(working, state),
  }));
}

const STORY_ASSET_IMAGE_STATUSES = new Set<StoryAssetStateImage["status"]>([
  "idle",
  "generating",
  "done",
  "error",
]);
const STORY_ASSET_VOICE_MODES = new Set<StoryAssetStateVoiceMode>([
  "reuse_previous",
  "generate_new",
]);

function isNullableString(value: unknown): value is string | null | undefined {
  return value === undefined || value === null || typeof value === "string";
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isStoryAssetStateImageRecord(value: unknown): boolean {
  if (!isPlainRecord(value)) {
    return false;
  }
  return typeof value.status === "string"
    && STORY_ASSET_IMAGE_STATUSES.has(value.status as StoryAssetStateImage["status"])
    && isNullableString(value.url)
    && isNullableString(value.prompt)
    && isNullableString(value.provider)
    && isNullableString(value.generatedAt)
    && isNullableString(value.error);
}

function isStoryAssetStateVoiceRecord(value: unknown): boolean {
  if (!isPlainRecord(value)) {
    return false;
  }
  return typeof value.status === "string"
    && STORY_ASSET_IMAGE_STATUSES.has(value.status as StoryAssetStateVoice["status"])
    && typeof value.mode === "string"
    && STORY_ASSET_VOICE_MODES.has(value.mode as StoryAssetStateVoiceMode)
    && isNullableString(value.sourceStateId)
    && isNullableString(value.sampleAudioUrl)
    && isNullableString(value.prompt)
    && isNullableString(value.generatedAt)
    && isNullableString(value.error);
}

function isStoryAssetStateRecord(value: unknown): value is StoryAssetStateInput {
  if (!value || typeof value !== "object") {
    return false;
  }
  const state = value as Record<string, unknown>;
  if (typeof state.id !== "string" || !state.id.trim()
    || typeof state.label !== "string" || !state.label.trim()) {
    return false;
  }
  if (!isNullableString(state.description)
    || !isNullableString(state.imagePrompt)
    || !isNullableString(state.voicePrompt)) {
    return false;
  }
  if (state.ageGroup !== undefined && state.ageGroup !== null
    && (typeof state.ageGroup !== "string"
      || !STORY_ASSET_AGE_GROUPS.has(state.ageGroup as StoryAssetAgeGroup))) {
    return false;
  }
  if (state.sceneType !== undefined && state.sceneType !== null
    && (typeof state.sceneType !== "string"
      || !STORY_ASSET_SCENE_TYPES.has(state.sceneType as StoryAssetSceneType))) {
    return false;
  }
  if (state.timeOfDay !== undefined && state.timeOfDay !== null
    && (typeof state.timeOfDay !== "string"
      || !STORY_ASSET_TIMES_OF_DAY.has(state.timeOfDay as StoryAssetTimeOfDay))) {
    return false;
  }
  if (state.weather !== undefined && state.weather !== null
    && (typeof state.weather !== "string"
      || !STORY_ASSET_WEATHERS.has(state.weather as StoryAssetWeather))) {
    return false;
  }
  if (state.chapterOrder !== undefined && state.chapterOrder !== null
    && (typeof state.chapterOrder !== "number" || !Number.isInteger(state.chapterOrder))) {
    return false;
  }
  if (state.referenceStateId !== undefined && state.referenceStateId !== null
    && typeof state.referenceStateId !== "string") {
    return false;
  }
  if (state.image !== undefined && !isStoryAssetStateImageRecord(state.image)) {
    return false;
  }
  if (state.voice !== undefined && !isStoryAssetStateVoiceRecord(state.voice)) {
    return false;
  }
  return true;
}

export interface StoryAssetStatesJsonParseResult {
  states: StoryAssetState[];
  /** 只有 JSON 结构完整且每个状态都有稳定身份时才允许自动回写。 */
  canSafelyRewrite: boolean;
}

/**
 * 校验状态身份与参考关系。状态列表是一个小型有向链，重复 ID 或悬空引用会让
 * 图片/音色继承在不同入口得到不同结果，因此服务端写入前必须拒绝它们。
 */
export function validateStoryAssetStateList(
  states: Array<Pick<StoryAssetStateInput, "id" | "referenceStateId">>,
): string | null {
  const ids = new Set<string>();
  for (const state of states) {
    const id = typeof state.id === "string" ? state.id.trim() : "";
    if (!id) {
      return "状态 ID 不能为空。";
    }
    if (ids.has(id)) {
      return "状态 ID 不能重复。";
    }
    ids.add(id);
  }
  for (const state of states) {
    const referenceStateId = typeof state.referenceStateId === "string"
      ? state.referenceStateId.trim()
      : state.referenceStateId;
    if (referenceStateId && !ids.has(referenceStateId)) {
      return "状态引用的目标不存在。";
    }
  }
  const initialReferenceStateId = states[0]?.referenceStateId;
  if (typeof initialReferenceStateId === "string" && initialReferenceStateId.trim()) {
    return "初始状态不能引用其他状态。";
  }
  return null;
}

/**
 * 解析持久化状态并给出回写安全标记。
 *
 * 解析失败时仍返回可供当前请求展示的有效状态，但禁止调用方用归一化结果覆盖原始值，
 * 避免损坏或手工扩展的 statesJson 在读时迁移中丢失。
 */
export function parseStoryAssetStatesJson(raw: string | null | undefined): StoryAssetStatesJsonParseResult {
  if (!raw?.trim()) {
    return { states: [], canSafelyRewrite: true };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { states: [], canSafelyRewrite: false };
  }
  if (!Array.isArray(parsed)) {
    return { states: [], canSafelyRewrite: false };
  }
  const validStates = parsed.filter(isStoryAssetStateRecord);
  const seenIds = new Set<string>();
  const uniqueStates = validStates.filter((item) => {
    const normalizedId = item.id.trim();
    if (seenIds.has(normalizedId)) {
      return false;
    }
    seenIds.add(normalizedId);
    return true;
  });
  const canSafelyRewrite = validStates.length === parsed.length
    && uniqueStates.length === parsed.length
    && validateStoryAssetStateList(validStates) === null;
  const states = normalizeStoryAssetStates(
    uniqueStates,
  );
  return { states, canSafelyRewrite };
}

/** 返回当前状态沿 referenceStateId/默认上一状态向前的所有祖先，带循环保护。 */
export function resolveStoryAssetStateAncestors(
  states: StoryAssetState[],
  stateId: string,
): StoryAssetState[] {
  const current = states.find((state) => state.id === stateId);
  if (!current) {
    return [];
  }
  const ancestors: StoryAssetState[] = [];
  const visited = new Set<string>([stateId]);
  let cursor: StoryAssetState | undefined = current;
  while (cursor) {
    const parentId = resolveStoryAssetStateReferenceId(states, cursor);
    if (!parentId || visited.has(parentId)) {
      break;
    }
    const parent = states.find((state) => state.id === parentId);
    if (!parent) {
      break;
    }
    ancestors.push(parent);
    visited.add(parent.id);
    cursor = parent;
  }
  return ancestors;
}

/** 资产更新必须保留首个状态；旧数据的首状态 id 也不能被客户端替换或移动。 */
export function isStoryAssetInitialStatePreserved(
  previousStates: StoryAssetState[],
  nextStates: StoryAssetState[],
): boolean {
  const initialStateId = previousStates[0]?.id;
  return !initialStateId || nextStates[0]?.id === initialStateId;
}

/** 兼容旧调用方；角色、场景、道具都遵循同一条初始状态不变规则。 */
export const isCharacterInitialStatePreserved = isStoryAssetInitialStatePreserved;

function normalizeStoryAssetAgeGroup(value: unknown): StoryAssetAgeGroup | null {
  return typeof value === "string" && STORY_ASSET_AGE_GROUPS.has(value as StoryAssetAgeGroup)
    ? value as StoryAssetAgeGroup
    : null;
}

function compactText(...values: Array<string | null | undefined>): string {
  return values.map((value) => value?.trim()).filter(Boolean).join("，");
}

/**
 * 角色初始状态音色描述的通用占位尾缀（如「男性，青年，自然清晰的说话声音」）。
 * 它只是表单预填的兜底文案：合成音色时服务端把它视为「未真正描述」，
 * 改用 AI 按角色形象估算更贴合的音色（StoryAssetStateVoiceService）。
 */
export const GENERIC_CHARACTER_VOICE_PROMPT_TAIL = "自然清晰的说话声音";

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

/**
 * 为角色创建可直接编辑和生成资产的默认首状态。
 *
 * 角色创建不能依赖客户端是否传入 states：姓名、性别和已有兼容字段足以
 * 组成一份稳定的初始状态；AI 草稿提供的更具体字段会在传入时覆盖这些默认值。
 */
export function createStoryCharacterInitialState(
  input: StoryCharacterLegacyFields = {},
): StoryAssetState {
  const ageGroup = normalizeStoryAssetAgeGroup(input.ageGroup) ?? "youth";
  const ageLabel = STORY_ASSET_AGE_LABELS[ageGroup];
  const identity = compactText(input.name, genderLabel(input.gender), ageLabel);
  const existingAppearance = compactText(
    input.appearance,
    [input.physique, input.attireStyle].filter((value) => value?.trim()).join("，"),
  );
  const description = existingAppearance || (identity ? `${identity}的常态外观` : "角色初始外观");
  const imagePrompt = compactText(input.facePrompt, identity, description) || description;
  const voicePrompt = input.voiceTexture?.trim()
    || compactText(genderLabel(input.gender), ageLabel, GENERIC_CHARACTER_VOICE_PROMPT_TAIL)
    || GENERIC_CHARACTER_VOICE_PROMPT_TAIL;
  return createStoryAssetInitialState({
    id: "initial",
    label: "初始状态",
    description,
    imagePrompt,
    ageGroup,
    voicePrompt,
  });
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
  states: StoryAssetStateInput[] | null | undefined,
  legacy: StoryCharacterLegacyFields = {},
): StoryAssetState[] {
  const source = (states ?? []).filter(isStoryAssetStateRecord);
  const defaultInitialState = createStoryCharacterInitialState(legacy);
  const initialAge = defaultInitialState.ageGroup ?? "youth";
  const initialDescription = defaultInitialState.description;
  const initialImagePrompt = defaultInitialState.imagePrompt;
  const initialVoicePrompt = defaultInitialState.voicePrompt ?? GENERIC_CHARACTER_VOICE_PROMPT_TAIL;
  const working = source.length > 0
    ? source
    : [defaultInitialState];

  let previousAge = initialAge;
  const normalized = working.map((state, index) => {
    const ageGroup = normalizeStoryAssetAgeGroup(state.ageGroup) ?? (index === 0 ? initialAge : previousAge);
    previousAge = ageGroup;
    const description = state.description?.trim()
      || (index === 0 ? initialDescription : working[index - 1]?.description?.trim() || initialDescription);
    const imagePrompt = state.imagePrompt?.trim()
      || stateImagePrompt({ description, ageGroup }, legacy);
    const normalizedState = {
      ...state,
      label: state.label.trim(),
      description,
      imagePrompt,
      ageGroup,
    };
    if (!normalizedState.voicePrompt?.trim() && !normalizedState.voice?.prompt?.trim() && index === 0) {
      normalizedState.voicePrompt = initialVoicePrompt;
    }
    return normalizedState;
  });
  return normalizeStoryAssetStates(normalized).map((state, index) => (
    index === 0 ? { ...state, referenceStateId: null } : state
  ));
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
