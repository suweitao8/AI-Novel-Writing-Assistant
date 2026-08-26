import * as pc from "playcanvas";

import type { DramaShotBlockingSketch3DCamera } from "@/api/media/drama";

/**
 * 镜头小相机 gizmo：把 layout3d.camera 的机位、朝向与取景范围画成线框，
 * 让编辑者直观看到「镜头在哪、朝哪看、框住多大范围」。仅用瞬时线条绘制，
 * 与投影中心 gizmo 同一套模式，不产生可拾取实体。
 *
 * 取景框按导出草图的 16:9 画幅计算；框体长度随相机距离自适应，避免遮挡主体。
 */

export interface Blocking3dCameraGizmoSource {
  camera: DramaShotBlockingSketch3DCamera;
}

const GIZMO_COLOR = new pc.Color(0.16, 0.82, 1, 0.95);
const FOCUS_LINE_COLOR = new pc.Color(0.16, 0.82, 1, 0.4);
/** 导出草图固定 16:9，视锥横截角按同一画幅计算才有「所见即所得」。 */
export const SHOT_FRAME_ASPECT = 16 / 9;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** 与 blocking3dViewerApp.syncCamera 完全一致的轨道机位计算。 */
export function resolveBlocking3dOrbitPosition(camera: DramaShotBlockingSketch3DCamera): pc.Vec3 {
  const elevation = camera.elev * pc.math.DEG_TO_RAD;
  const azimuth = camera.azim * pc.math.DEG_TO_RAD;
  const cosElevation = Math.cos(elevation);
  return new pc.Vec3(
    camera.focalPoint[0] + Math.sin(azimuth) * cosElevation * camera.distance,
    camera.focalPoint[1] + Math.sin(-elevation) * camera.distance,
    camera.focalPoint[2] + Math.cos(azimuth) * cosElevation * camera.distance,
  );
}

function frustumCorners(camera: DramaShotBlockingSketch3DCamera, length: number): Array<[pc.Vec3, pc.Vec3]> {
  const origin = resolveBlocking3dOrbitPosition(camera);
  const rotation = new pc.Quat().setFromEulerAngles(camera.elev, camera.azim, 0);
  const forward = rotation.transformVector(new pc.Vec3(0, 0, -1));
  const right = rotation.transformVector(new pc.Vec3(1, 0, 0));
  const up = rotation.transformVector(new pc.Vec3(0, 1, 0));
  const halfVertical = Math.tan((clamp(camera.fovDeg, 10, 120) * pc.math.DEG_TO_RAD) / 2) * length;
  const halfHorizontal = halfVertical * SHOT_FRAME_ASPECT;
  const center = origin.clone().add(forward.clone().scale(length));
  const pairs: Array<[pc.Vec3, pc.Vec3]> = [];
  const corners = [
    center.clone().add(right.clone().scale(-halfHorizontal)).add(up.clone().scale(halfVertical)),
    center.clone().add(right.clone().scale(halfHorizontal)).add(up.clone().scale(halfVertical)),
    center.clone().add(right.clone().scale(halfHorizontal)).add(up.clone().scale(-halfVertical)),
    center.clone().add(right.clone().scale(-halfHorizontal)).add(up.clone().scale(-halfVertical)),
  ];
  for (let index = 0; index < corners.length; index += 1) {
    const next = corners[(index + 1) % corners.length];
    pairs.push([origin.clone(), corners[index]]);
    pairs.push([corners[index], next]);
  }
  return pairs;
}

/** 每帧调用一次：机位十字、视线焦点线与 16:9 取景锥。 */
export function drawBlocking3dCameraGizmo(
  app: pc.AppBase,
  source: Blocking3dCameraGizmoSource,
): void {
  const { camera } = source;
  const origin = resolveBlocking3dOrbitPosition(camera);
  const focal = new pc.Vec3(camera.focalPoint[0], camera.focalPoint[1], camera.focalPoint[2]);
  const bodySize = clamp(camera.distance * 0.02, 0.05, 0.18);
  // 机位十字：三轴短线标出相机本体的空间位置。
  for (const axis of [
    new pc.Vec3(1, 0, 0),
    new pc.Vec3(0, 1, 0),
    new pc.Vec3(0, 0, 1),
  ]) {
    app.drawLine(origin.clone().add(axis.clone().scale(-bodySize)), origin.clone().add(axis.clone().scale(bodySize)), GIZMO_COLOR, false);
  }
  app.drawLine(origin, focal, FOCUS_LINE_COLOR, false);
  // 取景锥长度自适应距离：近景不糊脸，远景不遮全场。
  const frustumLength = clamp(camera.distance * 0.55, 0.6, 3.5);
  for (const [from, to] of frustumCorners(camera, frustumLength)) {
    app.drawLine(from, to, GIZMO_COLOR, false);
  }
}
