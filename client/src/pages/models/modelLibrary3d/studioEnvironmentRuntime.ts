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
  type StudioEnvironmentPresetId,
} from "./studioEnvironmentPresets";
import { upgradeStudioEnvironment } from "./studioLighting";

export type StudioEnvironmentRuntimeOptions = Pick<
  StudioBackdropOptions,
  "diameterMeters" | "projectionCenterHeightMeters" | "panoramaHorizonV"
>;

export interface StudioEnvironmentHandle {
  readonly presetId: StudioEnvironmentPresetId;
  readonly diameterMeters: number;
  readonly radiusMeters: number;
  readonly hasVisibleBackdrop: boolean;
  destroy: () => void;
}

/**
 * 在同一处装配模型预览的可见 HDRI 穹顶和环境光 atlas，保证编辑器、模型
 * 卡片与动画卡片使用同一套环境来源。调用方应在新句柄完成后再释放旧句柄，
 * 这样切换过程中不会出现空背景。
 */
export async function loadStudioEnvironment(
  app: pc.AppBase,
  presetId: StudioEnvironmentPresetId = DEFAULT_STUDIO_ENVIRONMENT_PRESET_ID,
  options: StudioEnvironmentRuntimeOptions = {},
): Promise<StudioEnvironmentHandle> {
  const preset = getStudioEnvironmentPreset(presetId);
  const diameterMeters = getStudioEnvironmentDiameterMeters(
    options.diameterMeters ?? preset.diameterMeters,
  );
  const [lightingCleanup, backdrop] = await Promise.all([
    upgradeStudioEnvironment(app, preset.id),
    attachStudioBackdrop(app, { presetId: preset.id, ...options, diameterMeters }),
  ]);
  let destroyed = false;
  return {
    presetId: preset.id,
    diameterMeters,
    radiusMeters: getStudioEnvironmentRadiusMeters(diameterMeters),
    hasVisibleBackdrop: Boolean(backdrop),
    destroy() {
      if (destroyed) return;
      destroyed = true;
      backdrop?.destroy();
      lightingCleanup();
    },
  };
}
