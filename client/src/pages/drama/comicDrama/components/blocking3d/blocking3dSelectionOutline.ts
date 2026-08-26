import * as pc from "playcanvas";

export interface Blocking3dSelectionBounds {
  min: pc.Vec3;
  max: pc.Vec3;
}

const OUTLINE_EDGES: Array<[number, number]> = [
  [0, 1], [2, 3], [4, 5], [6, 7],
  [0, 2], [1, 3], [4, 6], [5, 7],
  [0, 4], [1, 5], [2, 6], [3, 7],
];

function includeAabb(bounds: Blocking3dSelectionBounds | null, aabb: pc.BoundingBox): Blocking3dSelectionBounds {
  const min = new pc.Vec3(
    aabb.center.x - aabb.halfExtents.x,
    aabb.center.y - aabb.halfExtents.y,
    aabb.center.z - aabb.halfExtents.z,
  );
  const max = new pc.Vec3(
    aabb.center.x + aabb.halfExtents.x,
    aabb.center.y + aabb.halfExtents.y,
    aabb.center.z + aabb.halfExtents.z,
  );
  if (!bounds) return { min, max };
  bounds.min.min(min);
  bounds.max.max(max);
  return bounds;
}

export function getEntitySelectionBounds(entity: pc.Entity): Blocking3dSelectionBounds | null {
  let bounds: Blocking3dSelectionBounds | null = null;
  for (const render of entity.findComponents("render") as pc.RenderComponent[]) {
    for (const mesh of render.meshInstances ?? []) bounds = includeAabb(bounds, mesh.aabb);
  }
  for (const model of entity.findComponents("model") as pc.ModelComponent[]) {
    for (const mesh of model.meshInstances ?? []) bounds = includeAabb(bounds, mesh.aabb);
  }
  return bounds;
}

function createCorners(bounds: Blocking3dSelectionBounds, padding: number): pc.Vec3[] {
  const min = new pc.Vec3(bounds.min.x - padding, bounds.min.y - padding, bounds.min.z - padding);
  const max = new pc.Vec3(bounds.max.x + padding, bounds.max.y + padding, bounds.max.z + padding);
  return [
    new pc.Vec3(min.x, min.y, min.z),
    new pc.Vec3(min.x, min.y, max.z),
    new pc.Vec3(min.x, max.y, min.z),
    new pc.Vec3(min.x, max.y, max.z),
    new pc.Vec3(max.x, min.y, min.z),
    new pc.Vec3(max.x, min.y, max.z),
    new pc.Vec3(max.x, max.y, min.z),
    new pc.Vec3(max.x, max.y, max.z),
  ];
}

export function drawEntitySelectionOutline(
  app: pc.AppBase,
  entity: pc.Entity,
  color: pc.Color,
  padding = 0.03,
): void {
  const bounds = getEntitySelectionBounds(entity);
  if (!bounds) return;
  const extent = Math.max(
    bounds.max.x - bounds.min.x,
    bounds.max.y - bounds.min.y,
    bounds.max.z - bounds.min.z,
  );
  const safePadding = Math.max(padding, extent * 0.02);
  const corners = createCorners(bounds, safePadding);
  for (const [from, to] of OUTLINE_EDGES) app.drawLine(corners[from], corners[to], color, false);
}
