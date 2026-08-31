import * as pc from "playcanvas";

import {
  applyHdriKeyLight,
  clearHdriKeyLight,
  createHdriKeyLight,
} from "./blocking3dEnvironmentKeyLight";
import {
  DEFAULT_BLOCKING_3D_LIGHTING_PROFILE,
  resolveBlocking3dLightingProfile,
  type Blocking3dLightingProfile,
} from "./blocking3dEnvironmentLightingProfile";
import {
  createProjectedHdriMaterial,
  updateProjectedHdriMaterial,
} from "./blocking3dEnvironmentProjection";
import {
  configureEnvironmentTexture,
  createBackdropGeometry,
  createGroundDomeGeometry,
  createShadowCatcherMaterial,
  createVisibleHdriCubemap,
  FALLBACK_AMBIENT_LIGHT,
  loadAsset,
  type Blocking3dEnvironmentSettings,
} from "./blocking3dViewerCore";

/**
 * HDRI 环境运行时：背景穹顶网格/材质、环境光照 atlas 与瞬态主光的唯一归属。
 * viewer 只传入世界节点与当前环境参数；加载竞态（旧请求晚到覆盖新请求）用
 * 请求序号在运行时内部收敛，调用方只关心加载结果是否生效。
 */

export interface Blocking3dEnvironmentRuntime {
  /** 清空 HDRI 光照（回落默认环境光）；地面显隐由调用方控制。 */
  clearEnvironmentLighting(): void;
  /** 清空背景穹顶、投影材质与纹理资产。 */
  clearEnvironmentVisuals(): void;
  /** 加载 HDRI 并在世界节点下重建背景穹顶；返回 false 表示已有更新的加载接管。 */
  load(url: string | null, environmentSettings: Blocking3dEnvironmentSettings): Promise<boolean>;
  /** 环境参数（圆半径/投射高度/分界线）变化后同步背景缩放与着色器 uniform。 */
  applySettings(environmentSettings: Blocking3dEnvironmentSettings): void;
  /** 投射高度或圆半径变化后重建背景网格（顶点几何只由这两个量决定）。 */
  rebuildEnvironmentBackdropMesh(environmentSettings: Blocking3dEnvironmentSettings): void;
  destroy(): void;
}

export interface Blocking3dEnvironmentRuntimeOptions {
  /** 无角色的纯环境预览不需要阴影接收器，避免空阴影贴图压黑地面。 */
  enableShadowCatcher?: boolean;
  /** Preview-owned lighting override; omitted callers retain the existing baseline. */
  lightingProfile?: Blocking3dLightingProfile;
}

