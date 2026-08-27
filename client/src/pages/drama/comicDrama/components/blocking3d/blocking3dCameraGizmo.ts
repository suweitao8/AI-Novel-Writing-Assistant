import * as pc from "playcanvas";

/**
 * 场景摄像机线框几何工具：取景锥角点计算等纯几何函数。
 * Unity 风格的白色摄像机 gizmo 线框（机身/镜头盒体线框 + 取景锥）由
 * blocking3dShotCamera 运行时按机身实体的世界变换绘制。
 */

/** 导出草图固定 16:9，视锥横截角按同一画幅计算才有「所见即所得」。 */
export const SHOT_FRAME_ASPECT = 16 / 9;

/** 与 blocking3dViewerApp.syncCamera 完全一致的轨道机位计算。 */
export function resolveBlocking3dOrbitPosition(camera: {
  azim: number;
  elev: number;
  distance: number;
  focalPoint: [number, number, number];
}): pc.Vec3 {
  const elevation = camera.elev * pc.math.DEG_TO_RAD;
  const azimuth = camera.azim * pc.math.DEG_TO_RAD;
  const cosElevation = Math.cos(elevation);
  return new pc.Vec3(
    camera.focalPoint[0] + Math.sin(azimuth) * cosElevation * camera.distance,
    camera.focalPoint[1] + Math.sin(-elevation) * camera.distance,
    camera.focalPoint[2] + Math.cos(azimuth) * cosElevation * camera.distance,
  );
}

/** 以给定位置/朝向/视场角画 16:9 取景锥的全部棱线（4 条母线 + 前端矩形）。 */
export function drawFrustumWireframe(
  app: pc.AppBase,
  origin: pc.Vec3,
  rotation: pc.Quat,
  fovDeg: number,
  length: number,
  color: pc.Color,
): void {
  const forward = rotation.transformVector(new pc.Vec3(0, 0, -1));
  const right = rotation.transformVector(new pc.Vec3(1, 0, 0));
  const up = rotation.transformVector(new pc.Vec3(0, 1, 0));
  const halfVertical = Math.tan((Math.max(10, Math.min(120, fovDeg)) * pc.math.DEG_TO_RAD) / 2) * length;
  const halfHorizontal = halfVertical * SHOT_FRAME_ASPECT;
  const center = origin.clone().add(forward.clone().scale(length));
  const corners = [
    center.clone().add(right.clone().scale(-halfHorizontal)).add(up.clone().scale(halfVertical)),
    center.clone().add(right.clone().scale(halfHorizontal)).add(up.clone().scale(halfVertical)),
    center.clone().add(right.clone().scale(halfHorizontal)).add(up.clone().scale(-halfVertical)),
    center.clone().add(right.clone().scale(-halfHorizontal)).add(up.clone().scale(-halfVertical)),
  ];
  for (let index = 0; index < corners.length; index += 1) {
    const next = corners[(index + 1) % corners.length];
    app.drawLine(origin.clone(), corners[index], color, false);
    app.drawLine(corners[index], next, color, false);
  }
}
