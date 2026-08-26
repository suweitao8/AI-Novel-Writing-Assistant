import * as pc from "playcanvas";
import type { StoryScene3DMarker } from "@ai-novel/shared/types/comicDrama";

import type {
  DramaShotBlockingSketch3DActor,
  DramaShotBlockingSketch3DCamera,
  DramaShotBlockingSketch3DEnvironment,
  DramaShotBlockingSketchPose,
} from "@/api/media/drama";
import {
  createBackdropGeometryData,
  type Blocking3dGeometryData,
} from "./blocking3dEnvironmentGeometry";
import {
  createProjectedHdriMaterial,
  updateProjectedHdriMaterial,
} from "./blocking3dEnvironmentProjection";
import { createSelectionRingGeometryData } from "./blocking3dSelectionRing";
import { updateBlocking3dCameraAzimuth, wrapBlocking3dAzimuth } from "./blocking3dMath";
import {
  DEFAULT_BLOCKING_3D_HEIGHT_METERS,
  heightToBlocking3dScale,
  normalizeBlocking3dHeight,
  scaleSavedActorForCurrentHeight,
} from "./blocking3dScale";
import { resolveBlocking3dPoseClip } from "./blocking3dPose";
import {
  createSceneMarkerRuntime,
  destroySceneMarkerRuntime,
  drawSceneMarkerOutlines,
  pickSceneMarker,
  setSceneMarkerSelected,
  updateSceneMarkerRuntime,
  type Blocking3dSceneMarkerRuntime,
} from "./blocking3dSceneMarkers";

