import type { StoryScene3DEnvironment } from "../types/comicDrama";

/**
 * 分镜舞台合同：角色活动余量与相机锚定。
 *
 * 全景环境半球是场景的物理边界，角色（尤其是跑动等大幅度动作）不能贴到
 * 半球边缘：靠边 1 米始终保留为运动缓冲，角色可站位半径为
 * worldRadius - ACTOR_STAGE_MARGIN_M，其中 worldRadius =
 * resolveStoryScene3DWorldRadius(environment)。
 *
 * 3D 草图的拍摄位锚定在投射中心 [0, projectionCenterHeight, 0]——全景图
 * 就是从这个点拍出来的，相机放在同一位置能保证成图与全景一致；构图自由度
 * 交给视线方向、拍摄距离与焦段，而不是挪动相机位置。
 */

export const STORY_SCENE_3D_ACTOR_STAGE_MARGIN_M = 1;

/** 角色可站位半径的最小值，防止极端参数把舞台压成没有活动空间。 */
export const STORY_SCENE_3D_ACTOR_STAGE_MIN_RADIUS_M = 1;

function finiteOr(value: unknown, fallback: number): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

export type BlockingStageEnvironment = Pick<StoryScene3DEnvironment, "radiusMeters" | "projectionCenterHeight">
  & Partial<Pick<StoryScene3DEnvironment, "yawDeg">>
  & { domeRadius?: number };

/**
 * 半球在世界空间的真实圆半径。新环境字段已经直接保存真实半径；旧
 * domeRadius 只在读取历史布局时按直径除以二。任何画边界或做位置限制的
 * 代码都必须经过这里读取，避免再次把半径当直径或反过来换算。
 */
export function resolveStoryScene3DWorldRadius(environment: Partial<BlockingStageEnvironment> | null | undefined): number {
  const currentRadius = Number(environment?.radiusMeters);
  if (Number.isFinite(currentRadius) && currentRadius > 0) {
    return Math.max(0.5, currentRadius);
  }
  return Math.max(0.5, finiteOr(environment?.domeRadius, 15) / 2);
}

/** @deprecated 兼容仍引用旧命名的调用方；新代码请使用 resolveStoryScene3DWorldRadius。 */
export const resolveStoryScene3DDomeWorldRadius = resolveStoryScene3DWorldRadius;

/**
 * 角色允许的活动半径：半球真实半径减去边缘缓冲。
 *
 * 舞台边界在真实圆半径基础上内缩，否则会画到半球外面、角色也会被
 * 允许走出球边穿模。
 */
export function resolveStoryScene3DActorStageRadius(environment: Partial<BlockingStageEnvironment> | null | undefined): number {
  return Math.max(
    STORY_SCENE_3D_ACTOR_STAGE_MIN_RADIUS_M,
    resolveStoryScene3DWorldRadius(environment) - STORY_SCENE_3D_ACTOR_STAGE_MARGIN_M,
  );
}

/**
 * 把地面位置径向 clamp 进角色舞台；y 保持不变（站立高度由归一化负责），
 * 水平方向超出半径的点投影回圆周上，仍在原方位角。
 */
export function clampBlockingActorPositionToStage(
  position: readonly [number, number, number],
  environment: Partial<BlockingStageEnvironment> | null | undefined,
): [number, number, number] {
  const radius = resolveStoryScene3DActorStageRadius(environment);
  const x = finiteOr(position[0], 0);
  const z = finiteOr(position[2], 0);
  const horizontal = Math.hypot(x, z);
  if (horizontal <= radius) {
    return [x, finiteOr(position[1], 0), z];
  }
  if (horizontal < 1e-9) {
    return [0, finiteOr(position[1], 0), 0];
  }
  const scale = radius / horizontal;
  return [x * scale, finiteOr(position[1], 0), z * scale];
}

export interface BlockingCameraOrbitGeometry {
  /** Orbit azimuth in degrees around the focal point. */
  azim: number;
  /** Orbit elevation in degrees; negative looks downward. */
  elev: number;
  distance: number;
  focalPoint: [number, number, number];
}

export interface BlockingCameraWorldPlacement {
  position: [number, number, number];
  /** View direction from the camera toward the focal point, normalized. */
  forward: [number, number, number];
}

