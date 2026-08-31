import * as pc from "playcanvas";

import {
  createBlocking3dEnvironmentRuntime,
  type Blocking3dLightingProfile,
  normalizeEnvironmentSettings,
  type Blocking3dEnvironmentRuntime,
  type Blocking3dEnvironmentSettings,
} from "@/pages/drama/comicDrama/components/blocking3d";

import {
  DEFAULT_STUDIO_ENVIRONMENT_PRESET_ID,
  getStudioEnvironmentDiameterMeters,
  getStudioEnvironmentPreset,
  getStudioEnvironmentProjectionCenterHeightRatio,
  getStudioEnvironmentRadiusMeters,
  type StudioEnvironmentPresetId,
} from "./studioEnvironmentPresets";
import { getStudioEnvironmentSourceUrl } from "./studioEnvironmentAssetSource";

/** 可覆盖的用户入口仍然保留；内部会统一转换为漫剧 3D 环境设置。 */
export interface StudioEnvironmentRuntimeOptions {
  diameterMeters?: number;
  projectionCenterHeightRatio?: number;
  /** 兼容旧调用方的绝对高度覆盖；未传时使用预设比例。 */
  projectionCenterHeightMeters?: number;
  panoramaHorizonV?: number;
  /** 离屏缩略图等没有投影者的预览可以关闭阴影接收器。 */
  enableShadowCatcher?: boolean;
  lightingProfile?: Blocking3dLightingProfile;
}

export interface StudioEnvironmentHandle {
  readonly presetId: StudioEnvironmentPresetId;
  readonly sourceUrl: string | null;
  readonly diameterMeters: number;
  readonly radiusMeters: number;
  readonly settings: Blocking3dEnvironmentSettings;
  readonly hasVisibleBackdrop: boolean;
  applySettings: (settings: Blocking3dEnvironmentSettings) => void;
  rebuildEnvironmentBackdropMesh: (settings: Blocking3dEnvironmentSettings) => void;
  destroy: () => void;
}

/** 旧版场景图与内置 HDR 只作为资源不可用时的兼容兜底。 */
const STUDIO_PANORAMA_URL = "/models/env/studio_panorama.png";
const STUDIO_ENVIRONMENT_FALLBACK_URL = "/models/env/studio_small_03_1k.hdr";

function uniqueUrls(urls: readonly string[]): string[] {
  return urls.filter((url, index, all) => Boolean(url) && all.indexOf(url) === index);
}

function createStudioEnvironmentSettings(
  presetId: StudioEnvironmentPresetId,
  options: StudioEnvironmentRuntimeOptions,
): Blocking3dEnvironmentSettings {
  const preset = getStudioEnvironmentPreset(presetId);
  const diameterMeters = getStudioEnvironmentDiameterMeters(
    options.diameterMeters ?? preset.diameterMeters,
  );
  const radiusMeters = getStudioEnvironmentRadiusMeters(diameterMeters);
  const projectionCenterHeightRatio = Number.isFinite(options.projectionCenterHeightRatio)
    ? getStudioEnvironmentProjectionCenterHeightRatio(options.projectionCenterHeightRatio)
    : Number.isFinite(options.projectionCenterHeightMeters)
      ? getStudioEnvironmentProjectionCenterHeightRatio(
        Number(options.projectionCenterHeightMeters) / radiusMeters,
      )
      : getStudioEnvironmentProjectionCenterHeightRatio(preset.projectionCenterHeightRatio);
  return normalizeEnvironmentSettings({
    radiusMeters,
    projectionCenterHeightRatio,
    panoramaHorizonV: options.panoramaHorizonV ?? preset.panoramaHorizonV,
  });
}

function createUnavailableHandle(
  presetId: StudioEnvironmentPresetId,
  settings: Blocking3dEnvironmentSettings,
  environment: Blocking3dEnvironmentRuntime,
  worldEntity: pc.Entity,
): StudioEnvironmentHandle {
  let destroyed = false;
  return {
    presetId,
    sourceUrl: null,
    diameterMeters: settings.radiusMeters * 2,
    radiusMeters: settings.radiusMeters,
    settings,
    hasVisibleBackdrop: false,
    applySettings(nextSettings) {
      if (!destroyed) environment.applySettings(nextSettings);
    },
    rebuildEnvironmentBackdropMesh(nextSettings) {
      if (!destroyed) environment.rebuildEnvironmentBackdropMesh(nextSettings);
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      environment.destroy();
      worldEntity.destroy();
    },
  };
}

/**
 * 模型、动画和离屏缩略图共用的环境适配层。
 *
 * blocking3d runtime 是唯一的背景实现：同一张已加载 HDR 同时生成可见
 * cubemap 与 env atlas，背景/地面固定在 worldEntity 原点，调用方只负责
 * 选择资源和传递统一设置。这样不会再出现“可见穹顶一套、环境光另一套”的
 * 双加载路径。
 */
export async function loadStudioEnvironment(
  app: pc.AppBase,
  presetId: StudioEnvironmentPresetId = DEFAULT_STUDIO_ENVIRONMENT_PRESET_ID,
  options: StudioEnvironmentRuntimeOptions = {},
): Promise<StudioEnvironmentHandle> {
  const preset = getStudioEnvironmentPreset(presetId);
  const settings = createStudioEnvironmentSettings(preset.id, options);
  const worldEntity = new pc.Entity("studio-environment-world");
  app.root.addChild(worldEntity);
  const environment = createBlocking3dEnvironmentRuntime(app, worldEntity, {
    enableShadowCatcher: options.enableShadowCatcher,
    lightingProfile: options.lightingProfile,
  });
  // 通用资产页为环境生成的状态全景图优先；失败/未生成时按静态 HDR 预设兜底。
  const generatedSourceUrl = await getStudioEnvironmentSourceUrl(presetId);
  const urls = uniqueUrls([
    ...(generatedSourceUrl ? [generatedSourceUrl] : []),
    preset.sourceUrl,
    STUDIO_PANORAMA_URL,
    STUDIO_ENVIRONMENT_FALLBACK_URL,
  ]);

  let sourceUrl: string | null = null;
  try {
    for (const url of urls) {
      try {
        const loaded = await environment.load(url, settings);
        if (loaded) {
          sourceUrl = url;
          break;
        }
      } catch {
        // 继续尝试兼容资源；所有资源失败时保留程序化环境回退。
      }
    }
    if (!sourceUrl) return createUnavailableHandle(preset.id, settings, environment, worldEntity);

    // load() 创建 mesh 后由 applySettings 统一设置实体缩放和 projection uniform。
    environment.applySettings(settings);
    let destroyed = false;
    return {
      presetId: preset.id,
      sourceUrl,
      diameterMeters: settings.radiusMeters * 2,
      radiusMeters: settings.radiusMeters,
      settings,
      hasVisibleBackdrop: true,
      applySettings(nextSettings) {
        if (!destroyed) environment.applySettings(nextSettings);
      },
      rebuildEnvironmentBackdropMesh(nextSettings) {
        if (!destroyed) environment.rebuildEnvironmentBackdropMesh(nextSettings);
      },
      destroy() {
        if (destroyed) return;
        destroyed = true;
        environment.destroy();
        worldEntity.destroy();
      },
    };
  } catch (error) {
    environment.destroy();
    worldEntity.destroy();
    throw error;
  }
}
