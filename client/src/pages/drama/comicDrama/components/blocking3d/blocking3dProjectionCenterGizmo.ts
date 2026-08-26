import * as pc from "playcanvas";

export interface Blocking3dProjectionCenterGizmoSettings {
  projectionCenterHeight: number;
  domeRadius: number;
}

export interface Blocking3dProjectionCenterGizmoRuntime {
  entity: pc.Entity;
  material: pc.StandardMaterial;
  size: number;
  height: number;
}

const GIZMO_COLOR = new pc.Color(0.14, 0.84, 1, 0.82);
const GIZMO_EDGE_COLOR = new pc.Color(0.34, 0.94, 1, 0.98);
const MIN_GIZMO_SIZE = 0.28;
const MAX_GIZMO_SIZE = 0.5;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function finiteOr(value: unknown, fallback: number): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function resolveGizmoSize(domeRadius: number): number {
  return clamp(finiteOr(domeRadius, 15) * 0.035, MIN_GIZMO_SIZE, MAX_GIZMO_SIZE);
}

export function createProjectionCenterGizmo(
  app: pc.AppBase,
  settings: Blocking3dProjectionCenterGizmoSettings,
): Blocking3dProjectionCenterGizmoRuntime {
  const material = new pc.StandardMaterial();
  material.diffuse = GIZMO_COLOR.clone();
  material.emissive = GIZMO_COLOR.clone();
  material.emissiveIntensity = 0.8;
  material.opacity = GIZMO_COLOR.a;
  material.blendType = pc.BLEND_NORMAL;
  material.depthWrite = false;
  material.depthTest = false;
  material.useLighting = false;
  material.useSkybox = false;
  material.cull = pc.CULLFACE_NONE;
  material.update();

  const entity = new pc.Entity("blocking3d-projection-center-gizmo");
  entity.addComponent("render", {
    type: "box",
    material,
    layers: [pc.LAYERID_WORLD],
  });
  app.root.addChild(entity);
  const runtime: Blocking3dProjectionCenterGizmoRuntime = {
    entity,
    material,
    size: resolveGizmoSize(settings.domeRadius),
    height: 0,
  };
  updateProjectionCenterGizmo(runtime, settings);
  return runtime;
}

export function updateProjectionCenterGizmo(
  runtime: Blocking3dProjectionCenterGizmoRuntime,
  settings: Blocking3dProjectionCenterGizmoSettings,
): void {
  runtime.height = Math.max(0, finiteOr(settings.projectionCenterHeight, 2));
  runtime.size = resolveGizmoSize(settings.domeRadius);
  runtime.entity.setPosition(0, runtime.height, 0);
  runtime.entity.setLocalScale(runtime.size, runtime.size, runtime.size);
}

function cubeCorners(runtime: Blocking3dProjectionCenterGizmoRuntime): pc.Vec3[] {
  const half = runtime.size / 2;
  const corners: pc.Vec3[] = [];
  for (const y of [-half, half]) {
    for (const z of [-half, half]) {
      for (const x of [-half, half]) {
        corners.push(new pc.Vec3(x, runtime.height + y, z));
      }
    }
  }
  return corners;
}

const CUBE_EDGES: Array<[number, number]> = [
  [0, 1], [2, 3], [4, 5], [6, 7],
  [0, 2], [1, 3], [4, 6], [5, 7],
  [0, 4], [1, 5], [2, 6], [3, 7],
];

/** Draw only the reference axes; the cube itself is a non-pickable entity. */
export function drawProjectionCenterGizmo(
  app: pc.AppBase,
  runtime: Blocking3dProjectionCenterGizmoRuntime,
): void {
  const center = new pc.Vec3(0, runtime.height, 0);
  app.drawLine(new pc.Vec3(0, 0.01, 0), center, GIZMO_EDGE_COLOR, false);
  const groundHalf = runtime.size * 0.72;
  app.drawLine(
    new pc.Vec3(-groundHalf, 0.01, 0),
    new pc.Vec3(groundHalf, 0.01, 0),
    GIZMO_EDGE_COLOR,
    false,
  );
  app.drawLine(
    new pc.Vec3(0, 0.01, -groundHalf),
    new pc.Vec3(0, 0.01, groundHalf),
    GIZMO_EDGE_COLOR,
    false,
  );
  const corners = cubeCorners(runtime);
  for (const [from, to] of CUBE_EDGES) {
    app.drawLine(corners[from], corners[to], GIZMO_EDGE_COLOR, false);
  }
}

export function destroyProjectionCenterGizmo(
  runtime: Blocking3dProjectionCenterGizmoRuntime,
): void {
  runtime.entity.destroy();
  runtime.material.destroy();
}
