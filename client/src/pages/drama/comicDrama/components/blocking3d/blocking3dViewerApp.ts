import * as pc from "playcanvas";

import type {
  DramaShotBlockingSketch3DActor,
  DramaShotBlockingSketch3DCamera,
  DramaShotBlockingSketchPose,
} from "@/api/media/drama";
import { resolveBlocking3dPoseClip } from "./blocking3dPose";

const ACTOR_PROXY_URL = "/viewer-kit/quaternius/ual2/UAL2_Standard.glb";
const ACTOR_ANIMATION_URL = "/viewer-kit/quaternius/ual1/UAL1_Standard.glb";
const MAX_DEVICE_PIXEL_RATIO = 1.5;
const DEFAULT_FOV = 52;
export const BLOCKING_SKETCH_CAPTURE_SIZE = {
  width: 1280,
  height: 720,
} as const;
const DEFAULT_CAMERA: DramaShotBlockingSketch3DCamera = {
  azim: -45,
  elev: -12,
  distance: 8,
  focalPoint: [0, 0.8, 0],
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
  entity: pc.Entity;
  animEntity: pc.Entity;
  pose: DramaShotBlockingSketchPose;
  actionPlaying: boolean;
  color: [number, number, number];
}

export interface Blocking3dViewerOptions {
  canvas: HTMLCanvasElement;
  environmentUrl?: string | null;
  onStatus?: (status: string) => void;
}

