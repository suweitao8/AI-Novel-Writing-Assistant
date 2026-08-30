const assert = require("node:assert/strict");
const test = require("node:test");

const {
  STORY_SCENE_3D_ACTOR_STAGE_MARGIN_M,
  resolveStoryScene3DActorStageRadius,
  resolveStoryScene3DWorldRadius,
  clampBlockingActorPositionToStage,
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
