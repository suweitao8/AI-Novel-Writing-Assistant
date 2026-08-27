import * as pc from "playcanvas";

import type { DramaShotBlockingSketch3DCamera } from "@/api/media/drama";
import { resolveBlocking3dOrbitPosition } from "./blocking3dCameraGizmo";

/**
 * Unity 风格的场景摄像机实体：机身 + 镜头短筒的小模型，常驻在镜头机位上，
 * 与线框 gizmo 区分开——实体参与拾取，可以在视口里被点选和拖拽移动，
 * 对象列表里作为「摄像机」对象存在。渲染内容仍由主相机与取景画中画承担。
 */

const BODY_COLOR = new pc.Color(0.13, 0.16, 0.2);
const BODY_ACCENT = new pc.Color(0.16, 0.82, 1);

export function createBlocking3dCameraBody(app: pc.AppBase): pc.Entity {
  const material = new pc.StandardMaterial();
  material.diffuse = BODY_COLOR;
  material.emissive = BODY_ACCENT;
  material.emissiveIntensity = 0.4;
  material.update();
  const body = new pc.Entity("blocking3d-camera-body");
  body.addComponent("render", { type: "box", material });
  const lens = new pc.Entity("blocking3d-camera-lens");
  lens.addComponent("render", { type: "box", material });
  lens.setLocalPosition(0, -0.05, -0.75);
  lens.setLocalScale(0.55, 0.55, 0.5);
  body.addChild(lens);
  app.root.addChild(body);
  return body;
}

/** 机位、距离变化后同步实体位姿；尺寸随拍摄距离自适应，远景不消失、近景不糊脸。 */
export function syncBlocking3dCameraBody(body: pc.Entity, camera: DramaShotBlockingSketch3DCamera): void {
  const size = Math.max(0.14, Math.min(0.6, camera.distance * 0.04));
  body.setLocalScale(size * 1.3, size * 0.8, size * 1.6);
  body.setPosition(resolveBlocking3dOrbitPosition(camera));
  body.setEulerAngles(camera.elev, camera.azim, 0);
}

/** 射线是否命中摄像机实体（机身或镜头），用于视口点选。 */
export function rayHitsBlocking3dCameraBody(body: pc.Entity, ray: pc.Ray | null): boolean {
  if (!ray || !body.enabled) return false;
  const hit = new pc.Vec3();
  for (const render of body.findComponents("render") as pc.RenderComponent[]) {
    for (const mesh of render.meshInstances ?? []) {
      if (mesh.aabb.intersectsRay(ray, hit)) return true;
    }
  }
  return false;
}
