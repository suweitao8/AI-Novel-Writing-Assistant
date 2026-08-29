import * as pc from "playcanvas";

import {
  attachStudioBackdrop,
  type StudioBackdropOptions,
} from "./studioBackdrop";
import {
  DEFAULT_STUDIO_ENVIRONMENT_PRESET_ID,
  getStudioEnvironmentDiameterMeters,
  getStudioEnvironmentRadiusMeters,
  getStudioEnvironmentPreset,
  normalizeStudioEnvironmentRadiusMeters,
  type StudioEnvironmentPresetId,
} from "./studioEnvironmentPresets";
import { upgradeStudioEnvironment } from "./studioLighting";

export type StudioEnvironmentRuntimeOptions = Pick<
  StudioBackdropOptions,
  "diameterMeters" | "radiusMeters" | "projectionCenterHeightMeters" | "panoramaHorizonV"
>;

export interface StudioEnvironmentHandle {
  readonly presetId: StudioEnvironmentPresetId;
  /** 用户可见的半球直径；内部固定半径调用会按真实半径换算。 */
  readonly diameterMeters: number;
  /** 供相机边界和旧版内部调用方使用的真实水平半径。 */
  readonly radiusMeters: number;
  readonly hasVisibleBackdrop: boolean;
  destroy: () => void;
}

/**
 * 在同一处装配模型预览的可见 HDRI 穹顶和环境光 atlas，保证编辑器、模型
 * 卡片、动画卡片和独立 HDRI 预览使用同一套环境来源。调用方应在新句柄完成
 * 后再释放旧句柄，这样切换过程中不会出现空背景。
 *
 * `diameterMeters` 是用户可调的 5–30 米范围；`radiusMeters` 仅保留给动画
 * 缩略图等需要特殊内部取景距离的调用方。
 */
export async function loadStudioEnvironment(
  app: pc.AppBase,
  presetId: StudioEnvironmentPresetId = DEFAULT_STUDIO_ENVIRONMENT_PRESET_ID,
  options: StudioEnvironmentRuntimeOptions = {},
): Promise<StudioEnvironmentHandle> {
  const preset = getStudioEnvironmentPreset(presetId);
  const hasDiameterOverride = typeof options.diameterMeters === "number";
  const diameterMeters = hasDiameterOverride
    ? getStudioEnvironmentDiameterMeters(options.diameterMeters!)
    : typeof options.radiusMeters === "number"
      ? normalizeStudioEnvironmentRadiusMeters(options.radiusMeters) * 2
      : getStudioEnvironmentDiameterMeters(preset.diameterMeters);
  const radiusMeters = hasDiameterOverride
    ? getStudioEnvironmentRadiusMeters(diameterMeters)
    : typeof options.radiusMeters === "number"
      ? normalizeStudioEnvironmentRadiusMeters(options.radiusMeters)
      : getStudioEnvironmentRadiusMeters(diameterMeters);
  const backdropOptions: StudioBackdropOptions = hasDiameterOverride
    ? { presetId: preset.id, ...options, diameterMeters }
    : { presetId: preset.id, ...options, radiusMeters };
  const [lightingCleanup, backdrop] = await Promise.all([
    upgradeStudioEnvironment(app, preset.id),
    attachStudioBackdrop(app, backdropOptions),
  ]);
  let destroyed = false;
  return {
    presetId: preset.id,
    diameterMeters,
    radiusMeters,
    hasVisibleBackdrop: Boolean(backdrop),
    destroy() {
      if (destroyed) return;
      destroyed = true;
      backdrop?.destroy();
      lightingCleanup();
    },
  };
}