/** Viewer 的 orbit 公式：position = focalPoint + D(azim,elev)*distance。 */
export function resolveBlockingCameraWorldPlacement(camera: BlockingCameraOrbitGeometry): BlockingCameraWorldPlacement {
  const azimuthRad = finiteOr(camera.azim, 0) * Math.PI / 180;
  const elevationRad = finiteOr(camera.elev, 0) * Math.PI / 180;
  const distance = finiteOr(camera.distance, 8);
  const dirX = Math.sin(azimuthRad) * Math.cos(elevationRad);
  const dirY = -Math.sin(elevationRad);
  const dirZ = Math.cos(azimuthRad) * Math.cos(elevationRad);
  const focalX = finiteOr(camera.focalPoint[0], 0);
  const focalY = finiteOr(camera.focalPoint[1], 0);
  const focalZ = finiteOr(camera.focalPoint[2], 0);
  const length = Math.max(distance, 1e-6);
  return {
    position: [
      focalX + dirX * distance,
      focalY + dirY * distance,
      focalZ + dirZ * distance,
    ],
    // 反向才是视线方向（相机看向 focal point）。
    forward: [-dirX, -dirY, -dirZ],
  };
}

/**
 * 保持视线方向与拍摄距离不变，把相机平移回投射中心：
 * 新 focalPoint = 投射中心 − D*distance。viewer 只应用 orbit 参数，
 * 所以重锚定完全通过这四个字段表达，不改变 look-at 与取景距离。
 */
export function anchorBlockingCameraAtProjectionCenter(
  camera: BlockingCameraOrbitGeometry,
  environment: Partial<BlockingStageEnvironment> | null | undefined,
): BlockingCameraOrbitGeometry {
  const projectionCenterHeight = finiteOr(environment?.projectionCenterHeight, 2);
  const azimuthRad = finiteOr(camera.azim, 0) * Math.PI / 180;
  const elevationRad = finiteOr(camera.elev, 0) * Math.PI / 180;
  const distance = finiteOr(camera.distance, 8);
  const dirX = Math.sin(azimuthRad) * Math.cos(elevationRad);
  const dirY = -Math.sin(elevationRad);
  const dirZ = Math.cos(azimuthRad) * Math.cos(elevationRad);
  return {
    azim: finiteOr(camera.azim, 0),
    elev: finiteOr(camera.elev, 0),
    distance,
    focalPoint: [
      -dirX * distance,
      projectionCenterHeight - dirY * distance,
      -dirZ * distance,
    ],
  };
}

/**
 * 摄像机世界边界：全景穹顶是场景的物理外壳，编辑视角与拍摄机位都必须留在
 * 壳内，否则取景会穿出穹顶拍到背面（画面变成穹顶外的灰底）。边界按真实
 * 半径内缩到与地面平坦区一致的 0.95 比例，留出贴边余量。
 */
export const STORY_SCENE_3D_CAMERA_BOUND_RATIO = 0.95;

/** 摄像机最低高度：避免贴地穿模到地面穹顶下方。 */
export const STORY_SCENE_3D_CAMERA_MIN_HEIGHT_M = 0.1;

function cameraBoundRadius(environment: Partial<BlockingStageEnvironment> | null | undefined): number {
  return resolveStoryScene3DWorldRadius(environment) * STORY_SCENE_3D_CAMERA_BOUND_RATIO;
}

/**
 * 把世界坐标位置收敛进穹顶外壳：水平半径不超过边界圆，高度夹在地面与
 * 穹顶顶部之间；高于投射中心的部分还要落在以投射中心为球心的球内
 * （上半球面随高度收窄）。inset 用于给后续沿视线方向的移动预留余量
 * （例如轨道相机焦点的距离下限），让"焦点 + 0.25 米"仍留在壳内。
 */
