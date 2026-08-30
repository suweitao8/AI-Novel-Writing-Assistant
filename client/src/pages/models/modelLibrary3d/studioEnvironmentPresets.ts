/**
 * 模型/动画预览使用的固定 HDRI 环境预设：统一使用中央广场（2026-08-30 用户决定）。
 *
 * diameterMeters 是用户可调的半球直径，界面和预览运行时统一使用 5–30 米。
 * blocking3d 的基础穹顶半径是 0.5，因此交给几何模块时可直接使用这个直径
 * 作为实体缩放值；只有相机边界等内部计算需要换算成真实半径。
 *
 * 环境 id 与显示名与通用环境资产契约共享（@ai-novel/shared）：
 * 通用资产页为该环境维护可生成的状态，运行时优先使用默认状态的全景图，
 * 未生成时回落这里的静态 .hdr 资源。
 */
import {
  STUDIO_ENVIRONMENT_IDS,
  STUDIO_ENVIRONMENT_LABELS,
  type StudioEnvironmentId,
} from "@ai-novel/shared/types/studioEnvironmentAssets";

export const STUDIO_ENVIRONMENT_PRESET_IDS = STUDIO_ENVIRONMENT_IDS;

export type StudioEnvironmentPresetId = StudioEnvironmentId;

/** 模型/动画预览的本机直径范围，与漫剧场景的真实圆半径合同分离。 */
export const STUDIO_ENVIRONMENT_DIAMETER_LIMITS = { min: 5, max: 30 } as const;

export interface StudioEnvironmentPreset {
  id: StudioEnvironmentPresetId;
  label: string;
  sourceUrl: string;
  /** 浏览器可直接显示的平面全景预览，不替代运行时使用的 HDR 资源。 */
  previewImageUrl: string;
  diameterMeters: number;
  projectionCenterHeightMeters: number;
  panoramaHorizonV: number;
}

export const DEFAULT_STUDIO_ENVIRONMENT_PRESET_ID: StudioEnvironmentPresetId = "exterior";

export const STUDIO_ENVIRONMENT_PRESETS: Readonly<Record<StudioEnvironmentPresetId, StudioEnvironmentPreset>> = {
  exterior: {
    id: "exterior",
    label: STUDIO_ENVIRONMENT_LABELS.exterior,
    sourceUrl: "/models/env/model-outdoor-central-plaza.hdr",
    previewImageUrl: "/models/env/model-outdoor-central-plaza-preview.png",
    diameterMeters: 15,
    projectionCenterHeightMeters: 2,
    panoramaHorizonV: 0.5,
  },
};

export function getStudioEnvironmentPreset(
  id: StudioEnvironmentPresetId | string | null | undefined,
): StudioEnvironmentPreset {
  return (id && id in STUDIO_ENVIRONMENT_PRESETS
    ? STUDIO_ENVIRONMENT_PRESETS[id as StudioEnvironmentPresetId]
    : STUDIO_ENVIRONMENT_PRESETS[DEFAULT_STUDIO_ENVIRONMENT_PRESET_ID]);
}

export function getStudioEnvironmentDiameterMeters(value: number): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return STUDIO_ENVIRONMENT_PRESETS[DEFAULT_STUDIO_ENVIRONMENT_PRESET_ID].diameterMeters;
  }
  return Math.min(
    STUDIO_ENVIRONMENT_DIAMETER_LIMITS.max,
    Math.max(STUDIO_ENVIRONMENT_DIAMETER_LIMITS.min, numeric),
  );
}

/** 把用户可见的半球直径换算成内部相机和边界计算使用的真实半径。 */
export function getStudioEnvironmentRadiusMeters(diameterMeters: number): number {
  return getStudioEnvironmentDiameterMeters(diameterMeters) / 2;
}

const STUDIO_ENVIRONMENT_DIAMETER_STORAGE_KEY = "model-preview:environment-diameters:v2";

type StudioEnvironmentDiameterPreferences = Record<StudioEnvironmentPresetId, number>;

function createDefaultStudioEnvironmentDiameters(): StudioEnvironmentDiameterPreferences {
  return Object.fromEntries(
    STUDIO_ENVIRONMENT_PRESET_IDS.map((id) => [id, getStudioEnvironmentPreset(id).diameterMeters]),
  ) as StudioEnvironmentDiameterPreferences;
}

/** 预览器和设置页共享每套 HDRI 的本机直径偏好，不改变资产或项目数据。 */
export function getStudioEnvironmentDiameterPreferences(): StudioEnvironmentDiameterPreferences {
  const defaults = createDefaultStudioEnvironmentDiameters();
  if (typeof window === "undefined") return defaults;
  try {
    const stored = JSON.parse(
      window.localStorage.getItem(STUDIO_ENVIRONMENT_DIAMETER_STORAGE_KEY) ?? "null",
    ) as Record<string, unknown> | null;
    if (!stored || typeof stored !== "object" || Array.isArray(stored)) return defaults;
    for (const id of STUDIO_ENVIRONMENT_PRESET_IDS) {
      const value = stored[id];
      if (typeof value === "number" && Number.isFinite(value)) {
        defaults[id] = getStudioEnvironmentDiameterMeters(value);
      }
    }
  } catch {
    // 浏览器禁用 localStorage 或旧值损坏时使用预设默认值。
  }
  return defaults;
}

export function getStudioEnvironmentDiameterPreference(id: StudioEnvironmentPresetId): number {
  return getStudioEnvironmentDiameterPreferences()[id];
}

export function saveStudioEnvironmentDiameterPreference(
  id: StudioEnvironmentPresetId,
  value: number,
): number {
  const diameterMeters = getStudioEnvironmentDiameterMeters(value);
  if (typeof window === "undefined") return diameterMeters;
  const preferences = getStudioEnvironmentDiameterPreferences();
  preferences[id] = diameterMeters;
  try {
    window.localStorage.setItem(STUDIO_ENVIRONMENT_DIAMETER_STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    // 偏好保存失败不应阻断当前预览。
  }
  return diameterMeters;
}
