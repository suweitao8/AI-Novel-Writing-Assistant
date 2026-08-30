import * as pc from "playcanvas";
import {
  STORY_SCENE_3D_DEFAULT_PANORAMA_HORIZON_V,
  STORY_SCENE_3D_DEFAULT_PROJECTION_CENTER_HEIGHT_RATIO,
} from "@ai-novel/shared/types/comicDrama";

import type {
  DramaShotBlockingSketch3DCamera,
  DramaShotBlockingSketch3DEnvironment,
  DramaShotBlockingSketchPose,
} from "@/api/media/drama";
import {
  createBackdropGeometryData,
  createGroundDomeGeometryData,
  type Blocking3dGeometryData,
} from "./blocking3dEnvironmentGeometry";
import { wrapBlocking3dAzimuth } from "./blocking3dMath";
import {
  poseSampleTimeFromTrack,
  resolveBlocking3dPoseClip,
} from "./blocking3dPose";

/**
 * 分镜草图与动画库共用的角色动画资源：模型和动作必须来自同一套 UAL2
 * 骨架，避免把 UAL1 动画轨道套到 UAL2 代理模型上造成关节错乱或 T-pose。
 */
export const ACTOR_PROXY_URL = "/anims/cine57/UAL2_UE_Anims.glb";
export const MAX_DEVICE_PIXEL_RATIO = 1.5;
export const DEFAULT_FOV = 52;
export const VISIBLE_HDRI_CUBEMAP_SIZE = 512;
export const FALLBACK_AMBIENT_LIGHT = new pc.Color(0.28, 0.28, 0.28);
export const SELECTION_OUTLINE_COLOR = new pc.Color(1, 0.58, 0, 0.8);
export const DEFAULT_BLOCKING_3D_ENVIRONMENT: Blocking3dEnvironmentSettings = {
  projectionCenterHeight: 2,
  projectionCenterHeightRatio: STORY_SCENE_3D_DEFAULT_PROJECTION_CENTER_HEIGHT_RATIO,
  radiusMeters: 7.5,
  panoramaHorizonV: STORY_SCENE_3D_DEFAULT_PANORAMA_HORIZON_V,
  yawDeg: 0,
  intensity: 1,
};
export const BLOCKING_SKETCH_CAPTURE_SIZE = {
  width: 1280,
  height: 720,
} as const;
export const DEFAULT_CAMERA: DramaShotBlockingSketch3DCamera = {
  azim: -45,
  elev: -12,
  distance: 8,
  focalPoint: [0, 0.8, 0],
  fovDeg: 52,
  nearClip: 0.05,
  farClip: 200,
  depthOfFieldEnabled: false,
  focusDistance: 8,
  focusRange: 5,
  blurRadius: 3,
};
/** 分镜草图里用于蓝色代理角色的共享材质颜色。 */
export const BLOCKING_3D_BLUE_ACTOR_COLOR = [0.24, 0.52, 0.82] as const;
const ACTOR_COLORS = [
  [0.78, 0.32, 0.28],
  BLOCKING_3D_BLUE_ACTOR_COLOR,
  [0.82, 0.59, 0.22],
  [0.39, 0.67, 0.44],
  [0.58, 0.39, 0.72],
  [0.84, 0.42, 0.64],
] as const;

export type Blocking3dEnvironmentSettings =
  DramaShotBlockingSketch3DEnvironment;

export interface ContainerResource {
  instantiateRenderEntity?: (options?: { castShadows?: boolean }) => pc.Entity;
  animations?: pc.Asset[];
}

export interface AnimLayer {
  activeStateCurrentTime: number;
  play: (name: string) => void;
  pause: () => void;
}

export interface AnimComponent {
  baseLayer?: AnimLayer | null;
  playing: boolean;
  assignAnimation: (
    name: string,
    track: unknown,
    layer?: number,
    speed?: number,
    loop?: boolean,
  ) => void;
}