export function clampBlockingCameraPositionToWorld(
  position: readonly [number, number, number],
  environment: Partial<BlockingStageEnvironment> | null | undefined,
  inset = 0,
): [number, number, number] {
  const boundRadius = Math.max(cameraBoundRadius(environment) - inset, 0.5);
  const centerY = finiteOr(environment?.projectionCenterHeight, 2);
  const maxY = centerY + (cameraBoundRadius(environment) * 0.9 - inset);
  const minY = STORY_SCENE_3D_CAMERA_MIN_HEIGHT_M;
  let x = finiteOr(position[0], 0);
  let y = Math.min(Math.max(finiteOr(position[1], centerY), minY), maxY);
  let z = finiteOr(position[2], 0);
  if (y > centerY) {
    const shellDistance = Math.hypot(x, y - centerY, z);
    if (shellDistance > boundRadius) {
      const scale = boundRadius / shellDistance;
      x *= scale;
      y = centerY + (y - centerY) * scale;
      z *= scale;
    }
  }
  const horizontal = Math.hypot(x, z);
  if (horizontal > boundRadius) {
    const scale = boundRadius / horizontal;
    x *= scale;
    z *= scale;
  }
  return [x, y, z];
}

/**
 * 保持视线方向不变，把轨道相机（focalPoint + 距离）收敛进穹顶。
 * 默认先把焦点钳进世界，再沿视线方向求仍留在壳内的最大距离并取小。
 * 编辑视角可关闭距离收敛，只保留焦点边界，让用户从穹顶外继续观察场景。
 */
export function clampBlockingCameraOrbitToWorld(
  camera: BlockingCameraOrbitGeometry,
  environment: Partial<BlockingStageEnvironment> | null | undefined,
  options: { constrainDistance?: boolean } = {},
): BlockingCameraOrbitGeometry {
  // 焦点比相机多留 0.35 米内缩：距离下限 0.25 米时"焦点 + 一步"仍在壳内。
  const focalPoint = clampBlockingCameraPositionToWorld(camera.focalPoint, environment, 0.35);
  const azimuthRad = finiteOr(camera.azim, 0) * Math.PI / 180;
  const elevationRad = finiteOr(camera.elev, 0) * Math.PI / 180;
  const dirX = Math.sin(azimuthRad) * Math.cos(elevationRad);
  const dirY = -Math.sin(elevationRad);
  const dirZ = Math.cos(azimuthRad) * Math.cos(elevationRad);
  const distance = finiteOr(camera.distance, 8);
  const boundRadius = cameraBoundRadius(environment);
  const centerY = finiteOr(environment?.projectionCenterHeight, 2);
  const maxY = centerY + boundRadius * 0.9;
  const [fx, fy, fz] = focalPoint;
  const constrainDistance = options.constrainDistance !== false;
  let maxDistance = distance;
  if (constrainDistance) {
    // 水平边界圆：|焦点 + t·方向| 的水平分量命中边界圆的较小正根。
    const horizontalAlong = fx * dirX + fz * dirZ;
    const horizontalSquared = fx * fx + fz * fz - boundRadius * boundRadius;
    maxDistance = Math.min(
      maxDistance,
      -horizontalAlong + Math.sqrt(Math.max(horizontalAlong * horizontalAlong - horizontalSquared, 0)),
    );
    // 地面与顶部平面。
    if (dirY < 0) maxDistance = Math.min(maxDistance, (STORY_SCENE_3D_CAMERA_MIN_HEIGHT_M - fy) / dirY);
    if (dirY > 0) maxDistance = Math.min(maxDistance, (maxY - fy) / dirY);
    // 上半球面：仅在穿越点高于投射中心时生效（下半部分的壳是地面穹顶，
    // 已由水平边界圆与地面平面覆盖，套球面会误伤贴地远机位）。
    const sy = fy - centerY;
    const shellAlong = 2 * (fx * dirX + sy * dirY + fz * dirZ);
    const shellSquared = fx * fx + sy * sy + fz * fz - boundRadius * boundRadius;
    if (shellSquared < 0) {
      const shellDistance = (-shellAlong + Math.sqrt(Math.max(shellAlong * shellAlong - 4 * shellSquared, 0))) / 2;
      if (fy + shellDistance * dirY >= centerY) {
        maxDistance = Math.min(maxDistance, shellDistance);
      }
    }
  }
  return {
    azim: finiteOr(camera.azim, 0),
    elev: finiteOr(camera.elev, 0),
    distance: constrainDistance ? Math.max(0.25, Math.min(distance, maxDistance)) : Math.max(0.25, distance),
    focalPoint,
  };
}