const ACTOR_PROXY_URL = "/viewer-kit/quaternius/ual2/UAL2_Standard.glb";
const ACTOR_ANIMATION_URL = "/viewer-kit/quaternius/ual1/UAL1_Standard.glb";
const MAX_DEVICE_PIXEL_RATIO = 1.5;
const DEFAULT_FOV = 52;
const VISIBLE_HDRI_CUBEMAP_SIZE = 512;
const FALLBACK_AMBIENT_LIGHT = new pc.Color(0.28, 0.28, 0.28);
const SELECTION_RING_OPACITY = 0.5;
export const DEFAULT_BLOCKING_3D_ENVIRONMENT: Blocking3dEnvironmentSettings = {
  projectionCenterHeight: 2,
  domeRadius: 15,
  panoramaHorizonV: 0.5,
  yawDeg: 0,
  intensity: 1,
};
export const BLOCKING_SKETCH_CAPTURE_SIZE = {
  width: 1280,
  height: 720,
} as const;
const DEFAULT_CAMERA: DramaShotBlockingSketch3DCamera = {
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
const ACTOR_COLORS = [
  [0.78, 0.32, 0.28],
  [0.24, 0.52, 0.82],
  [0.82, 0.59, 0.22],
  [0.39, 0.67, 0.44],
  [0.58, 0.39, 0.72],
  [0.84, 0.42, 0.64],
] as const;

interface ContainerResource {
  instantiateRenderEntity?: (options?: { castShadows?: boolean }) => pc.Entity;
  animations?: pc.Asset[];
}

interface AnimLayer {
  activeStateCurrentTime: number;
  play: (name: string) => void;
  pause: () => void;
}

interface AnimComponent {
  baseLayer?: AnimLayer | null;
  playing: boolean;
  assignAnimation: (name: string, track: unknown, layer?: number, speed?: number, loop?: boolean) => void;
}

interface Blocking3dViewerActor {
  label: string;
  heightMeters: number;
  entity: pc.Entity;
  animEntity: pc.Entity;
  pose: DramaShotBlockingSketchPose;
  actionPlaying: boolean;
  color: [number, number, number];
  material: pc.StandardMaterial;
}

type Blocking3dActorPosition = [number, number, number];

export interface Blocking3dViewerOptions {
  canvas: HTMLCanvasElement;
  environmentUrl?: string | null;
  sceneMarkers?: StoryScene3DMarker[];
  onStatus?: (status: string) => void;
}

export type Blocking3dEnvironmentSettings = DramaShotBlockingSketch3DEnvironment;

export interface Blocking3dViewer {
  readonly canvas: HTMLCanvasElement;
  onSelectionChange: (listener: (label: string | null) => void) => () => void;
  onMarkerSelection: (listener: (id: string | null) => void) => () => void;
  onChange: (listener: () => void) => () => void;
  onStatus: (listener: (status: string) => void) => () => void;
  addActor: (
    label: string,
    index: number,
    heightMeters?: number,
    initialPosition?: Blocking3dActorPosition,
  ) => boolean;
  removeActor: (label: string) => boolean;
  selectActor: (label: string | null) => boolean;
  selectMarker: (id: string | null) => boolean;
  focusMarker: (id: string) => boolean;
  getSelectedMarker: () => string | null;
  setSceneMarkers: (markers: StoryScene3DMarker[]) => void;
  getSceneMarkers: () => StoryScene3DMarker[];
  getSelectedActor: () => string | null;
  getSelectedTransform: () => {
    position: [number, number, number];
    yawDeg: number;
    scale: [number, number, number];
  } | null;
  getActorLabels: () => string[];
  setSelectedPose: (pose: DramaShotBlockingSketchPose) => boolean;
  getSelectedPose: () => DramaShotBlockingSketchPose | null;
  setSelectedColor: (color: [number, number, number]) => boolean;
  getSelectedColor: () => [number, number, number] | null;
  nudgeSelected: (dx: number, dy: number, dz: number) => boolean;
  rotateSelected: (degrees: number) => boolean;
  groundSelected: () => boolean;
  fitView: () => void;
  resetCamera: () => void;
  setCameraState: (camera: DramaShotBlockingSketch3DCamera) => void;
  getCameraState: () => DramaShotBlockingSketch3DCamera;
  setInteractionEnabled: (enabled: boolean) => void;
  setActorMovementEnabled: (enabled: boolean) => void;
  setEnvironment: (url: string | null) => Promise<void>;
  getEnvironmentSettings: () => Blocking3dEnvironmentSettings;
  setEnvironmentSettings: (settings: Blocking3dEnvironmentSettings) => boolean;
  exportLayout: () => {
    schemaVersion: 1;
    engine: "playcanvas";
    camera: DramaShotBlockingSketch3DCamera;
    actors: DramaShotBlockingSketch3DActor[];
    environment: Blocking3dEnvironmentSettings;
  };
  loadLayout: (layout: {
    schemaVersion: 1;
    engine: "playcanvas";
    camera: DramaShotBlockingSketch3DCamera;
    actors: DramaShotBlockingSketch3DActor[];
    environment?: Blocking3dEnvironmentSettings;
  }) => void;
  capturePng: () => Blob;
  destroy: () => void;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizeEnvironmentSettings(input: Partial<Blocking3dEnvironmentSettings> | undefined): Blocking3dEnvironmentSettings {
  const numberOr = (value: unknown, fallback: number): number => {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
  };
  return {
    projectionCenterHeight: clamp(numberOr(input?.projectionCenterHeight, DEFAULT_BLOCKING_3D_ENVIRONMENT.projectionCenterHeight), 1, 10),
    domeRadius: clamp(numberOr(input?.domeRadius, DEFAULT_BLOCKING_3D_ENVIRONMENT.domeRadius), 10, 50),
    panoramaHorizonV: clamp(numberOr(input?.panoramaHorizonV, DEFAULT_BLOCKING_3D_ENVIRONMENT.panoramaHorizonV), 0.4, 0.65),
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

function createBackdropGeometry(projectionCenterHeight: number, domeRadius: number): pc.Geometry {
  return createPlayCanvasGeometry(createBackdropGeometryData(projectionCenterHeight, domeRadius));
}

function configureEnvironmentTexture(texture: pc.Texture, app: pc.AppBase): void {
  texture.projection = pc.TEXTUREPROJECTION_EQUIRECT;
  texture.minFilter = pc.FILTER_LINEAR;
  texture.magFilter = pc.FILTER_LINEAR;
  texture.mipmaps = false;
  texture.anisotropy = Math.max(1, Math.min(app.graphicsDevice.maxAnisotropy, 8));
  texture.addressU = pc.ADDRESS_REPEAT;
  texture.addressV = pc.ADDRESS_CLAMP_TO_EDGE;
}

function createVisibleHdriCubemap(app: pc.AppBase, source: pc.Texture): pc.Texture {
  const cubemap = new pc.Texture(app.graphicsDevice, {
    name: "blocking3d-hdri-projection-cubemap",
    cubemap: true,
    width: VISIBLE_HDRI_CUBEMAP_SIZE,
    height: VISIBLE_HDRI_CUBEMAP_SIZE,
    format: pc.PIXELFORMAT_RGBA8,
    type: pc.TEXTURETYPE_DEFAULT,
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

function normalizeCamera(input: DramaShotBlockingSketch3DCamera): DramaShotBlockingSketch3DCamera {
  const numberOr = (value: unknown, fallback: number): number => {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
  };
  const nearClip = clamp(numberOr(input.nearClip, DEFAULT_CAMERA.nearClip), 0.05, 5);
  const farClip = Math.max(nearClip + 0.05, clamp(numberOr(input.farClip, DEFAULT_CAMERA.farClip), 20, 300));
  return {
    azim: wrapBlocking3dAzimuth(numberOr(input.azim, 0)),
    elev: clamp(numberOr(input.elev, 0), -89, 89),
    distance: clamp(numberOr(input.distance, DEFAULT_CAMERA.distance), 0.25, 100),
    focalPoint: [
      clamp(numberOr(input.focalPoint?.[0], 0), -100, 100),
      clamp(numberOr(input.focalPoint?.[1], 0.8), -100, 100),
      clamp(numberOr(input.focalPoint?.[2], 0), -100, 100),
    ],
    fovDeg: clamp(numberOr(input.fovDeg, DEFAULT_CAMERA.fovDeg), 30, 100),
    nearClip,
    farClip,
    depthOfFieldEnabled: typeof input.depthOfFieldEnabled === "boolean"
      ? input.depthOfFieldEnabled
      : DEFAULT_CAMERA.depthOfFieldEnabled,
    focusDistance: clamp(numberOr(input.focusDistance, DEFAULT_CAMERA.focusDistance), 0.25, 100),
    focusRange: clamp(numberOr(input.focusRange, DEFAULT_CAMERA.focusRange), 0.1, 100),
    blurRadius: clamp(numberOr(input.blurRadius, DEFAULT_CAMERA.blurRadius), 0, 10),
  };
}

function colorForIndex(index: number): [number, number, number] {
  return [...ACTOR_COLORS[index % ACTOR_COLORS.length]] as [number, number, number];
}

function loadAsset(app: pc.AppBase, url: string, type: "container" | "texture"): Promise<pc.Asset> {
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
      const message = error && typeof error === "object" && "message" in error
        ? String((error as { message?: unknown }).message ?? "资源加载失败")
        : String(error ?? "资源加载失败");
      reject(new Error(`3D 资源加载失败：${message}`));
    });
    app.assets.add(asset);
    app.assets.load(asset);
  });
}

function setEntityMaterial(entity: pc.Entity, color: [number, number, number], material = new pc.StandardMaterial()): pc.StandardMaterial {
  material.diffuse = new pc.Color(color[0], color[1], color[2]);
  material.metalness = 0;
  material.useLighting = true;
  material.useSkybox = true;
  material.update();
  for (const render of entity.findComponents("render") as pc.RenderComponent[]) {
    for (const mesh of render.meshInstances ?? []) mesh.material = material;
  }
  for (const model of entity.findComponents("model") as pc.ModelComponent[]) {
    for (const mesh of model.meshInstances ?? []) mesh.material = material;
  }
  return material;
}

function normalizeActorColor(color: [number, number, number]): [number, number, number] {
  return color.map((channel) => clamp(Number(channel), 0, 1)) as [number, number, number];
}

function setAnimationPose(
  actor: Blocking3dViewerActor,
  tracks: Map<string, unknown>,
  pose: DramaShotBlockingSketchPose,
): void {
  const anim = actor.animEntity.anim as unknown as AnimComponent | undefined;
  if (!anim) throw new Error(`角色“${actor.label}”没有可用的动作组件。`);
  const clip = resolveBlocking3dPoseClip(pose, tracks.keys());
  const track = tracks.get(clip.clipName);
  if (!track) throw new Error(`角色“${actor.label}”的动作片段不可用。`);
  anim.assignAnimation(clip.clipName, track, 0, 1, false);
  const layer = anim.baseLayer;
  if (layer) {
    layer.play(clip.clipName);
    layer.pause();
    layer.activeStateCurrentTime = clip.sampleTime;
  }
  anim.playing = false;
  actor.pose = pose;
  actor.actionPlaying = false;
}

function createMaterial(color: pc.Color, opacity = 1): pc.StandardMaterial {
  const material = new pc.StandardMaterial();
  material.diffuse = color;
  material.opacity = opacity;
  material.blendType = opacity < 1 ? pc.BLEND_NORMAL : pc.BLEND_NONE;
  material.update();
  return material;
}

function createPlane(
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

export async function createBlocking3dViewer(options: Blocking3dViewerOptions): Promise<Blocking3dViewer> {
  const { canvas } = options;
  const app = new pc.Application(canvas, {
    mouse: new pc.Mouse(canvas),
    keyboard: new pc.Keyboard(window),
    graphicsDeviceOptions: {
      antialias: true,
      alpha: false,
      preserveDrawingBuffer: true,
      powerPreference: "high-performance",
    },
  });
  app.setCanvasFillMode(pc.FILLMODE_NONE);
  app.setCanvasResolution(pc.RESOLUTION_AUTO);
  app.scene.exposure = 1;
  app.scene.ambientLight = FALLBACK_AMBIENT_LIGHT.clone();

  const cameraEntity = new pc.Entity("blocking3d-camera");
  cameraEntity.addComponent("camera", {
    clearColor: new pc.Color(0.05, 0.07, 0.1),
    fov: DEFAULT_FOV,
    nearClip: 0.05,
    farClip: 200,
  });
  // PlayCanvas uses scene.envAtlas as the fallback texture for its built-in
  // infinite Skybox. Keep the atlas for HDRI lighting, but remove that layer
  // from this camera so the finite backdrop below remains the only environment
  // visible in the blocking viewport.
  const cameraComponent = cameraEntity.camera!;
  cameraComponent.layers = cameraComponent.layers.filter((layerId) => layerId !== pc.LAYERID_SKYBOX);
  app.root.addChild(cameraEntity);
  const cameraFrame = new pc.CameraFrame(app, cameraEntity.camera!);
  cameraFrame.dof.nearBlur = false;
  cameraFrame.dof.highQuality = true;

  const ground = createPlane(
    app,
    "blocking3d-ground",
    [0, -0.02, 0],
    [22, 22, 22],
    createMaterial(new pc.Color(0.12, 0.15, 0.19)),
  );
  ground.render!.receiveShadows = true;

  const gridLines: Array<{ start: pc.Vec3; end: pc.Vec3; color: pc.Color }> = [];
  for (let value = -10; value <= 10; value += 1) {
    const major = value % 5 === 0;
    const color = new pc.Color(major ? 0.46 : 0.28, major ? 0.5 : 0.32, major ? 0.58 : 0.4, major ? 0.62 : 0.38);
    gridLines.push({
      start: new pc.Vec3(value, 0.005, -10),
      end: new pc.Vec3(value, 0.005, 10),
      color,
    });
    gridLines.push({
      start: new pc.Vec3(-10, 0.005, value),
      end: new pc.Vec3(10, 0.005, value),
      color,
    });
  }

  const selectionColor = new pc.Color(0.02, 0.32, 0.1);
  const selectionMaterial = createMaterial(selectionColor, SELECTION_RING_OPACITY);
  selectionMaterial.depthWrite = false;
  selectionMaterial.useLighting = false;
  selectionMaterial.useSkybox = false;
  selectionMaterial.emissive = selectionColor.clone();
  selectionMaterial.emissiveIntensity = 0.35;
  selectionMaterial.update();
  const selectionGeometry = createPlayCanvasGeometry(createSelectionRingGeometryData());
  const selectionMesh = pc.Mesh.fromGeometry(app.graphicsDevice, selectionGeometry);
  const selectionMeshInstance = new pc.MeshInstance(selectionMesh, selectionMaterial);
  const selectionRing = new pc.Entity("blocking3d-selection-ring");
  selectionRing.addComponent("render", {
    meshInstances: [selectionMeshInstance],
  });
  selectionRing.setLocalScale(0.9, 1, 0.9);
  selectionRing.enabled = false;
  app.root.addChild(selectionRing);

  let environmentBackdrop: pc.Entity | null = null;
  let environmentAsset: pc.Asset | null = null;
  let environmentProjectionCube: pc.Texture | null = null;
  let environmentMaterial: pc.ShaderMaterial | null = null;
  let environmentBackdropMeshInstance: pc.MeshInstance | null = null;
  let environmentLightingSource: pc.Texture | null = null;
  let environmentAtlas: pc.Texture | null = null;
  const environmentWorldPosition = new pc.Vec3(0, 0, 0);
  let environmentSettings = normalizeEnvironmentSettings(undefined);
  let environmentRequestId = 0;
  const isCurrentEnvironmentRequest = (requestId: number) => !destroyed && requestId === environmentRequestId;
  const discardEnvironmentAsset = (asset: pc.Asset) => {
    asset.unload();
    app.assets.remove(asset);
  };
  const clearEnvironmentLighting = () => {
    if (app.scene.envAtlas === environmentAtlas) app.scene.envAtlas = null;
    environmentAtlas?.destroy();
    environmentAtlas = null;
    environmentLightingSource?.destroy();
    environmentLightingSource = null;
    app.scene.ambientLight = FALLBACK_AMBIENT_LIGHT.clone();
  };
  const applyEnvironmentLighting = (texture: pc.Texture) => {
    texture.projection = pc.TEXTUREPROJECTION_EQUIRECT;
    environmentLightingSource = pc.EnvLighting.generateLightingSource(texture, { size: 128 });
    environmentAtlas = pc.EnvLighting.generateAtlas(environmentLightingSource, {
      size: 256,
      numReflectionSamples: 256,
      numAmbientSamples: 512,
    });
    app.scene.envAtlas = environmentAtlas;
    app.scene.ambientLight = new pc.Color(0, 0, 0);
  };
  const rebuildEnvironmentBackdropMesh = () => {
    if (environmentBackdropMeshInstance) {
      const previousBackdropMesh = environmentBackdropMeshInstance.mesh;
      const nextBackdropMesh = pc.Mesh.fromGeometry(
        app.graphicsDevice,
        createBackdropGeometry(environmentSettings.projectionCenterHeight, environmentSettings.domeRadius),
      );
      environmentBackdropMeshInstance.mesh = nextBackdropMesh;
      previousBackdropMesh.destroy();
    }
  };
  const applyEnvironmentSettings = () => {
    if (environmentBackdrop) {
      environmentBackdrop.setLocalScale(
        environmentSettings.domeRadius,
        environmentSettings.domeRadius,
        environmentSettings.domeRadius,
      );
      environmentBackdrop.setEulerAngles(0, 0, 0);
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
  };
  const clearEnvironmentVisuals = () => {
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
  };
  let actorAsset: pc.Asset;
  let animationAsset: pc.Asset;
  const animationTracks = new Map<string, unknown>();
  const actors = new Map<string, Blocking3dViewerActor>();
  const sceneMarkerRuntimes = new Map<string, Blocking3dSceneMarkerRuntime>();
  const selectionListeners = new Set<(label: string | null) => void>();
  const markerSelectionListeners = new Set<(id: string | null) => void>();
  const statusListeners = new Set<(status: string) => void>();
  let selectedLabel: string | null = null;
  let selectedMarkerId: string | null = null;
  let cameraState: DramaShotBlockingSketch3DCamera = {
    ...DEFAULT_CAMERA,
    focalPoint: [...DEFAULT_CAMERA.focalPoint],
  };
  let destroyed = false;
  let interactionEnabled = true;
  let actorMovementEnabled = true;
  let dragState: { button: number; pointerId: number; x: number; y: number; mode: "actor" | "camera" | "none"; actorLabel?: string; lastGround?: pc.Vec3 } | null = null;
  let keyboardInput = new Set<string>();
  const changeListeners = new Set<() => void>();

  const setStatus = (status: string) => {
    options.onStatus?.(status);
    for (const listener of statusListeners) listener(status);
  };

  const orbitDistance = () => clamp(cameraState.distance, 0.25, 100);

  const syncCamera = () => {
    if (!cameraEntity.camera) return;
    const elevation = cameraState.elev * pc.math.DEG_TO_RAD;
    const azimuth = cameraState.azim * pc.math.DEG_TO_RAD;
    const distance = orbitDistance();
    const cosElevation = Math.cos(elevation);
    const position = new pc.Vec3(
      cameraState.focalPoint[0] + Math.sin(azimuth) * cosElevation * distance,
      cameraState.focalPoint[1] + Math.sin(-elevation) * distance,
      cameraState.focalPoint[2] + Math.cos(azimuth) * cosElevation * distance,
    );
    cameraEntity.camera.fov = cameraState.fovDeg;
    cameraEntity.camera.nearClip = cameraState.nearClip;
    cameraEntity.camera.farClip = cameraState.farClip;
    cameraFrame.dof.enabled = cameraState.depthOfFieldEnabled;
    cameraFrame.dof.focusDistance = cameraState.focusDistance;
    cameraFrame.dof.focusRange = cameraState.focusRange;
    cameraFrame.dof.blurRadius = cameraState.blurRadius;
    cameraEntity.setPosition(position);
    cameraEntity.setEulerAngles(cameraState.elev, cameraState.azim, 0);
    cameraFrame.update();
  };

  const emitSelection = () => {
    for (const listener of selectionListeners) listener(selectedLabel);
    const actor = selectedLabel ? actors.get(selectedLabel) : null;
    if (actor) {
      const position = actor.entity.getPosition();
      selectionRing.enabled = true;
      selectionRing.setPosition(position.x, 0.008, position.z);
      selectionRing.setLocalScale(Math.max(0.65, actor.entity.getLocalScale().x * 0.85), 1, Math.max(0.65, actor.entity.getLocalScale().z * 0.85));
    } else {
      selectionRing.enabled = false;
    }
  };

  const emitMarkerSelection = () => {
    for (const [id, runtime] of sceneMarkerRuntimes) {
      setSceneMarkerSelected(runtime, id === selectedMarkerId);
    }
    for (const listener of markerSelectionListeners) listener(selectedMarkerId);
  };

  const emitChange = () => {
    for (const listener of changeListeners) listener();
  };

  const select = (label: string | null): boolean => {
    if (label !== null && !actors.has(label)) return false;
    selectedLabel = label;
    if (label !== null) {
      selectedMarkerId = null;
      emitMarkerSelection();
    } else if (selectedMarkerId !== null) {
      selectedMarkerId = null;
      emitMarkerSelection();
    }
    emitSelection();
    return true;
  };

  const selectMarker = (id: string | null): boolean => {
    if (id !== null && !sceneMarkerRuntimes.has(id)) return false;
    selectedMarkerId = id;
    if (id !== null) selectedLabel = null;
    emitMarkerSelection();
    emitSelection();
    return true;
  };

  const setSceneMarkers = (markers: StoryScene3DMarker[]) => {
    const nextIds = new Set<string>();
    for (const marker of markers) {
      if (!marker.id.trim()) continue;
      nextIds.add(marker.id);
      const existing = sceneMarkerRuntimes.get(marker.id);
      if (existing) {
        updateSceneMarkerRuntime(existing, marker, marker.id === selectedMarkerId);
      } else {
        sceneMarkerRuntimes.set(marker.id, createSceneMarkerRuntime(app, marker, marker.id === selectedMarkerId));
      }
    }
    for (const [id, runtime] of sceneMarkerRuntimes) {
      if (nextIds.has(id)) continue;
      destroySceneMarkerRuntime(runtime);
      sceneMarkerRuntimes.delete(id);
    }
    if (selectedMarkerId && !nextIds.has(selectedMarkerId)) {
      selectedMarkerId = null;
      emitMarkerSelection();
    }
  };

  const focusMarker = (id: string): boolean => {
    const runtime = sceneMarkerRuntimes.get(id);
    if (!runtime) return false;
    selectMarker(id);
    const marker = runtime.marker;
    cameraState.focalPoint = [marker.position[0], Math.max(0.5, marker.position[1]), marker.position[2]];
    cameraState.distance = clamp(Math.max(4, Math.max(...marker.size) * 3 + 3), 0.25, 100);
    cameraState.azim = -35;
    cameraState.elev = -12;
    syncCamera();
    return true;
  };

  const selectedActor = () => (selectedLabel ? actors.get(selectedLabel) ?? null : null);

  const moveCamera = (dx: number, dy: number, dz: number) => {
    cameraState.focalPoint = [
      clamp(cameraState.focalPoint[0] + dx, -100, 100),
      clamp(cameraState.focalPoint[1] + dy, -100, 100),
      clamp(cameraState.focalPoint[2] + dz, -100, 100),
    ];
    syncCamera();
  };

  const panCamera = (dx: number, dy: number) => {
    const azimuth = cameraState.azim * pc.math.DEG_TO_RAD;
    const elevation = cameraState.elev * pc.math.DEG_TO_RAD;
    const cosElevation = Math.cos(elevation);
    const screenRight = new pc.Vec3(Math.cos(azimuth), 0, -Math.sin(azimuth));
    const screenUp = new pc.Vec3(
      Math.sin(azimuth) * Math.sin(elevation),
      cosElevation,
      Math.cos(azimuth) * Math.sin(elevation),
    );
    const scale = clamp(orbitDistance() * 0.00125, 0.003, 0.04);
    moveCamera(
      (-screenRight.x * dx + screenUp.x * dy) * scale,
      (-screenRight.y * dx + screenUp.y * dy) * scale,
      (-screenRight.z * dx + screenUp.z * dy) * scale,
    );
  };

  const onPointerDown = (event: PointerEvent) => {
    if (destroyed || !interactionEnabled) return;
    canvas.focus();
    const hit = event.button === 0 ? pickActor(event.clientX, event.clientY) : null;
    const markerHit = event.button === 0 && !hit
      ? pickSceneMarker(sceneMarkerRuntimes.values(), screenRay(event.clientX, event.clientY))
      : null;
    if (hit) select(hit);
    else if (markerHit) selectMarker(markerHit);
    dragState = {
      button: event.button,
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      mode: hit && selectedLabel === hit && actorMovementEnabled ? "actor" : event.button === 2 ? "camera" : "none",
      actorLabel: hit ?? undefined,
      lastGround: hit ? raycastGround(event.clientX, event.clientY) ?? undefined : undefined,
    };
    canvas.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: PointerEvent) => {
    if (!interactionEnabled || !dragState || event.pointerId !== dragState.pointerId) return;
    const dx = event.clientX - dragState.x;
    const dy = event.clientY - dragState.y;
    dragState.x = event.clientX;
    dragState.y = event.clientY;
    if (dragState.mode === "actor" && dragState.actorLabel) {
      const actor = actors.get(dragState.actorLabel);
      const previousGround = dragState.lastGround;
      const nextGround = raycastGround(event.clientX, event.clientY);
      if (actor && previousGround && nextGround) {
        const position = actor.entity.getPosition();
        actor.entity.setPosition(
          clamp(position.x + nextGround.x - previousGround.x, -100, 100),
          position.y,
          clamp(position.z + nextGround.z - previousGround.z, -100, 100),
        );
        dragState.lastGround = nextGround;
        emitSelection();
        emitChange();
      }
    } else if (dragState.button === 2) {
      cameraState.azim = updateBlocking3dCameraAzimuth(cameraState.azim, dx);
      cameraState.elev = clamp(cameraState.elev + dy * 0.25, -89, 89);
      syncCamera();
      emitChange();
    } else if (dragState.button === 1) {
      panCamera(dx, dy);
      emitChange();
    }
  };

  const onPointerUp = (event: PointerEvent) => {
    if (!dragState || event.pointerId !== dragState.pointerId) return;
    const dx = event.clientX - dragState.x;
    const dy = event.clientY - dragState.y;
    const button = dragState.button;
    dragState = null;
    try { canvas.releasePointerCapture(event.pointerId); } catch { /* no-op */ }
    if (button === 0 && Math.hypot(dx, dy) < 6) {
      const hit = pickActor(event.clientX, event.clientY);
      if (hit) {
        select(hit);
      } else {
        const markerHit = pickSceneMarker(sceneMarkerRuntimes.values(), screenRay(event.clientX, event.clientY));
        if (markerHit) selectMarker(markerHit);
        else select(null);
      }
    }
  };

  const onWheel = (event: WheelEvent) => {
    if (!interactionEnabled) return;
    event.preventDefault();
    cameraState.distance = clamp(cameraState.distance * (event.deltaY > 0 ? 1.08 : 0.92), 0.25, 100);
    syncCamera();
    emitChange();
  };

  const onContextMenu = (event: MouseEvent) => event.preventDefault();
  const onKeyDown = (event: KeyboardEvent) => {
    if (!interactionEnabled || document.activeElement !== canvas) return;
    keyboardInput.add(event.key.toLowerCase());
    if (["w", "a", "s", "d", "q", "e", " "].includes(event.key.toLowerCase())) event.preventDefault();
  };
  const onKeyUp = (event: KeyboardEvent) => keyboardInput.delete(event.key.toLowerCase());
  const onBlur = () => { keyboardInput = new Set(); };

  const screenRay = (clientX: number, clientY: number): pc.Ray | null => {
    if (!cameraEntity.camera) return null;
    const rect = canvas.getBoundingClientRect();
    const start = cameraEntity.getPosition().clone();
    const end = cameraEntity.camera.screenToWorld(clientX - rect.left, clientY - rect.top, 1);
    const direction = end.sub(start);
    if (direction.lengthSq() < 1e-8) return null;
    return new pc.Ray(start, direction.normalize());
  };

  const raycastGround = (clientX: number, clientY: number): pc.Vec3 | null => {
    const ray = screenRay(clientX, clientY);
    if (!ray || Math.abs(ray.direction.y) < 1e-5) return null;
    const distance = -ray.origin.y / ray.direction.y;
    if (!Number.isFinite(distance) || distance <= 0) return null;
    return new pc.Vec3(
      ray.origin.x + ray.direction.x * distance,
      0,
      ray.origin.z + ray.direction.z * distance,
    );
  };

  function pickActor(clientX: number, clientY: number): string | null {
    const ray = screenRay(clientX, clientY);
    if (!ray) return null;
    let closest: { label: string; distance: number } | null = null;
    const hit = new pc.Vec3();
    for (const actor of actors.values()) {
      for (const render of actor.entity.findComponents("render") as pc.RenderComponent[]) {
        for (const mesh of render.meshInstances ?? []) {
          if (!mesh.aabb.intersectsRay(ray, hit)) continue;
          const distance = hit.distance(ray.origin);
          if (!closest || distance < closest.distance) closest = { label: actor.label, distance };
        }
      }
    }
    return closest?.label ?? null;
  }

  const handleKeyboardCamera = (dt: number) => {
    const speed = keyboardInput.has("shift") ? 6 : 2;
    const amount = speed * dt;
    if (keyboardInput.has("w")) moveCamera(0, 0, -amount);
    if (keyboardInput.has("s")) moveCamera(0, 0, amount);
    if (keyboardInput.has("a")) moveCamera(-amount, 0, 0);
    if (keyboardInput.has("d")) moveCamera(amount, 0, 0);
    if (keyboardInput.has("q")) moveCamera(0, -amount, 0);
    if (keyboardInput.has("e")) moveCamera(0, amount, 0);
  };

  canvas.tabIndex = 0;
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("wheel", onWheel, { passive: false });
  canvas.addEventListener("contextmenu", onContextMenu);
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", onBlur);

  const resize = () => {
    const rect = canvas.parentElement?.getBoundingClientRect();
    if (!rect) return;
    app.graphicsDevice.maxPixelRatio = Math.min(window.devicePixelRatio || 1, MAX_DEVICE_PIXEL_RATIO);
    app.resizeCanvas(rect.width, rect.height);
  };
  resize();
  const resizeObserver = new ResizeObserver(resize);
  if (canvas.parentElement) resizeObserver.observe(canvas.parentElement);

  app.on("update", (dt: number) => {
    cameraFrame.update();
    const hadKeyboardInput = keyboardInput.size > 0;
    handleKeyboardCamera(Math.min(0.1, dt));
    if (hadKeyboardInput) emitChange();
    for (const line of gridLines) app.drawLine(line.start, line.end, line.color, false);
    drawSceneMarkerOutlines(app, sceneMarkerRuntimes.values(), selectedMarkerId);
    const actor = selectedActor();
    if (actor) {
      const position = actor.entity.getPosition();
      selectionRing.setPosition(position.x, 0.008, position.z);
    }
  });
  setSceneMarkers(options.sceneMarkers ?? []);
  app.start();
  syncCamera();

  try {
    setStatus("正在加载 3D 代理角色...");
    [actorAsset, animationAsset] = await Promise.all([
      loadAsset(app, ACTOR_PROXY_URL, "container"),
      loadAsset(app, ACTOR_ANIMATION_URL, "container"),
    ]);
    const proxyResource = actorAsset.resource as ContainerResource;
    const animationResources = [
      ...(proxyResource.animations ?? []),
      ...(((animationAsset.resource as ContainerResource).animations ?? [])),
    ];
    for (const clipAsset of animationResources) {
      const track = clipAsset.resource;
      const name = (track as { name?: unknown } | null | undefined)?.name;
      if (track && typeof name === "string") animationTracks.set(name, track);
    }
    if (!animationTracks.has("Idle_Loop")) throw new Error("3D 代理角色缺少基础待机动作。");
    setStatus("3D 草图已就绪");
  } catch (error) {
    resizeObserver.disconnect();
    canvas.removeEventListener("pointerdown", onPointerDown);
    canvas.removeEventListener("pointermove", onPointerMove);
    canvas.removeEventListener("pointerup", onPointerUp);
    canvas.removeEventListener("wheel", onWheel);
    canvas.removeEventListener("contextmenu", onContextMenu);
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
    window.removeEventListener("blur", onBlur);
    app.destroy();
    throw error instanceof Error ? error : new Error(String(error));
  }

  const createActor = (
    label: string,
    index: number,
    heightMeters = DEFAULT_BLOCKING_3D_HEIGHT_METERS,
    initialPosition?: Blocking3dActorPosition,
  ): Blocking3dViewerActor => {
    const resource = actorAsset.resource as ContainerResource;
    const model = resource.instantiateRenderEntity?.({ castShadows: false });
    if (!model) throw new Error("3D 代理角色模型无法实例化。");
    const color = colorForIndex(index);
    const root = new pc.Entity(`blocking3d-actor-${label}`);
    model.name = "quaternius_mannequin";
    model.setLocalPosition(0, 0, 0);
    model.setLocalEulerAngles(0, 180, 0);
    const material = setEntityMaterial(model, color);
    root.addChild(model);
    model.addComponent("anim", { activate: true });
    if (model.anim) model.anim.rootBone = model;
    const placement = initialPosition ?? [(index - 1) * 1.6, 0, 0];
    root.setPosition(placement[0], placement[1], placement[2]);
    root.setEulerAngles(0, 180, 0);
    const normalizedHeightMeters = normalizeBlocking3dHeight(heightMeters);
    const proxyScale = heightToBlocking3dScale(normalizedHeightMeters);
    root.setLocalScale(proxyScale, proxyScale, proxyScale);
    app.root.addChild(root);
    const actor: Blocking3dViewerActor = {
      label,
      heightMeters: normalizedHeightMeters,
      entity: root,
      animEntity: model,
      pose: "standing",
      actionPlaying: false,
      color,
      material,
    };
    setAnimationPose(actor, animationTracks, "standing");
    return actor;
  };

  const fitView = () => {
    const values = [...actors.values()];
    if (!values.length) {
      cameraState = { ...DEFAULT_CAMERA, focalPoint: [...DEFAULT_CAMERA.focalPoint] };
      syncCamera();
      emitChange();
      return;
    }
    const minX = Math.min(...values.map((actor) => actor.entity.getPosition().x));
    const maxX = Math.max(...values.map((actor) => actor.entity.getPosition().x));
    const minZ = Math.min(...values.map((actor) => actor.entity.getPosition().z));
    const maxZ = Math.max(...values.map((actor) => actor.entity.getPosition().z));
    cameraState.focalPoint = [(minX + maxX) / 2, 0.8, (minZ + maxZ) / 2];
    cameraState.distance = clamp(Math.max(5, Math.max(maxX - minX, maxZ - minZ) * 2.3 + 4), 0.25, 100);
    cameraState.azim = -35;
    cameraState.elev = -12;
    syncCamera();
    emitChange();
  };

  const viewer: Blocking3dViewer = {
    canvas,
    onSelectionChange(listener) {
      selectionListeners.add(listener);
      listener(selectedLabel);
      return () => selectionListeners.delete(listener);
    },
    onMarkerSelection(listener) {
      markerSelectionListeners.add(listener);
      listener(selectedMarkerId);
      return () => markerSelectionListeners.delete(listener);
    },
    onChange(listener) {
      changeListeners.add(listener);
      return () => changeListeners.delete(listener);
    },
    onStatus(listener) {
      statusListeners.add(listener);
      return () => statusListeners.delete(listener);
    },
    addActor(label, index, heightMeters = DEFAULT_BLOCKING_3D_HEIGHT_METERS, initialPosition) {
      if (!label.trim() || actors.has(label)) return false;
      const actor = createActor(label.trim(), index, heightMeters, initialPosition);
      actors.set(label.trim(), actor);
      if (!selectedLabel) select(label.trim());
      emitChange();
      return true;
    },
    removeActor(label) {
      const actor = actors.get(label);
      if (!actor) return false;
      actor.entity.destroy();
      actors.delete(label);
      if (selectedLabel === label) select(null);
      emitChange();
      return true;
    },
    selectActor(label) {
      return select(label);
    },
    selectMarker,
    focusMarker,
    getSelectedMarker: () => selectedMarkerId,
    setSceneMarkers,
    getSceneMarkers: () => [...sceneMarkerRuntimes.values()].map((runtime) => runtime.marker),
    getSelectedActor: () => selectedLabel,
    getSelectedTransform() {
      const actor = selectedActor();
      if (!actor) return null;
      const position = actor.entity.getPosition();
      const rotation = actor.entity.getEulerAngles();
      const scale = actor.entity.getLocalScale();
      return {
        position: [position.x, position.y, position.z] as [number, number, number],
        yawDeg: clamp(rotation.y, -180, 180),
        scale: [scale.x, scale.y, scale.z] as [number, number, number],
      };
    },
    getActorLabels: () => [...actors.keys()],
    setSelectedPose(pose) {
      const actor = selectedActor();
      if (!actor) return false;
      setAnimationPose(actor, animationTracks, pose);
      emitSelection();
      emitChange();
      return true;
    },
    getSelectedPose: () => selectedActor()?.pose ?? null,
    setSelectedColor(color) {
      const actor = selectedActor();
      if (!actor || color.some((channel) => !Number.isFinite(channel))) return false;
      const nextColor = normalizeActorColor(color);
      actor.color = nextColor;
      actor.material = setEntityMaterial(actor.animEntity, nextColor, actor.material);
      emitChange();
      return true;
    },
    getSelectedColor() {
      const color = selectedActor()?.color;
      return color ? [...color] as [number, number, number] : null;
    },
    nudgeSelected(dx, dy, dz) {
      if (!actorMovementEnabled) return false;
      const actor = selectedActor();
      if (!actor) return false;
      const position = actor.entity.getPosition();
      actor.entity.setPosition(
        clamp(position.x + dx, -100, 100),
        clamp(position.y + dy, 0, 50),
        clamp(position.z + dz, -100, 100),
      );
      emitSelection();
      emitChange();
      return true;
    },
    rotateSelected(degrees) {
      const actor = selectedActor();
      if (!actor) return false;
      const current = actor.entity.getEulerAngles();
      actor.entity.setEulerAngles(current.x, clamp(current.y + degrees, -180, 180), current.z);
      emitChange();
      return true;
    },
    groundSelected() {
      if (!actorMovementEnabled) return false;
      const actor = selectedActor();
      if (!actor) return false;
      const position = actor.entity.getPosition();
      actor.entity.setPosition(position.x, 0, position.z);
      emitSelection();
      emitChange();
      return true;
    },
    fitView,
    resetCamera() {
      cameraState = { ...DEFAULT_CAMERA, focalPoint: [...DEFAULT_CAMERA.focalPoint] };
      syncCamera();
      emitChange();
    },
    setCameraState(next) {
      cameraState = normalizeCamera(next);
      syncCamera();
    },
    getCameraState() {
      return { ...cameraState, focalPoint: [...cameraState.focalPoint] };
    },
    setInteractionEnabled(enabled) {
      interactionEnabled = enabled;
      if (!enabled) {
        dragState = null;
        keyboardInput = new Set();
      }
    },
    setActorMovementEnabled(enabled) {
      actorMovementEnabled = enabled;
      if (!enabled && dragState?.mode === "actor") dragState = null;
    },
    async setEnvironment(url) {
      const requestId = ++environmentRequestId;
      ground.enabled = true;
      clearEnvironmentLighting();
      clearEnvironmentVisuals();
      if (!url?.trim()) return;
      setStatus("正在加载场景 HDRI 环境...");
      let asset: pc.Asset;
      try {
        asset = await loadAsset(app, url, "texture");
      } catch (error) {
        if (!isCurrentEnvironmentRequest(requestId)) return;
        throw error;
      }
      if (!isCurrentEnvironmentRequest(requestId)) {
        discardEnvironmentAsset(asset);
        return;
      }
      environmentAsset = asset;
      try {
        const texture = asset.resource as pc.Texture;
        configureEnvironmentTexture(texture, app);
        applyEnvironmentLighting(texture);
        const projectionCube = createVisibleHdriCubemap(app, texture);
        if (!isCurrentEnvironmentRequest(requestId)) {
          projectionCube.destroy();
          return;
        }
        environmentProjectionCube = projectionCube;
        // EnviroDome uses one continuous surface for the sky and the floor.
        // Sharing the equator ring is important: two independent draw calls
        // can leave a raster gap even when their positions appear identical.
        const mesh = pc.Mesh.fromGeometry(
          app.graphicsDevice,
          createBackdropGeometry(environmentSettings.projectionCenterHeight, environmentSettings.domeRadius),
        );
        const material = createProjectedHdriMaterial(projectionCube, environmentSettings);
        environmentMaterial = material;
        const meshInstance = new pc.MeshInstance(mesh, material);
        environmentBackdropMeshInstance = meshInstance;
        environmentBackdrop = new pc.Entity("blocking3d-hdri-backdrop");
        environmentBackdrop.addComponent("render", {
          meshInstances: [meshInstance],
          layers: [pc.LAYERID_WORLD],
        });
        environmentBackdrop.setPosition(environmentWorldPosition);
        app.root.addChild(environmentBackdrop);
        applyEnvironmentSettings();
        ground.enabled = false;
        setStatus("3D 草图已就绪");
      } catch (error) {
        if (isCurrentEnvironmentRequest(requestId)) {
          clearEnvironmentLighting();
          clearEnvironmentVisuals();
          ground.enabled = true;
        }
        throw error;
      }
    },
    getEnvironmentSettings() {
      return { ...environmentSettings };
    },
    setEnvironmentSettings(settings) {
      environmentSettings = normalizeEnvironmentSettings(settings);
      applyEnvironmentSettings();
      rebuildEnvironmentBackdropMesh();
      emitChange();
      return true;
    },
    exportLayout() {
      return {
        schemaVersion: 1,
        engine: "playcanvas",
        camera: viewer.getCameraState(),
        environment: viewer.getEnvironmentSettings(),
        actors: [...actors.values()].map((actor) => {
          const position = actor.entity.getPosition();
          const scale = actor.entity.getLocalScale();
          return {
            characterName: actor.label,
            heightMeters: actor.heightMeters,
            position: [position.x, position.y, position.z] as [number, number, number],
            yawDeg: clamp(actor.entity.getEulerAngles().y, -180, 180),
            scale: [scale.x, scale.y, scale.z] as [number, number, number],
            pose: actor.pose,
            color: [...actor.color] as [number, number, number],
            actionPlaying: false,
          };
        }),
      };
    },
    loadLayout(layout) {
      environmentSettings = normalizeEnvironmentSettings(layout.environment);
      applyEnvironmentSettings();
      rebuildEnvironmentBackdropMesh();
      viewer.setCameraState(layout.camera);
      for (const saved of layout.actors) {
        const actor = actors.get(saved.characterName);
        if (!actor) continue;
        actor.entity.setPosition(saved.position[0], saved.position[1], saved.position[2]);
        actor.entity.setEulerAngles(0, saved.yawDeg, 0);
        const scale = scaleSavedActorForCurrentHeight(
          saved.scale,
          saved.heightMeters,
          actor.heightMeters,
        );
        actor.entity.setLocalScale(scale[0], scale[1], scale[2]);
        if (saved.color) {
          actor.color = normalizeActorColor(saved.color);
          actor.material = setEntityMaterial(actor.animEntity, actor.color, actor.material);
        }
        setAnimationPose(actor, animationTracks, saved.pose);
      }
      if (layout.actors[0]) select(layout.actors[0].characterName);
      emitSelection();
    },
    capturePng() {
      app.resizeCanvas(BLOCKING_SKETCH_CAPTURE_SIZE.width, BLOCKING_SKETCH_CAPTURE_SIZE.height);
      app.render();
      try {
        const dataUrl = canvas.toDataURL("image/png");
        const base64 = dataUrl.split(",", 2)[1] ?? "";
        const binary = window.atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
        return new Blob([bytes], { type: "image/png" });
      } finally {
        resize();
        app.render();
      }
    },
    destroy() {
      if (destroyed) return;
      environmentRequestId += 1;
      destroyed = true;
      resizeObserver.disconnect();
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("contextmenu", onContextMenu);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      for (const actor of actors.values()) actor.entity.destroy();
      actors.clear();
      for (const runtime of sceneMarkerRuntimes.values()) destroySceneMarkerRuntime(runtime);
      sceneMarkerRuntimes.clear();
      clearEnvironmentVisuals();
      clearEnvironmentLighting();
      cameraFrame.destroy();
      selectionRing.destroy();
      selectionMesh.destroy();
      app.destroy();
    },
  };

  try {
    if (options.environmentUrl) await viewer.setEnvironment(options.environmentUrl);
    return viewer;
  } catch (error) {
    viewer.destroy();
    throw error instanceof Error ? error : new Error(String(error));
  }
}
