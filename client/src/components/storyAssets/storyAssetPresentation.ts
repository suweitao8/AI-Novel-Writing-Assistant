import type {
  StorySettingsCharacter,
  StorySettingsProp,
  StorySettingsScene,
} from "@/api/story/storySettings";

import type { StoryAssetState } from "@ai-novel/shared/types/novelReferenceExtraction";

export type StoryAssetKind = "character" | "scene" | "prop";

export type StoryAssetPreviewMode = "character-top-left-grid" | "center-square";

export interface StoryAssetPreviewSource {
  url: string;
  alt: string;
  mode: StoryAssetPreviewMode;
}

export type StoryAssetSource = StorySettingsCharacter | StorySettingsScene | StorySettingsProp;

export type StoryAssetInput =
  | { kind: "character"; asset: StorySettingsCharacter }
  | { kind: "scene"; asset: StorySettingsScene }
  | { kind: "prop"; asset: StorySettingsProp };

export interface StoryAssetDetailItem {
  label: string;
  value: string;
}

export interface StoryAssetStatePresentation {
  id: string;
  label: string;
  description: string;
  imagePrompt: string;
  voicePrompt: string;
  ageLabel: string;
  sceneTypeLabel: string;
  timeOfDayLabel: string;
  weatherLabel: string;
  chapterLabel: string;
  imageUrl: string;
  voiceSampleUrl: string;
}

export interface StoryAssetPresentation {
  id: string;
  updatedAt: string;
  kind: StoryAssetKind;
  typeLabel: string;
  name: string;
  summary: string;
  badges: string[];
  details: StoryAssetDetailItem[];
  states: StoryAssetStatePresentation[];
  preview: StoryAssetPreviewSource | null;
  source: StoryAssetSource;
}

const TYPE_LABELS: Record<StoryAssetKind, string> = {
  character: "角色",
  scene: "场景",
  prop: "道具",
};

const GENDER_LABELS: Record<string, string> = {
  male: "男",
  female: "女",
  other: "其他",
  unknown: "未设定",
};

const AGE_LABELS: Record<string, string> = {
  child: "少年/儿童",
  youth: "青年",
  middle: "中年",
  elder: "老年",
};

const SCENE_TYPE_LABELS: Record<string, string> = {
  interior: "室内",
  exterior: "室外",
  nature: "自然",
};

const SCENE_TIME_LABELS: Record<string, string> = {
  morning: "早上",
  noon: "中午",
  night: "晚上",
};

const SCENE_WEATHER_LABELS: Record<string, string> = {
  sunny: "晴天",
  cloudy: "阴天",
  rainy: "雨天",
};