export interface Blocking3dViewerActor {
  label: string;
  heightMeters: number;
  entity: pc.Entity;
  animEntity: pc.Entity;
  pose: DramaShotBlockingSketchPose;
  actionPlaying: boolean;
  color: [number, number, number];
  material: pc.StandardMaterial;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function normalizeEnvironmentSettings(
  input: (Partial<Blocking3dEnvironmentSettings> & { domeRadius?: number }) | undefined,
): Blocking3dEnvironmentSettings {
  const source = input as (Partial<Blocking3dEnvironmentSettings> & { domeRadius?: number }) | undefined;
  const numberOr = (value: unknown, fallback: number): number => {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
  };
  const hasCurrentRadius = Number.isFinite(Number(source?.radiusMeters)) && Number(source?.radiusMeters) > 0;
  const hasLegacyDiameter = !hasCurrentRadius
    && Number.isFinite(Number(source?.domeRadius))
    && Number(source?.domeRadius) > 0;
  const radiusMeters = clamp(
    numberOr(source?.radiusMeters, numberOr(source?.domeRadius, DEFAULT_BLOCKING_3D_ENVIRONMENT.radiusMeters * 2) / 2),
    2.5,
    15,
  );
  const rawRatio = numberOr(
    source?.projectionCenterHeightRatio,
    DEFAULT_BLOCKING_3D_ENVIRONMENT.projectionCenterHeightRatio,
  );
  const ratio = clamp(
    hasLegacyDiameter && source?.projectionCenterHeightRatio !== undefined
      ? rawRatio * 2
      : rawRatio,
    0.1,
    0.4,
  );
  return {
    projectionCenterHeightRatio: ratio,
    // 高度由圆半径 × 占比派生，圆半径拖动时投射中心等比跟随。
    projectionCenterHeight: Math.round(radiusMeters * ratio * 100) / 100,
    radiusMeters,
    panoramaHorizonV: clamp(
      numberOr(
        input?.panoramaHorizonV,
        DEFAULT_BLOCKING_3D_ENVIRONMENT.panoramaHorizonV,
      ),
      0.45,
      0.55,
    ),
    yawDeg: 0,
    intensity: 1,
  };
}

function createPlayCanvasGeometry(data: Blocking3dGeometryData): pc.Geometry {
  const geometry = new pc.Geometry();
  geometry.positions = data.positions;
  geometry.normals = data.normals;
  geometry.uvs = data.uvs;
  geometry.uvs1 = data.uvs;
  geometry.indices = data.indices;
  return geometry;
}

export function createBackdropGeometry(
  projectionCenterHeight: number,
  radiusMeters: number,
): pc.Geometry {
  return createPlayCanvasGeometry(
    createBackdropGeometryData(projectionCenterHeight, radiusMeters),
  );
}

export function createGroundDomeGeometry(
  projectionCenterHeight: number,
  radiusMeters: number,
): pc.Geometry {
  return createPlayCanvasGeometry(
    createGroundDomeGeometryData(projectionCenterHeight, radiusMeters),
  );
}

/**
 * Render only directional-light shadows over the projected HDRI floor.
 *
 * The visible HDRI backdrop is intentionally a custom unlit shader, so it
 * cannot participate in PlayCanvas' regular shadow chunks. A standard
 * shadow-catcher material gives us a transparent multiplicative pass that
 * darkens only the lower dome while leaving the sky projection untouched.
 */
export function createShadowCatcherMaterial(): pc.StandardMaterial {
  const material = new pc.StandardMaterial();
  material.shadowCatcher = true;
  material.blendType = pc.BLEND_MULTIPLICATIVE;
  // The shared lower-dome topology is wound for the inside-facing HDRI
  // projection material. Render both sides here so the catcher still
  // receives shadows from the editor camera's normal above-floor view.
  material.cull = pc.CULLFACE_NONE;
  material.useSkybox = false;
  material.depthWrite = false;
  material.diffuse.set(0, 0, 0);
  material.specular.set(0, 0, 0);
  material.update();
  return material;
}

export function configureEnvironmentTexture(
  texture: pc.Texture,
  app: pc.AppBase,
): void {
  texture.projection = pc.TEXTUREPROJECTION_EQUIRECT;
  texture.minFilter = pc.FILTER_LINEAR;
  texture.magFilter = pc.FILTER_LINEAR;
  texture.mipmaps = false;
  texture.anisotropy = Math.max(
    1,
    Math.min(app.graphicsDevice.maxAnisotropy, 8),
  );
  texture.addressU = pc.ADDRESS_REPEAT;
  texture.addressV = pc.ADDRESS_CLAMP_TO_EDGE;
}

export function createVisibleHdriCubemap(
  app: pc.AppBase,
  source: pc.Texture,
): pc.Texture {
  const cubemap = new pc.Texture(app.graphicsDevice, {
    name: "blocking3d-hdri-projection-cubemap",
    cubemap: true,
    width: VISIBLE_HDRI_CUBEMAP_SIZE,
    height: VISIBLE_HDRI_CUBEMAP_SIZE,
    format: pc.PIXELFORMAT_RGBA8,
    // RGBA8 stores the reprojected HDR values in PlayCanvas' RGBP packing.
    // Keeping the target as DEFAULT silently clamps bright HDR samples and
    // makes the custom backdrop shader interpret the packed data incorrectly.
    type: pc.TEXTURETYPE_RGBP,
    mipmaps: false,
    addressU: pc.ADDRESS_CLAMP_TO_EDGE,
    addressV: pc.ADDRESS_CLAMP_TO_EDGE,
    addressW: pc.ADDRESS_CLAMP_TO_EDGE,
  });
  cubemap.projection = pc.TEXTUREPROJECTION_CUBE;
  try {
    const reprojected = pc.reprojectTexture(source, cubemap, {
      // The visible backdrop only needs one filtered lookup per destination
      // texel. PlayCanvas defaults this utility to 1024 samples, which is
      // intended for prefiltered lighting and would make every environment
      // load unnecessarily expensive.
      numSamples: 1,
      seamPixels: 1,
    });
    if (!reprojected) throw new Error("HDRI 全景图无法重投影为立方体纹理。");
    return cubemap;
  } catch (error) {
    cubemap.destroy();
    throw error instanceof Error ? error : new Error(String(error));
  }
}

export function normalizeCamera(
  input: DramaShotBlockingSketch3DCamera,
): DramaShotBlockingSketch3DCamera {
  const numberOr = (value: unknown, fallback: number): number => {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
  };
  const nearClip = clamp(
    numberOr(input.nearClip, DEFAULT_CAMERA.nearClip),
    0.05,
    5,
  );
  const farClip = Math.max(
    nearClip + 0.05,
    clamp(numberOr(input.farClip, DEFAULT_CAMERA.farClip), 20, 300),
  );
  return {
    azim: wrapBlocking3dAzimuth(numberOr(input.azim, 0)),
    elev: clamp(numberOr(input.elev, 0), -89, 89),
    distance: clamp(
      numberOr(input.distance, DEFAULT_CAMERA.distance),
      0.25,
      100,
    ),
    focalPoint: [
      clamp(numberOr(input.focalPoint?.[0], 0), -100, 100),
      clamp(numberOr(input.focalPoint?.[1], 0.8), -100, 100),
      clamp(numberOr(input.focalPoint?.[2], 0), -100, 100),
    ],
    fovDeg: clamp(numberOr(input.fovDeg, DEFAULT_CAMERA.fovDeg), 30, 100),
    nearClip,
    farClip,
    depthOfFieldEnabled:
      typeof input.depthOfFieldEnabled === "boolean"
        ? input.depthOfFieldEnabled
        : DEFAULT_CAMERA.depthOfFieldEnabled,
    focusDistance: clamp(
      numberOr(input.focusDistance, DEFAULT_CAMERA.focusDistance),
      0.25,
      100,
    ),
    focusRange: clamp(
      numberOr(input.focusRange, DEFAULT_CAMERA.focusRange),
      0.1,
      100,
    ),
    blurRadius: clamp(
      numberOr(input.blurRadius, DEFAULT_CAMERA.blurRadius),
      0,
      10,
    ),
  };
}

export function colorForIndex(index: number): [number, number, number] {
  return [...ACTOR_COLORS[index % ACTOR_COLORS.length]] as [
    number,
    number,
    number,
  ];
}

export function loadAsset(
  app: pc.AppBase,
  url: string,
  type: "container" | "texture",
): Promise<pc.Asset> {
  return new Promise((resolve, reject) => {
    const asset = new pc.Asset(`blocking3d-${type}-${url}`, type, { url });
    const cleanup = () => {
      asset.off("load");
      asset.off("error");
    };
    asset.once("load", () => {
      cleanup();
      resolve(asset);
    });
    asset.once("error", (error: unknown) => {
      cleanup();
      app.assets.remove(asset);
      const message =
        error && typeof error === "object" && "message" in error
          ? String((error as { message?: unknown }).message ?? "资源加载失败")
          : String(error ?? "资源加载失败");
      reject(new Error(`3D 资源加载失败：${message}`));
    });
    app.assets.add(asset);
    app.assets.load(asset);
  });
}

export function setEntityMaterial(
  entity: pc.Entity,
  color: readonly [number, number, number],
  material = new pc.StandardMaterial(),
): pc.StandardMaterial {
  material.diffuse = new pc.Color(color[0], color[1], color[2]);
  material.metalness = 0;
  material.useLighting = true;
  material.useSkybox = true;
  material.update();
  for (const render of entity.findComponents(
    "render",
  ) as pc.RenderComponent[]) {
    for (const mesh of render.meshInstances ?? []) mesh.material = material;
  }
  for (const model of entity.findComponents("model") as pc.ModelComponent[]) {
    for (const mesh of model.meshInstances ?? []) mesh.material = material;
  }
  return material;
}

export function normalizeActorColor(
  color: [number, number, number],
): [number, number, number] {
  return color.map((channel) => clamp(Number(channel), 0, 1)) as [
    number,
    number,
    number,
  ];
}

export function setAnimationPose(
  actor: Blocking3dViewerActor,
  tracks: Map<string, unknown>,
  pose: DramaShotBlockingSketchPose,
): void {
  const anim = actor.animEntity.anim as unknown as AnimComponent | undefined;
  if (!anim) throw new Error(`角色“${actor.label}”没有可用的动作组件。`);
  let appliedPose = pose;
  let clip: ReturnType<typeof resolveBlocking3dPoseClip>;
  try {
    clip = resolveBlocking3dPoseClip(pose, tracks.keys());
  } catch (error) {
    // UAL2 intentionally contains a smaller, verified pose set than the
    // legacy schema. A saved layout may still contain an old pose; normalize
    // that actor to standing instead of aborting the entire blocking scene.
    if (pose === "standing") throw error;
    appliedPose = "standing";
    clip = resolveBlocking3dPoseClip(appliedPose, tracks.keys());
  }
  const track = tracks.get(clip.clipName);
  if (!track) throw new Error(`角色“${actor.label}”的动作片段不可用。`);
  anim.assignAnimation(clip.clipName, track, 0, 1, false);
  const layer = anim.baseLayer;
  if (layer) {
    layer.play(clip.clipName);
    layer.pause();
    layer.activeStateCurrentTime = poseSampleTimeFromTrack(
      track,
      clip.sampleTimeRatio,
    );
  }
  anim.playing = false;
  actor.pose = appliedPose;
  actor.actionPlaying = false;
}

export function createMaterial(
  color: pc.Color,
  opacity = 1,
): pc.StandardMaterial {
  const material = new pc.StandardMaterial();
  material.diffuse = color;
  material.opacity = opacity;
  material.blendType = opacity < 1 ? pc.BLEND_NORMAL : pc.BLEND_NONE;
  material.update();
  return material;
}

export function createPlane(
  app: pc.AppBase,
  name: string,
  position: [number, number, number],
  scale: [number, number, number],
  material: pc.Material,
  angles: [number, number, number] = [0, 0, 0],
): pc.Entity {
  const entity = new pc.Entity(name);
  entity.addComponent("render", { type: "plane", material });
  entity.setPosition(position[0], position[1], position[2]);
  entity.setLocalScale(scale[0], scale[1], scale[2]);
  entity.setEulerAngles(angles[0], angles[1], angles[2]);
  app.root.addChild(entity);
  return entity;
}
