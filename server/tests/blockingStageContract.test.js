const assert = require("node:assert/strict");
const test = require("node:test");

const {
  STORY_SCENE_3D_ACTOR_STAGE_MARGIN_M,
  resolveStoryScene3DActorStageRadius,
  resolveStoryScene3DDomeWorldRadius,
  clampBlockingActorPositionToStage,
  anchorBlockingCameraAtProjectionCenter,
  resolveBlockingCameraWorldPlacement,
} = require("../../shared/dist/utils/blockingStage.js");

test("角色舞台半径是半球真实半径（直径的一半）减去边缘缓冲", () => {
  assert.equal(STORY_SCENE_3D_ACTOR_STAGE_MARGIN_M, 1);
  // domeRadius 字段按产品语义存直径：设置页滑块即“半球直径”，
  // 3D dome 几何按 0.5 半径基础网格 × domeRadius 缩放。
  assert.equal(resolveStoryScene3DActorStageRadius({ domeRadius: 8, projectionCenterHeight: 1 }), 3, "直径 8 → 真实半径 4 → 舞台 3");
  assert.equal(resolveStoryScene3DActorStageRadius({ domeRadius: 20, projectionCenterHeight: 1.7 }), 9);
  assert.equal(resolveStoryScene3DActorStageRadius({ domeRadius: 10, projectionCenterHeight: 1.7 }), 4);
  // 直径极小时保底，不把舞台压成零。
  assert.equal(resolveStoryScene3DActorStageRadius({ domeRadius: 1.5, projectionCenterHeight: 1 }), 1);
});

test("半球世界半径是直径的一半，舞台边界必须落在它之内", () => {
  assert.equal(resolveStoryScene3DDomeWorldRadius({ domeRadius: 8, projectionCenterHeight: 1 }), 4);
  assert.equal(resolveStoryScene3DDomeWorldRadius({ domeRadius: 20, projectionCenterHeight: 1.7 }), 10);
  for (const diameter of [5, 8, 10, 20]) {
    const environment = { domeRadius: diameter, projectionCenterHeight: 1.7 };
    assert.ok(
      resolveStoryScene3DActorStageRadius(environment) < resolveStoryScene3DDomeWorldRadius(environment),
      "舞台圈必须严格在半球边缘内侧",
    );
  }
});

test("缺少环境快照时使用 15 米直径和 2 米投射中心的当前默认值", () => {
  assert.equal(resolveStoryScene3DDomeWorldRadius(undefined), 7.5);
  const anchored = anchorBlockingCameraAtProjectionCenter({
    azim: 0,
    elev: 0,
    distance: 8,
    focalPoint: [0, 0, 0],
  }, undefined);
  assert.equal(anchored.focalPoint[1], 2);
});

test("角色位置径向 clamp 进舞台圆周并保持方位角与高度", () => {
  const environment = { domeRadius: 10, projectionCenterHeight: 1.7 };
  const inside = clampBlockingActorPositionToStage([2, 0.9, -3], environment);
  assert.deepEqual(inside, [2, 0.9, -3], "舞台内位置保持原样");

  // 直径 10 → 真实半径 5 → 舞台 4：越界点被投影回半径 4 的圆周同方位。
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
