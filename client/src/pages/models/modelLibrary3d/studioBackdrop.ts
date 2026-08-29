import * as pc from "playcanvas";

import {
  configureEnvironmentTexture,
  createBackdropGeometry,
  createProjectedHdriMaterial,
  createVisibleHdriCubemap,
  loadAsset,
} from "@/pages/drama/comicDrama/components/blocking3d";

/**
 * 模型预览的摄影棚穹顶：与漫剧 3D 场景的 HDRI 背景穹顶同一套投射方案——
 * 等距柱状全景图重投影成 cubemap，贴到半圆球内壁上（几何/材质复用
 * blocking3d 的穹顶模块）。环境光仍由 studioLighting 的 env atlas 承担，
 * 穹顶只负责"身处摄影棚房间"的可视背景。
 */

/** 场景全景图管线产出的室内工作室全景（编辑器穹顶与环境共用）。 */
export const STUDIO_PANORAMA_URL = "/models/env/studio_panorama.png";

export interface StudioBackdropHandle {
  destroy: () => void;
}

export async function attachStudioBackdrop(
  app: pc.AppBase,
  options: { radius?: number; centerHeightRatio?: number; panoramaHorizonV?: number } = {},
): Promise<StudioBackdropHandle | null> {
  try {
    const asset = await loadAsset(app, STUDIO_PANORAMA_URL, "texture");
    const texture = asset.resource as pc.Texture;
    configureEnvironmentTexture(texture, app);
    const cubemap = createVisibleHdriCubemap(app, texture);
    // 与漫剧一致：几何按 0.5 单位半径构建，实体再用 domeRadius 缩放。
    const radius = options.radius ?? 30;
    const centerHeight = radius * (options.centerHeightRatio ?? 0.12);
    const mesh = pc.Mesh.fromGeometry(
      app.graphicsDevice,
      createBackdropGeometry(centerHeight, radius),
    );
    const material = createProjectedHdriMaterial(cubemap, {
      projectionCenterHeight: centerHeight,
      panoramaHorizonV: options.panoramaHorizonV ?? 0.56,
    });
    const meshInstance = new pc.MeshInstance(mesh, material);
    const dome = new pc.Entity("studio-panorama-dome");
    dome.addComponent("render", { meshInstances: [meshInstance], layers: [pc.LAYERID_WORLD] });
    dome.setLocalScale(radius, radius, radius);
    dome.setPosition(0, 0, 0);
    app.root.addChild(dome);
    return {
      destroy() {
        dome.destroy();
        mesh.destroy();
        material.destroy();
        cubemap.destroy();
        asset.unload();
      },
    };
  } catch {
    return null;
  }
}
