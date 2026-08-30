/**
 * 通用环境资产（HDRI 全景环境）的状态契约。
 *
 * 通用资产页的三套 HDRI 环境复用漫剧场景资产的"状态 + 提示词 + 生成图片"逻辑：
 * 每个环境拥有若干状态，状态可生成 2:1 等距柱状全景图，活跃状态的全景图
 * 作为模型库 / 动画库预览使用的 HDR 环境源；未生成时回落到静态 .hdr 预设。
 */
export const STUDIO_ENVIRONMENT_IDS = ["interior", "exterior", "nature"] as const;

export type StudioEnvironmentId = (typeof STUDIO_ENVIRONMENT_IDS)[number];

export const STUDIO_ENVIRONMENT_LABELS: Record<StudioEnvironmentId, string> = {
  interior: "室内客厅",
  exterior: "中央广场",
  nature: "草地自然",
};

export const STUDIO_ENVIRONMENT_DEFAULT_DESCRIPTIONS: Record<StudioEnvironmentId, string> = {
  interior: "现代住宅的客厅与开放走廊，浅色木地板与白墙，自然光从窗户进入。",
  exterior: "欧式老城的中央广场，环形拱廊建筑围绕，白天晴朗。",
  nature: "开阔的草地平原，远处有低矮树林，天空有少量云。",
};

export type StudioEnvironmentAssetImageStatus = "idle" | "generating" | "done" | "error";

export interface StudioEnvironmentAssetStateImage {
  status: StudioEnvironmentAssetImageStatus;
  url?: string;
  generatedAt?: string;
  /** 本次生成尝试的唯一标识，用于终止/失效旧请求。 */
  attemptId?: string;
  error?: string;
}

export interface StudioEnvironmentAssetState {
  id: string;
  label: string;
  description?: string;
  imagePrompt?: string;
  /** 参考状态 id：重新生成时以该状态的已生成图为参考（同环境内）。 */
  referenceStateId?: string;
  /** 状态时代风格（值用画风库名称，与场景状态同一命名空间）；未选时服务端按「现代都市」兜底。 */
  eraStyle?: string;
  timeOfDay?: "morning" | "noon" | "night" | null;
  weather?: "sunny" | "cloudy" | "rainy" | null;
  image?: StudioEnvironmentAssetStateImage;
}

export interface StudioEnvironmentAsset {
  id: StudioEnvironmentId;
  label: string;
  description?: string;
  /** 当前作为 HDR 全景源的状态；缺省为第一个状态。 */
  activeStateId: string;
  states: StudioEnvironmentAssetState[];
}

export interface StudioEnvironmentAssetDocument {
  environments: Partial<Record<StudioEnvironmentId, StudioEnvironmentAsset>>;
}

export const STUDIO_ENVIRONMENT_ASSET_SETTING_KEY = "studio.environmentAssets";

export function isStudioEnvironmentId(value: unknown): value is StudioEnvironmentId {
  return typeof value === "string" && (STUDIO_ENVIRONMENT_IDS as readonly string[]).includes(value);
}

/** 活跃状态缺省解析：activeStateId 失效或缺失时回落第一个状态。 */
export function resolveActiveStudioEnvironmentState(asset: StudioEnvironmentAsset): StudioEnvironmentAssetState | null {
  const states = Array.isArray(asset.states) ? asset.states : [];
  if (states.length === 0) return null;
  return states.find((state) => state.id === asset.activeStateId) ?? states[0];
}
