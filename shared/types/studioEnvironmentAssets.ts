/**
 * 通用环境资产（HDRI 全景环境）的状态契约。
 *
 * 通用资产页的三套 HDRI 环境复用漫剧场景资产的"状态 + 提示词 + 生成图片"逻辑：
 * 每个环境拥有若干状态，状态可生成 2:1 等距柱状全景图。三套环境按应用方向区分
 * （室内用室内客厅、城市户外用中央广场、纯自然户外用草地自然），由使用场景选择
 * 环境，环境内部不存在"当前全景"切换；生效状态恒为默认状态（缺失时第一个状态），
 * 其生成全景作为该方向的 HDR 环境源，未生成时回落到静态 .hdr 预设。
 */
import type { StoryAssetState } from "./novelReferenceExtraction";

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

/**
 * 环境状态就是场景资产状态（StoryAssetState）：编辑器、归一化、提示词与生成
 * 契约全部复用同一套；服务端只保留环境相关的字段白名单（名称/描述/图片提示词/
 * 参考状态/时代风格/时间/天气/生成图），角色专属字段（音色/身高/穿着等）不入库。
 */
export type StudioEnvironmentAssetState = StoryAssetState;

export interface StudioEnvironmentAsset {
  id: StudioEnvironmentId;
  label: string;
  description?: string;
  states: StudioEnvironmentAssetState[];
}

export interface StudioEnvironmentAssetDocument {
  environments: Partial<Record<StudioEnvironmentId, StudioEnvironmentAsset>>;
}

export const STUDIO_ENVIRONMENT_ASSET_SETTING_KEY = "studio.environmentAssets";

export function isStudioEnvironmentId(value: unknown): value is StudioEnvironmentId {
  return typeof value === "string" && (STUDIO_ENVIRONMENT_IDS as readonly string[]).includes(value);
}

/** 生效状态解析：默认状态优先，缺失时回落第一个状态；环境之间按应用方向选择，没有"当前"切换。 */
export function resolveEffectiveStudioEnvironmentState(asset: StudioEnvironmentAsset): StudioEnvironmentAssetState | null {
  const states = Array.isArray(asset.states) ? asset.states : [];
  if (states.length === 0) return null;
  return states.find((state) => state.label.trim() === "默认") ?? states[0];
}
