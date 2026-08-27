import * as pc from "playcanvas";
import type { StoryScene3DMarker, StoryScene3DMarkerKind } from "@ai-novel/shared/types/comicDrama";

export interface Blocking3dSceneMarkerRuntime {
  marker: StoryScene3DMarker;
  entity: pc.Entity;
  material: pc.StandardMaterial;
}

const MARKER_COLORS: Record<StoryScene3DMarkerKind, [number, number, number]> = {
  bed: [0.92, 0.42, 0.32],
  table: [0.94, 0.65, 0.24],
  chair: [0.98, 0.82, 0.28],
  sofa: [0.68, 0.42, 0.92],
  desk: [0.35, 0.72, 0.96],
  cabinet: [0.28, 0.78, 0.64],
  shelf: [0.32, 0.82, 0.48],
  door: [0.55, 0.66, 0.9],
  window: [0.4, 0.84, 0.94],
  counter: [0.88, 0.46, 0.78],
  stair: [0.78, 0.62, 0.4],
  other: [0.65, 0.7, 0.76],
};

function markerColor(marker: StoryScene3DMarker): [number, number, number] {
  return MARKER_COLORS[marker.kind] ?? MARKER_COLORS.other;
}

function applyMarkerMaterial(material: pc.StandardMaterial, marker: StoryScene3DMarker, selected: boolean): void {
  const [red, green, blue] = markerColor(marker);
  material.diffuse = new pc.Color(red, green, blue);
  material.opacity = selected ? 0.56 : 0.25;
  material.blendType = pc.BLEND_NORMAL;
  material.depthWrite = false;
  material.update();
}

export function createSceneMarkerRuntime(
  app: pc.AppBase,
  marker: StoryScene3DMarker,
  selected = false,
): Blocking3dSceneMarkerRuntime {
  const entity = new pc.Entity(`blocking3d-scene-marker-${marker.id}`);
  const material = new pc.StandardMaterial();
  applyMarkerMaterial(material, marker, selected);
  entity.addComponent("render", { type: "box", material });
  app.root.addChild(entity);
  const runtime = { marker, entity, material };
  updateSceneMarkerRuntime(runtime, marker, selected);
  return runtime;
}

export function updateSceneMarkerRuntime(
  runtime: Blocking3dSceneMarkerRuntime,
  marker: StoryScene3DMarker,
  selected = false,
): void {
  runtime.marker = marker;
  runtime.entity.setPosition(marker.position[0], marker.position[1], marker.position[2]);
  runtime.entity.setLocalScale(marker.size[0], marker.size[1], marker.size[2]);
  runtime.entity.setEulerAngles(0, marker.yawDeg, 0);
  applyMarkerMaterial(runtime.material, marker, selected);
}

export function setSceneMarkerSelected(runtime: Blocking3dSceneMarkerRuntime, selected: boolean): void {
  applyMarkerMaterial(runtime.material, runtime.marker, selected);
}

export function pickSceneMarker(
  runtimes: Iterable<Blocking3dSceneMarkerRuntime>,
  ray: pc.Ray | null,
): string | null {
  if (!ray) return null;
  const hit = new pc.Vec3();
  let closest: { id: string; distance: number } | null = null;
  for (const runtime of runtimes) {
    for (const render of runtime.entity.findComponents("render") as pc.RenderComponent[]) {
      for (const mesh of render.meshInstances ?? []) {
        if (!mesh.aabb.intersectsRay(ray, hit)) continue;
        const distance = hit.distance(ray.origin);
        if (!closest || distance < closest.distance) {
          closest = { id: runtime.marker.id, distance };
        }
      }
    }
  }
  return closest?.id ?? null;
}

function markerCorners(marker: StoryScene3DMarker): pc.Vec3[] {
  const [halfX, halfY, halfZ] = marker.size.map((value) => value / 2) as [number, number, number];
  const yaw = marker.yawDeg * pc.math.DEG_TO_RAD;
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  const corners: pc.Vec3[] = [];
  for (const y of [-halfY, halfY]) {
    for (const z of [-halfZ, halfZ]) {
      for (const x of [-halfX, halfX]) {
        corners.push(new pc.Vec3(
          marker.position[0] + x * cos + z * sin,
          marker.position[1] + y,
          marker.position[2] - x * sin + z * cos,
        ));
      }
    }
  }
  return corners;
}

const MARKER_EDGES: Array<[number, number]> = [
  [0, 1], [2, 3], [4, 5], [6, 7],
  [0, 2], [1, 3], [4, 6], [5, 7],
  [0, 4], [1, 5], [2, 6], [3, 7],
];

export function drawSceneMarkerOutlines(
  app: pc.AppBase,
  runtimes: Iterable<Blocking3dSceneMarkerRuntime>,
  selectedId: string | null,
): void {
  for (const runtime of runtimes) {
    const [red, green, blue] = markerColor(runtime.marker);
    const alpha = runtime.marker.id === selectedId ? 0.95 : 0.55;
    const color = new pc.Color(red, green, blue, alpha);
    const corners = markerCorners(runtime.marker);
    for (const [from, to] of MARKER_EDGES) {
      app.drawLine(corners[from], corners[to], color, false);
    }
  }
}

export function destroySceneMarkerRuntime(runtime: Blocking3dSceneMarkerRuntime): void {
  runtime.entity.destroy();
  runtime.material.destroy();
}