function clean(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

/** 状态图按内容寻址覆盖存储、URL 固定，展示时带 generatedAt 破缓存，重新生成后才能立刻换图。 */
export function buildStateImageSrc(url: string, generatedAt?: string): string {
  if (!generatedAt) return url;
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}v=${encodeURIComponent(generatedAt)}`;
}

function addDetail(details: StoryAssetDetailItem[], label: string, value: string | null | undefined): void {
  const text = clean(value);
  if (text) {
    details.push({ label, value: text });
  }
}

function labelFor(mapping: Record<string, string>, value: string | null | undefined): string {
  const text = clean(value);
  return text ? (mapping[text] ?? text) : "";
}

function buildStoryAssetPreview(
  kind: StoryAssetKind,
  name: string,
  states: StoryAssetStatePresentation[],
): StoryAssetPreviewSource | null {
  const defaultState = states.find((state) => state.label.trim() === "默认") ?? states[0];
  if (!defaultState?.imageUrl) {
    return null;
  }
  return {
    url: defaultState.imageUrl,
    alt: `${name}默认状态预览`,
    mode: kind === "character" ? "character-top-left-grid" : "center-square",
  };
}

function buildStatePresentation(state: StoryAssetState): StoryAssetStatePresentation {
  return {
    id: state.id,
    label: clean(state.label) || "未命名状态",
    description: clean(state.description),
    imagePrompt: clean(state.imagePrompt),
    voicePrompt: clean(state.voicePrompt),
    ageLabel: labelFor(AGE_LABELS, state.ageGroup),
    sceneTypeLabel: labelFor(SCENE_TYPE_LABELS, state.sceneType),
    timeOfDayLabel: labelFor(SCENE_TIME_LABELS, state.timeOfDay),
    weatherLabel: labelFor(SCENE_WEATHER_LABELS, state.weather),
    chapterLabel: state.chapterOrder ? `第 ${state.chapterOrder} 章` : "",
    imageUrl: state.image?.url ? buildStateImageSrc(state.image.url, state.image.generatedAt ?? undefined) : "",
    voiceSampleUrl: clean(state.voice?.sampleAudioUrl),
  };
}

function buildCharacterPresentation(asset: StorySettingsCharacter): Omit<StoryAssetPresentation, "source"> {
  const details: StoryAssetDetailItem[] = [];
  const initialState = asset.states[0];
  const states = asset.states.map(buildStatePresentation);
  const badges = [
    labelFor(GENDER_LABELS, asset.gender),
    labelFor(AGE_LABELS, initialState?.ageGroup ?? asset.ageGroup),
  ].filter(Boolean);

  addDetail(details, "性别", labelFor(GENDER_LABELS, asset.gender));
  addDetail(details, "剧情定位", asset.role);
  addDetail(details, "体型", asset.physique);
  addDetail(details, "服装风格", asset.attireStyle);
  addDetail(details, "性格", asset.personality);
  addDetail(details, "外貌", asset.appearance);
  addDetail(details, "面部提示词", asset.facePrompt);
  addDetail(details, "音色", asset.voiceTexture);
  addDetail(details, "背景", asset.background);

  return {
    id: asset.id,
    updatedAt: asset.updatedAt,
    kind: "character",
    typeLabel: TYPE_LABELS.character,
    name: asset.name,
    summary: clean(initialState?.description) || clean(asset.personality) || "暂无补充信息",
    badges,
    details,
    states,
    preview: buildStoryAssetPreview("character", asset.name, states),
  };
}

function buildScenePresentation(asset: StorySettingsScene): Omit<StoryAssetPresentation, "source"> {
  const details: StoryAssetDetailItem[] = [];
  const sceneStates = asset.states.map((state, index) => index === 0
    ? {
      ...state,
      sceneType: state.sceneType ?? (asset.sceneType === "interior" || asset.sceneType === "exterior" || asset.sceneType === "nature" ? asset.sceneType : null),
      timeOfDay: state.timeOfDay ?? (asset.timeOfDay === "morning" || asset.timeOfDay === "noon" || asset.timeOfDay === "night" ? asset.timeOfDay : null),
      weather: state.weather ?? (asset.weather === "sunny" || asset.weather === "cloudy" || asset.weather === "rainy" ? asset.weather : null),
    }
    : state);
  const initialState = sceneStates[0];
  const states = sceneStates.map(buildStatePresentation);
  const badges = [
    labelFor(SCENE_TYPE_LABELS, initialState?.sceneType),
    labelFor(SCENE_TIME_LABELS, initialState?.timeOfDay),
    labelFor(SCENE_WEATHER_LABELS, initialState?.weather),
  ].filter(Boolean);

  return {
    id: asset.id,
    updatedAt: asset.updatedAt,
    kind: "scene",
    typeLabel: TYPE_LABELS.scene,
    name: asset.name,
    summary: clean(initialState?.description) || clean(asset.summary) || clean(initialState?.imagePrompt) || clean(asset.environmentPrompt) || "暂无补充信息",
    badges,
    details,
    states,
    preview: buildStoryAssetPreview("scene", asset.name, states),
  };
}

function buildPropPresentation(asset: StorySettingsProp): Omit<StoryAssetPresentation, "source"> {
  const details: StoryAssetDetailItem[] = [];
  const initialState = asset.states[0];
  const states = asset.states.map(buildStatePresentation);
  const badges = [clean(asset.propType), clean(asset.importance)].filter(Boolean);

  addDetail(details, "道具类型", asset.propType);
  addDetail(details, "重要度", asset.importance);
  addDetail(details, "持有角色", asset.ownerCharacterName);
  addDetail(details, "道具说明", asset.description);
  addDetail(details, "剧情作用", asset.plotFunction);
  addDetail(details, "首次出现", asset.firstAppearHint);
  const visualPrompt = initialState?.imagePrompt || asset.visualPrompt;
  return {
    id: asset.id,
    updatedAt: asset.updatedAt,
    kind: "prop",
    typeLabel: TYPE_LABELS.prop,
    name: asset.name,
    summary: clean(initialState?.description) || clean(visualPrompt) || clean(asset.description) || "暂无补充信息",
    badges,
    details,
    states,
    preview: buildStoryAssetPreview("prop", asset.name, states),
  };
}

export function buildStoryAssetPresentation(input: StoryAssetInput): StoryAssetPresentation {
  const view = input.kind === "character"
    ? buildCharacterPresentation(input.asset)
    : input.kind === "scene"
      ? buildScenePresentation(input.asset)
      : buildPropPresentation(input.asset);

  return { ...view, source: input.asset };
}
