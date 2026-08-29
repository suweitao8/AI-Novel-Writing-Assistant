import * as pc from "playcanvas";

import {
  configureEnvironmentTexture,
  createBackdropGeometry,
  createProjectedHdriMaterial,
  createVisibleHdriCubemap,
  loadAsset,
} from "@/pages/drama/comicDrama/components/blocking3d";

import {
  DEFAULT_STUDIO_ENVIRONMENT_PRESET_ID,
  getStudioEnvironmentDomeDiameterMeters,
  normalizeStudioEnvironmentRadiusMeters,
  getStudioEnvironmentPreset,
  type StudioEnvironmentPresetId,
} from "./studioEnvironmentPresets";

/**
 * 模型预览的摄影棚穹顶：与漫剧 3D 场景的 HDRI 背景穹顶同一套投射方案——
 * 等距柱状全景图重投影成 cubemap，贴到半圆球内壁上（几何/材质复用
 * blocking3d 的穹顶模块）。环境光仍由 studioLighting 的 env atlas 承担，
 * 穹顶只负责“身处摄影棚房间”的可视背景。
 */

/** 旧版场景全景图，保留为新 HDRI 资源不可用时的可视背景兜底。 */
export const STUDIO_PANORAMA_URL = "/models/env/studio_panorama.png";

export interface StudioBackdropHandle {
  destroy: () => void;
}

export interface StudioBackdropOptions {
  presetId?: StudioEnvironmentPresetId;
  /** 覆盖预设的真实水平半径；模型编辑器使用预设值，缩略图可使用固定取景半径。 */
  radiusMeters?: number;
  projectionCenterHeightMeters?: number;
  panoramaHorizonV?: number;
}

interface LoadedEnvironmentTexture {
  asset: pc.Asset;
  texture: pc.Texture;
}

async function loadEnvironmentTexture(
  app: pc.AppBase,
  urls: readonly string[],
): Promise<LoadedEnvironmentTexture | null> {
  for (const url of urls) {
    try {
      const asset = await loadAsset(app, url, "texture");
      const texture = asset.resource as pc.Texture | null;
      if (texture) return { asset, texture };
      asset.unload();
    } catch {
      // 资源缺失时继续尝试兼容的旧版全景图。
    }
  }
  return null;
}

export async function attachStudioBackdrop(
  app: pc.AppBase,
  options: StudioBackdropOptions = {},
): Promise<StudioBackdropHandle | null> {
  const preset = getStudioEnvironmentPreset(
    options.presetId ?? DEFAULT_STUDIO_ENVIRONMENT_PRESET_ID,
  );
  const loaded = await loadEnvironmentTexture(app, [preset.sourceUrl, STUDIO_PANORAMA_URL]);
  if (!loaded) return null;

  const { asset, texture } = loaded;
  let cubemap: pc.Texture | null = null;
  let mesh: pc.Mesh | null = null;
  let material: pc.Material | null = null;
  let dome: pc.Entity | null = null;
  try {
    configureEnvironmentTexture(texture, app);
    cubemap = createVisibleHdriCubemap(app, texture);

    const radiusMeters = normalizeStudioEnvironmentRadiusMeters(
      options.radiusMeters ?? preset.radiusMeters,
      preset.radiusMeters,
    );
    const domeDiameterMeters = getStudioEnvironmentDomeDiameterMeters(radiusMeters);
    const centerHeight =
      typeof options.projectionCenterHeightMeters === "number" &&
      Number.isFinite(options.projectionCenterHeightMeters)
        ? Math.max(0, options.projectionCenterHeightMeters)
        : preset.projectionCenterHeightMeters;

    // blocking3d 的基础几何半径是 0.5，半球直径可以直接作为几何缩放值。
    mesh = pc.Mesh.fromGeometry(
      app.graphicsDevice,
      createBackdropGeometry(centerHeight, domeDiameterMeters),
    );
    material = createProjectedHdriMaterial(cubemap, {
      projectionCenterHeight: centerHeight,
      panoramaHorizonV: options.panoramaHorizonV ?? preset.panoramaHorizonV,
    });
    const meshInstance = new pc.MeshInstance(mesh, material);
    dome = new pc.Entity("studio-panorama-dome");
    dome.addComponent("render", {
      meshInstances: [meshInstance],
      layers: [pc.LAYERID_WORLD],
    });
    dome.setLocalScale(domeDiameterMeters, domeDiameterMeters, domeDiameterMeters);
    // 模型预览穹顶是世界空间背景，永远固定在原点，不能随相机漂移。
    dome.setPosition(0, 0, 0);
    app.root.addChild(dome);

    let destroyed = false;
    return {
      destroy() {
        if (destroyed) return;
        destroyed = true;
        dome?.destroy();
        mesh?.destroy();
        material?.destroy();
        cubemap?.destroy();
        asset.unload();
        dome = null;
        mesh = null;
        material = null;
        cubemap = null;
      },
    };
  } catch {
    dome?.destroy();
    mesh?.destroy();
    material?.destroy();
    cubemap?.destroy();
    asset.unload();
    return null;
  }
}