export interface Blocking3dViewer {
  readonly canvas: HTMLCanvasElement;
  onSelectionChange: (listener: (label: string | null) => void) => () => void;
  onChange: (listener: () => void) => () => void;
  onStatus: (listener: (status: string) => void) => () => void;
  addActor: (label: string, index: number) => boolean;
  removeActor: (label: string) => boolean;
  selectActor: (label: string | null) => boolean;
  getSelectedActor: () => string | null;
  getSelectedTransform: () => {
    position: [number, number, number];
    yawDeg: number;
    scale: [number, number, number];
  } | null;
  getActorLabels: () => string[];
  setSelectedPose: (pose: DramaShotBlockingSketchPose) => boolean;
  getSelectedPose: () => DramaShotBlockingSketchPose | null;
  nudgeSelected: (dx: number, dy: number, dz: number) => boolean;
  rotateSelected: (degrees: number) => boolean;
  scaleSelected: (factor: number) => boolean;
  groundSelected: () => boolean;
  fitView: () => void;
  resetCamera: () => void;
  setCameraState: (camera: DramaShotBlockingSketch3DCamera) => void;
  getCameraState: () => DramaShotBlockingSketch3DCamera;
  setInteractionEnabled: (enabled: boolean) => void;
  setEnvironment: (url: string | null) => Promise<void>;
  exportLayout: () => {
    schemaVersion: 1;
    engine: "playcanvas";
    camera: DramaShotBlockingSketch3DCamera;
    actors: DramaShotBlockingSketch3DActor[];
  };
  loadLayout: (layout: {
    schemaVersion: 1;
    engine: "playcanvas";
    camera: DramaShotBlockingSketch3DCamera;
    actors: DramaShotBlockingSketch3DActor[];
  }) => void;
  capturePng: () => Blob;
  destroy: () => void;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizeCamera(input: DramaShotBlockingSketch3DCamera): DramaShotBlockingSketch3DCamera {
  const numberOr = (value: unknown, fallback: number): number => {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
  };
  return {
    azim: clamp(numberOr(input.azim, 0), -180, 180),
    elev: clamp(numberOr(input.elev, 0), -89, 89),
    distance: clamp(numberOr(input.distance, DEFAULT_CAMERA.distance), 0.25, 100),
    focalPoint: [
      clamp(numberOr(input.focalPoint?.[0], 0), -100, 100),
      clamp(numberOr(input.focalPoint?.[1], 0.8), -100, 100),
      clamp(numberOr(input.focalPoint?.[2], 0), -100, 100),
    ],
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

function setEntityMaterial(entity: pc.Entity, color: [number, number, number]): void {
  const material = new pc.StandardMaterial();
  material.diffuse = new pc.Color(color[0], color[1], color[2]);
  material.metalness = 0;
  material.update();
  for (const render of entity.findComponents("render") as pc.RenderComponent[]) {
    for (const mesh of render.meshInstances ?? []) mesh.material = material;
  }
  for (const model of entity.findComponents("model") as pc.ModelComponent[]) {
    for (const mesh of model.meshInstances ?? []) mesh.material = material;
  }
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

  const cameraEntity = new pc.Entity("blocking3d-camera");
  cameraEntity.addComponent("camera", {
    clearColor: new pc.Color(0.05, 0.07, 0.1),
    fov: DEFAULT_FOV,
    nearClip: 0.05,
    farClip: 200,
  });
  app.root.addChild(cameraEntity);

  const light = new pc.Entity("blocking3d-key-light");
  light.addComponent("light", {
    type: "directional",
    color: new pc.Color(1, 0.95, 0.88),
    intensity: 1.4,
  });
  light.setEulerAngles(45, 35, 0);
  app.root.addChild(light);

  const fill = new pc.Entity("blocking3d-fill-light");
  fill.addComponent("light", {
    type: "omni",
    color: new pc.Color(0.65, 0.76, 1),
    intensity: 0.35,
    range: 20,
  });
  fill.setPosition(-3, 4, 5);
  app.root.addChild(fill);

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

  const selectionRing = new pc.Entity("blocking3d-selection-ring");
  selectionRing.addComponent("render", {
    type: "cylinder",
    material: createMaterial(new pc.Color(0.9, 0.68, 0.22), 0.65),
  });
  selectionRing.setLocalScale(0.9, 0.018, 0.9);
  selectionRing.enabled = false;
  app.root.addChild(selectionRing);

  let environmentDome: pc.Entity | null = null;
  let environmentAsset: pc.Asset | null = null;
  let actorAsset: pc.Asset;
  let animationAsset: pc.Asset;
  const animationTracks = new Map<string, unknown>();
  const actors = new Map<string, Blocking3dViewerActor>();
  const selectionListeners = new Set<(label: string | null) => void>();
  const statusListeners = new Set<(status: string) => void>();
  let selectedLabel: string | null = null;
  let cameraState: DramaShotBlockingSketch3DCamera = {
    ...DEFAULT_CAMERA,
    focalPoint: [...DEFAULT_CAMERA.focalPoint],
  };
  let destroyed = false;
  let interactionEnabled = true;
  let dragState: { button: number; pointerId: number; x: number; y: number; mode: "actor" | "camera" | "none"; actorLabel?: string; lastGround?: pc.Vec3 } | null = null;
  let keyboardInput = new Set<string>();
  const changeListeners = new Set<() => void>();

  const setStatus = (status: string) => {
    options.onStatus?.(status);
    for (const listener of statusListeners) listener(status);
  };

  const orbitDistance = () => clamp(cameraState.distance, 0.25, 100);

  const syncCamera = () => {
    const elevation = cameraState.elev * pc.math.DEG_TO_RAD;
    const azimuth = cameraState.azim * pc.math.DEG_TO_RAD;
    const distance = orbitDistance();
    const cosElevation = Math.cos(elevation);
    const position = new pc.Vec3(
      cameraState.focalPoint[0] + Math.sin(azimuth) * cosElevation * distance,
      cameraState.focalPoint[1] + Math.sin(-elevation) * distance,
      cameraState.focalPoint[2] + Math.cos(azimuth) * cosElevation * distance,
    );
    cameraEntity.setPosition(position);
    cameraEntity.setEulerAngles(cameraState.elev, cameraState.azim, 0);
  };

  const emitSelection = () => {
    for (const listener of selectionListeners) listener(selectedLabel);
    const actor = selectedLabel ? actors.get(selectedLabel) : null;
    if (actor) {
      const position = actor.entity.getPosition();
      selectionRing.enabled = true;
      selectionRing.setPosition(position.x, 0.008, position.z);
      selectionRing.setLocalScale(Math.max(0.65, actor.entity.getLocalScale().x * 0.85), 0.018, Math.max(0.65, actor.entity.getLocalScale().z * 0.85));
    } else {
      selectionRing.enabled = false;
    }
  };

  const emitChange = () => {
    for (const listener of changeListeners) listener();
  };

  const select = (label: string | null): boolean => {
    if (label !== null && !actors.has(label)) return false;
    selectedLabel = label;
    emitSelection();
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

  const onPointerDown = (event: PointerEvent) => {
    if (destroyed || !interactionEnabled) return;
    canvas.focus();
    const hit = event.button === 0 ? pickActor(event.clientX, event.clientY) : null;
    if (hit) select(hit);
    dragState = {
      button: event.button,
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      mode: hit && selectedLabel === hit ? "actor" : event.button === 2 ? "camera" : "none",
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
      cameraState.azim = clamp(cameraState.azim - dx * 0.35, -180, 180);
      cameraState.elev = clamp(cameraState.elev + dy * 0.25, -89, 89);
      syncCamera();
      emitChange();
    } else if (dragState.button === 1) {
      moveCamera(-dx * 0.01, dy * 0.01, 0);
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
      select(hit);
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
    const hadKeyboardInput = keyboardInput.size > 0;
    handleKeyboardCamera(Math.min(0.1, dt));
    if (hadKeyboardInput) emitChange();
    if (environmentDome) environmentDome.setPosition(cameraEntity.getPosition());
    for (const line of gridLines) app.drawLine(line.start, line.end, line.color, false);
    const actor = selectedActor();
    if (actor) {
      const position = actor.entity.getPosition();
      selectionRing.setPosition(position.x, 0.008, position.z);
    }
  });
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

  const createActor = (label: string, index: number): Blocking3dViewerActor => {
    const resource = actorAsset.resource as ContainerResource;
    const model = resource.instantiateRenderEntity?.({ castShadows: false });
    if (!model) throw new Error("3D 代理角色模型无法实例化。");
    const root = new pc.Entity(`blocking3d-actor-${label}`);
    model.name = "quaternius_mannequin";
    model.setLocalPosition(0, 0, 0);
    model.setLocalEulerAngles(0, 180, 0);
    setEntityMaterial(model, colorForIndex(index));
    root.addChild(model);
    model.addComponent("anim", { activate: true });
    if (model.anim) model.anim.rootBone = model;
    root.setPosition((index - 1) * 1.6, 0, 0);
    root.setEulerAngles(0, 180, 0);
    app.root.addChild(root);
    const actor: Blocking3dViewerActor = {
      label,
      entity: root,
      animEntity: model,
      pose: "standing",
      actionPlaying: false,
      color: colorForIndex(index),
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
    onChange(listener) {
      changeListeners.add(listener);
      return () => changeListeners.delete(listener);
    },
    onStatus(listener) {
      statusListeners.add(listener);
      return () => statusListeners.delete(listener);
    },
    addActor(label, index) {
      if (!label.trim() || actors.has(label)) return false;
      const actor = createActor(label.trim(), index);
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
    nudgeSelected(dx, dy, dz) {
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
    scaleSelected(factor) {
      const actor = selectedActor();
      if (!actor) return false;
      const current = actor.entity.getLocalScale();
      const next = clamp(current.x * factor, 0.1, 10);
      actor.entity.setLocalScale(next, next, next);
      emitSelection();
      emitChange();
      return true;
    },
    groundSelected() {
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
    async setEnvironment(url) {
      if (environmentDome) {
        environmentDome.destroy();
        environmentDome = null;
      }
      if (environmentAsset) {
        app.assets.remove(environmentAsset);
        environmentAsset = null;
      }
      if (!url?.trim()) return;
      setStatus("正在加载场景 HDRI 环境...");
      environmentAsset = await loadAsset(app, url, "texture");
      const texture = environmentAsset.resource as pc.Texture;
      const geometry = new pc.DomeGeometry({ latitudeBands: 40, longitudeBands: 64 });
      const mesh = pc.Mesh.fromGeometry(app.graphicsDevice, geometry);
      const material = new pc.StandardMaterial();
      material.diffuse = new pc.Color(1, 1, 1);
      material.diffuseMap = texture;
      material.emissive = new pc.Color(1, 1, 1);
      material.emissiveMap = texture;
      material.cull = pc.CULLFACE_FRONT;
      material.depthWrite = false;
      material.update();
      const meshInstance = new pc.MeshInstance(mesh, material);
      environmentDome = new pc.Entity("blocking3d-hdri-dome");
      environmentDome.addComponent("render", {
        meshInstances: [meshInstance],
        layers: [pc.LAYERID_SKYBOX],
      });
      environmentDome.setLocalScale(180, 180, 180);
      environmentDome.setPosition(cameraEntity.getPosition());
      app.root.addChild(environmentDome);
      setStatus("3D 草图已就绪");
    },
    exportLayout() {
      return {
        schemaVersion: 1,
        engine: "playcanvas",
        camera: viewer.getCameraState(),
        actors: [...actors.values()].map((actor) => {
          const position = actor.entity.getPosition();
          const scale = actor.entity.getLocalScale();
          return {
            characterName: actor.label,
            position: [position.x, position.y, position.z] as [number, number, number],
            yawDeg: clamp(actor.entity.getEulerAngles().y, -180, 180),
            scale: [scale.x, scale.y, scale.z] as [number, number, number],
            pose: actor.pose,
            actionPlaying: false,
          };
        }),
      };
    },
    loadLayout(layout) {
      viewer.setCameraState(layout.camera);
      for (const saved of layout.actors) {
        const actor = actors.get(saved.characterName);
        if (!actor) continue;
        actor.entity.setPosition(saved.position[0], saved.position[1], saved.position[2]);
        actor.entity.setEulerAngles(0, saved.yawDeg, 0);
        actor.entity.setLocalScale(saved.scale[0], saved.scale[1], saved.scale[2]);
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
      environmentDome?.destroy();
      environmentAsset && app.assets.remove(environmentAsset);
      selectionRing.destroy();
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
