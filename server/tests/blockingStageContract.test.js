const assert = require("node:assert/strict");
const test = require("node:test");

const {
  STORY_SCENE_3D_ACTOR_STAGE_MARGIN_M,
  resolveStoryScene3DActorStageRadius,
  clampBlockingActorPositionToStage,
  anchorBlockingCameraAtProjectionCenter,
  resolveBlockingCameraWorldPlacement,
} = require("../../shared/dist/utils/blockingStage.js");

test("角色舞台半径是半球半径减去边缘缓冲，并有最小可用值", () => {
  assert.equal(STORY_SCENE_3D_ACTOR_STAGE_MARGIN_M, 1);
  assert.equal(resolveStoryScene3DActorStageRadius({ domeRadius: 8, projectionCenterHeight: 1 }), 7);
  assert.equal(resolveStoryScene3DActorStageRadius({ domeRadius: 20, projectionCenterHeight: 1.7 }), 19);
  // 半径极小时保底，不把舞台压成零。
  assert.equal(resolveStoryScene3DActorStageRadius({ domeRadius: 1.5, projectionCenterHeight: 1 }), 1);
});

test("角色位置径向 clamp 进舞台圆周并保持方位角与高度", () => {
  const environment = { domeRadius: 10, projectionCenterHeight: 1.7 };
  const inside = clampBlockingActorPositionToStage([2, 0.9, -3], environment);
  assert.deepEqual(inside, [2, 0.9, -3], "舞台内位置保持原样");

  // 半径 9：水平距离 30 的点被投影回圆周同方位。
  const outside = clampBlockingActorPositionToStage([20, 0.4, -8], environment);
  assert.ok(Math.abs(Math.hypot(outside[0], outside[2]) - 9) < 1e-9);
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
  const environment = { domeRadius: 10, projectionCenterHeight: 3 };
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
