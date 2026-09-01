const assert = require("node:assert/strict");
const test = require("node:test");

const {
  STORY_SCENE_3D_ACTOR_STAGE_MARGIN_M,
  STORY_SCENE_3D_CAMERA_BOUND_RATIO,
  resolveStoryScene3DActorStageRadius,
  resolveStoryScene3DWorldRadius,
  clampBlockingActorPositionToStage,
  clampBlockingCameraOrbitToWorld,
  clampBlockingCameraPositionToWorld,
  anchorBlockingCameraAtProjectionCenter,
  resolveBlockingCameraWorldPlacement,
} = require("../../shared/dist/utils/blockingStage.js");

test("角色舞台半径是半球真实圆半径减去边缘缓冲", () => {
  assert.equal(STORY_SCENE_3D_ACTOR_STAGE_MARGIN_M, 1);
  assert.equal(resolveStoryScene3DActorStageRadius({ radiusMeters: 4, projectionCenterHeight: 1 }), 3);
  assert.equal(resolveStoryScene3DActorStageRadius({ radiusMeters: 10, projectionCenterHeight: 1.7 }), 9);
  assert.equal(resolveStoryScene3DActorStageRadius({ radiusMeters: 5, projectionCenterHeight: 1.7 }), 4);
  // 半径极小时保底，不把舞台压成零。
  assert.equal(resolveStoryScene3DActorStageRadius({ radiusMeters: 1.5, projectionCenterHeight: 1 }), 1);
});

test("半球世界半径就是圆半径，舞台边界必须落在它之内", () => {
  assert.equal(resolveStoryScene3DWorldRadius({ radiusMeters: 4, projectionCenterHeight: 1 }), 4);
  assert.equal(resolveStoryScene3DWorldRadius({ radiusMeters: 10, projectionCenterHeight: 1.7 }), 10);
  for (const radius of [2.5, 4, 5, 10]) {
    const environment = { radiusMeters: radius, projectionCenterHeight: 1.7 };
    assert.ok(
      resolveStoryScene3DActorStageRadius(environment) < resolveStoryScene3DWorldRadius(environment),
      "舞台圈必须严格在半球边缘内侧",
    );
  }
});

test("缺少环境快照时使用 7.5 米圆半径和 2 米投射中心的当前默认值", () => {
  assert.equal(resolveStoryScene3DWorldRadius(undefined), 7.5);
  const anchored = anchorBlockingCameraAtProjectionCenter({
    azim: 0,
    elev: 0,
    distance: 8,
    focalPoint: [0, 0, 0],
  }, undefined);
  assert.equal(anchored.focalPoint[1], 2);
});

test("角色位置径向 clamp 进舞台圆周并保持方位角与高度", () => {
  const environment = { radiusMeters: 5, projectionCenterHeight: 1.7 };
  const inside = clampBlockingActorPositionToStage([2, 0.9, -3], environment);
  assert.deepEqual(inside, [2, 0.9, -3], "舞台内位置保持原样");

  // 圆半径 5 → 舞台 4：越界点被投影回半径 4 的圆周同方位。
  const outside = clampBlockingActorPositionToStage([20, 0.4, -8], environment);
  assert.ok(Math.abs(Math.hypot(outside[0], outside[2]) - 4) < 1e-9);
  assert.ok(outside[0] > 0 && outside[2] < 0, "clamp 保持原方位角");
  assert.equal(outside[1], 0.4, "高度不被改动");
});

test("相机重锚定后拍摄位落在投射中心且视线方向与距离不变", () => {
  const camera = {
    azim: -35,
    elev: -10,
    distance: 7,
    focalPoint: [2, 0.8, 3],
  };
  const environment = { radiusMeters: 5, projectionCenterHeight: 3 };
  const before = resolveBlockingCameraWorldPlacement(camera);
  const anchored = anchorBlockingCameraAtProjectionCenter(camera, environment);
  const after = resolveBlockingCameraWorldPlacement(anchored);

  for (const [index, axis] of ["x", "y", "z"].entries()) {
    assert.ok(Math.abs(after.position[index] - [0, 3, 0][index]) < 1e-9, `重锚定后相机 ${axis} 应在投射中心`);
  }
  after.forward.forEach((value, index) => {
    assert.ok(Math.abs(value - before.forward[index]) < 1e-9, "视线方向保持不变");
  });
  assert.equal(anchored.distance, camera.distance, "拍摄距离保持不变");
});

