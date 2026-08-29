/**
 * 模型预览使用的固定 HDRI 环境预设。
 *
 * radiusMeters 表达环境中心到圆形边界的真实水平半径。blocking3d 的基础
 * 穹顶半径是 0.5，交给几何模块前统一换算为直径缩放值，避免 UI 和旧场景
 * 的 domeRadius 语义混淆。
 */
export const STUDIO_ENVIRONMENT_PRESET_IDS = ["interior", "exterior", "nature"] as const;

export type StudioEnvironmentPresetId = typeof STUDIO_ENVIRONMENT_PRESET_IDS[number];

export interface StudioEnvironmentPreset {
  id: StudioEnvironmentPresetId;
  label: string;
  sourceUrl: string;
  radiusMeters: number;
  projectionCenterHeightMeters: number;
  panoramaHorizonV: number;
}

export const DEFAULT_STUDIO_ENVIRONMENT_PRESET_ID: StudioEnvironmentPresetId = "interior";

export const STUDIO_ENVIRONMENT_PRESETS: Readonly<Record<StudioEnvironmentPresetId, StudioEnvironmentPreset>> = {
  interior: {
    id: "interior",
    label: "室内客厅",
    sourceUrl: "/models/env/model-indoor-living-room.hdr",
    radiusMeters: 10,
    projectionCenterHeightMeters: 1.7,
    panoramaHorizonV: 0.5,
  },
  exterior: {
    id: "exterior",
    label: "中央广场",
    sourceUrl: "/models/env/model-outdoor-central-plaza.hdr",
    radiusMeters: 20,
    projectionCenterHeightMeters: 1.7,
    panoramaHorizonV: 0.5,
  },
  nature: {
    id: "nature",
    label: "草地自然",
    sourceUrl: "/models/env/model-nature-grassland.hdr",
    radiusMeters: 50,
    projectionCenterHeightMeters: 1.7,
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

/** 把真实环境半径换算为 blocking3d 基础半径 0.5 的实体缩放值。 */
export function getStudioEnvironmentDomeDiameterMeters(radiusMeters: number): number {
  return normalizeStudioEnvironmentRadiusMeters(radiusMeters) * 2;
}

export function normalizeStudioEnvironmentRadiusMeters(value: number, fallbackRadiusMeters?: number): number {
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) return numeric;
  const fallback = Number(fallbackRadiusMeters);
  return Number.isFinite(fallback) && fallback > 0
    ? fallback
    : STUDIO_ENVIRONMENT_PRESETS[DEFAULT_STUDIO_ENVIRONMENT_PRESET_ID].radiusMeters;
}