export function createBlocking3dEnvironmentRuntime(
  app: pc.AppBase,
  worldEntity: pc.Entity,
  options: Blocking3dEnvironmentRuntimeOptions = {},
): Blocking3dEnvironmentRuntime {
  // EnvAtlas provides the HDRI's ambient/reflection contribution, while the
  // transient key light makes a bright window or sun patch readable on actors.
  const lightingProfile = options.lightingProfile ?? DEFAULT_BLOCKING_3D_LIGHTING_PROFILE;
  const lighting = resolveBlocking3dLightingProfile(lightingProfile);
  const initialSceneSkyboxIntensity = app.scene.skyboxIntensity;
  const environmentKeyLight = createHdriKeyLight(lightingProfile);
  app.root.addChild(environmentKeyLight);

  let environmentAsset: pc.Asset | null = null;
  let environmentBackdrop: pc.Entity | null = null;
  let environmentBackdropMeshInstance: pc.MeshInstance | null = null;
  let environmentShadowCatcher: pc.Entity | null = null;
  let environmentShadowCatcherMeshInstance: pc.MeshInstance | null = null;
  let environmentShadowCatcherMaterial: pc.StandardMaterial | null = null;
  let environmentMaterial: pc.ShaderMaterial | null = null;
  let environmentProjectionCube: pc.Texture | null = null;
  let environmentLightingSource: pc.Texture | null = null;
  let environmentAtlas: pc.Texture | null = null;
  const environmentWorldPosition = new pc.Vec3(0, 0, 0);
  let environmentRequestId = 0;
  let destroyed = false;
  const enableShadowCatcher = options.enableShadowCatcher !== false;

  const isCurrentEnvironmentRequest = (requestId: number) => !destroyed && requestId === environmentRequestId;
  const discardEnvironmentAsset = (asset: pc.Asset) => {
    asset.unload();
    app.assets.remove(asset);
  };
  const clearEnvironmentKeyLight = () => {
    clearHdriKeyLight(environmentKeyLight);
  };

  const runtime: Blocking3dEnvironmentRuntime = {
    clearEnvironmentLighting() {
      clearEnvironmentKeyLight();
      const ownsEnvironmentLighting = app.scene.envAtlas === environmentAtlas;
      if (ownsEnvironmentLighting) app.scene.envAtlas = null;
      if (ownsEnvironmentLighting) app.scene.skyboxIntensity = initialSceneSkyboxIntensity;
      environmentAtlas?.destroy();
      environmentAtlas = null;
      environmentLightingSource?.destroy();
      environmentLightingSource = null;
      if (ownsEnvironmentLighting) app.scene.ambientLight = FALLBACK_AMBIENT_LIGHT.clone();
    },
    clearEnvironmentVisuals() {
      environmentShadowCatcher?.destroy();
      environmentShadowCatcher = null;
      environmentShadowCatcherMeshInstance?.mesh?.destroy();
      environmentShadowCatcherMeshInstance = null;
      environmentShadowCatcherMaterial?.destroy();
      environmentShadowCatcherMaterial = null;
      environmentBackdrop?.destroy();
      environmentBackdrop = null;
      environmentBackdropMeshInstance?.mesh?.destroy();
      environmentBackdropMeshInstance = null;
      environmentMaterial?.destroy();
      environmentMaterial = null;
      environmentProjectionCube?.destroy();
      environmentProjectionCube = null;
      if (environmentAsset) {
        environmentAsset.unload();
        app.assets.remove(environmentAsset);
        environmentAsset = null;
      }
    },
    async load(url, environmentSettings) {
      runtime.clearEnvironmentLighting();
      runtime.clearEnvironmentVisuals();
      if (!url?.trim()) return true;
      const requestId = ++environmentRequestId;
      let asset: pc.Asset;
      try {
        asset = await loadAsset(app, url, "texture");
      } catch (error) {
        if (!isCurrentEnvironmentRequest(requestId)) return false;
        throw error;
      }
      if (!isCurrentEnvironmentRequest(requestId)) {
        discardEnvironmentAsset(asset);
        return false;
      }
      environmentAsset = asset;
      try {
        const texture = asset.resource as pc.Texture;
        configureEnvironmentTexture(texture, app);
        texture.projection = pc.TEXTUREPROJECTION_EQUIRECT;
        environmentLightingSource = pc.EnvLighting.generateLightingSource(texture, { size: 128 });
        environmentAtlas = pc.EnvLighting.generateAtlas(environmentLightingSource, {
          size: 256,
          numReflectionSamples: 256,
          numAmbientSamples: 512,
        });
        app.scene.envAtlas = environmentAtlas;
        app.scene.skyboxIntensity = lighting.skyboxIntensity;
        app.scene.lighting.shadowsEnabled = true;
        app.scene.ambientLight = new pc.Color(
          lighting.ambientLight[0],
          lighting.ambientLight[1],
          lighting.ambientLight[2],
        );
        applyHdriKeyLight(environmentKeyLight, texture, environmentSettings.panoramaHorizonV);
        const projectionCube = createVisibleHdriCubemap(app, texture);
        if (!isCurrentEnvironmentRequest(requestId)) {
          projectionCube.destroy();
          return false;
        }
        environmentProjectionCube = projectionCube;
        // EnviroDome uses one continuous surface for the sky and the floor.
        // Sharing the equator ring is important: two independent draw calls
        // can leave a raster gap even when their positions appear identical.
        const mesh = pc.Mesh.fromGeometry(
          app.graphicsDevice,
          createBackdropGeometry(environmentSettings.projectionCenterHeight, environmentSettings.radiusMeters),
        );
        const material = createProjectedHdriMaterial(projectionCube, environmentSettings);
        environmentMaterial = material;
        const meshInstance = new pc.MeshInstance(mesh, material);
        environmentBackdropMeshInstance = meshInstance;
        environmentBackdrop = new pc.Entity("blocking3d-hdri-backdrop");
        environmentBackdrop.addComponent("render", {
          meshInstances: [meshInstance],
          layers: [pc.LAYERID_WORLD],
          castShadows: false,
          receiveShadows: true,
        });
        environmentBackdrop.setPosition(environmentWorldPosition);
        worldEntity.addChild(environmentBackdrop);

        if (enableShadowCatcher) {
          const shadowCatcherMesh = pc.Mesh.fromGeometry(
            app.graphicsDevice,
            createGroundDomeGeometry(environmentSettings.projectionCenterHeight, environmentSettings.radiusMeters),
          );
          environmentShadowCatcherMaterial = createShadowCatcherMaterial();
          environmentShadowCatcherMeshInstance = new pc.MeshInstance(
            shadowCatcherMesh,
            environmentShadowCatcherMaterial,
          );
          environmentShadowCatcherMeshInstance.castShadow = false;
          environmentShadowCatcherMeshInstance.receiveShadow = true;
          environmentShadowCatcherMeshInstance.drawBucket = 250;
          environmentShadowCatcher = new pc.Entity("blocking3d-hdri-shadow-catcher");
          environmentShadowCatcher.addComponent("render", {
            meshInstances: [environmentShadowCatcherMeshInstance],
            layers: [pc.LAYERID_WORLD],
            castShadows: false,
            receiveShadows: true,
          });
          environmentShadowCatcher.setPosition(environmentWorldPosition);
          worldEntity.addChild(environmentShadowCatcher);
        }
        return true;
      } catch (error) {
        if (isCurrentEnvironmentRequest(requestId)) {
          runtime.clearEnvironmentLighting();
          runtime.clearEnvironmentVisuals();
        }
        throw error;
      }
    },
    applySettings(environmentSettings) {
      if (environmentBackdrop) {
        environmentBackdrop.setLocalScale(
          environmentSettings.radiusMeters * 2,
          environmentSettings.radiusMeters * 2,
          environmentSettings.radiusMeters * 2,
        );
        environmentBackdrop.setEulerAngles(0, 0, 0);
      }
      if (environmentShadowCatcher) {
        environmentShadowCatcher.setLocalScale(
          environmentSettings.radiusMeters * 2,
          environmentSettings.radiusMeters * 2,
          environmentSettings.radiusMeters * 2,
        );
        environmentShadowCatcher.setEulerAngles(0, 0, 0);
      }
      if (environmentMaterial) {
        if (environmentProjectionCube) {
          updateProjectedHdriMaterial(
            environmentMaterial,
            environmentProjectionCube,
            environmentSettings,
          );
        }
      }
    },
    rebuildEnvironmentBackdropMesh(environmentSettings) {
      if (environmentBackdropMeshInstance) {
        const previousBackdropMesh = environmentBackdropMeshInstance.mesh;
        const nextBackdropMesh = pc.Mesh.fromGeometry(
          app.graphicsDevice,
          createBackdropGeometry(environmentSettings.projectionCenterHeight, environmentSettings.radiusMeters),
        );
        environmentBackdropMeshInstance.mesh = nextBackdropMesh;
        previousBackdropMesh.destroy();
      }
      if (environmentShadowCatcherMeshInstance) {
        const previousShadowCatcherMesh = environmentShadowCatcherMeshInstance.mesh;
        const nextShadowCatcherMesh = pc.Mesh.fromGeometry(
          app.graphicsDevice,
          createGroundDomeGeometry(environmentSettings.projectionCenterHeight, environmentSettings.radiusMeters),
        );
        environmentShadowCatcherMeshInstance.mesh = nextShadowCatcherMesh;
        previousShadowCatcherMesh.destroy();
      }
    },
    destroy() {
      environmentRequestId += 1;
      destroyed = true;
      runtime.clearEnvironmentLighting();
      runtime.clearEnvironmentVisuals();
      environmentKeyLight.destroy();
    },
  };
  return runtime;
}