test("穹顶内相机位置保持原样，越界位置收敛回边界内", () => {
  const environment = { radiusMeters: 10, projectionCenterHeight: 2 };
  const boundRadius = 10 * STORY_SCENE_3D_CAMERA_BOUND_RATIO;
  const inside = clampBlockingCameraPositionToWorld([3, 1.2, -4], environment);
  assert.deepEqual(inside, [3, 1.2, -4], "壳内位置保持原样");

  // 水平越界：投影回边界圆并保持方位角。
  const outside = clampBlockingCameraPositionToWorld([30, 1.2, -40], environment);
  assert.ok(Math.abs(Math.hypot(outside[0], outside[2]) - boundRadius) < 1e-9);
  assert.equal(outside[1], 1.2);

  // 低于地面被抬到最低高度。
  const underground = clampBlockingCameraPositionToWorld([1, -5, 1], environment);
  assert.ok(underground[1] >= 0.1);
});

test("高于投射中心的相机位置还要落在上半球壳内", () => {
  const environment = { radiusMeters: 4, projectionCenterHeight: 1 };
  const boundRadius = 4 * STORY_SCENE_3D_CAMERA_BOUND_RATIO;
  // (3.7, 中心上方 3.5) 水平没超边界圆，但球面距离已超出壳半径。
  const clamped = clampBlockingCameraPositionToWorld([3.7, 4.5, 0], environment);
  const shellDistance = Math.hypot(clamped[0], clamped[1] - 1, clamped[2]);
  assert.ok(shellDistance <= boundRadius + 1e-9, "上半球壳内");
});

test("轨道相机越界时保持视线方向并缩短距离收进穹顶", () => {
  const environment = { radiusMeters: 3, projectionCenterHeight: 0.6 };
  const camera = {
    azim: 20,
    elev: -15,
    distance: 9.06,
    focalPoint: [0.05, 0.8, 0.485],
  };
  const clamped = clampBlockingCameraOrbitToWorld(camera, environment);
  assert.equal(clamped.azim, camera.azim, "方位角不变");
  assert.equal(clamped.elev, camera.elev, "俯仰角不变");
  assert.ok(clamped.distance < camera.distance, "越界距离被缩短");
  assert.ok(clamped.distance >= 0.25, "距离不低于下限");
  const placement = resolveBlockingCameraWorldPlacement(clamped);
  const boundRadius = 3 * STORY_SCENE_3D_CAMERA_BOUND_RATIO;
  assert.ok(Math.hypot(placement.position[0], placement.position[2]) <= boundRadius + 1e-9, "水平不出界");
  assert.ok(placement.position[1] >= 0.1 - 1e-9, "不低于地面");
  assert.ok(clamped.distance <= camera.distance + 1e-9, "距离只收不放");
});

test("穹顶内轨道相机原样保留，焦点越界时先收焦点再收距离", () => {
  const environment = { radiusMeters: 6, projectionCenterHeight: 2 };
  const inside = {
    azim: -45,
    elev: -12,
    distance: 4,
    focalPoint: [0, 0.8, 0],
  };
  const untouched = clampBlockingCameraOrbitToWorld(inside, environment);
  assert.deepEqual(untouched, inside);

  const panned = {
    azim: 180,
    elev: 0,
    distance: 2,
    focalPoint: [50, 0.8, 0],
  };
  const clamped = clampBlockingCameraOrbitToWorld(panned, environment);
  const boundRadius = 6 * STORY_SCENE_3D_CAMERA_BOUND_RATIO;
  assert.ok(Math.hypot(clamped.focalPoint[0], clamped.focalPoint[2]) <= boundRadius + 1e-9, "焦点先收进边界圆");
  const placement = resolveBlockingCameraWorldPlacement(clamped);
  assert.ok(Math.hypot(placement.position[0], placement.position[2]) <= boundRadius + 1e-9, "相机位置同样在界内");
});
