import assert from "node:assert/strict";
import test from "node:test";

import {
  BLOCKING_3D_POSES,
  DEFAULT_BLOCKING_3D_CAMERA,
  normalizeBlocking3dActor,
  normalizeBlocking3dCamera,
  projectBlocking3dActorToLegacy,
  resolveBlocking3dYawFromEntityForward,
  updateBlocking3dCameraAzimuth,
  wrapBlocking3dAzimuth,
} from "../src/pages/drama/comicDrama/components/blocking3d/blocking3dMath.ts";

test("3D 相机水平旋转跨过 0/360 边界时继续连续旋转", () => {
  assert.equal(wrapBlocking3dAzimuth(182.5), -177.5);
  assert.equal(wrapBlocking3dAzimuth(-182.5), 177.5);
  assert.equal(updateBlocking3dCameraAzimuth(179, -10, 0.35), -177.5);
  assert.equal(updateBlocking3dCameraAzimuth(-179, 10, 0.35), 177.5);
  assert.equal(updateBlocking3dCameraAzimuth(0, 10, 0.35), -3.5);
});

test("角色朝向从实体前向恢复，避免 PlayCanvas 欧拉角在 90 度后翻解", () => {
  const yaw = resolveBlocking3dYawFromEntityForward({
    x: -0.8741572663,
    z: 0.4856429489,
  });
  assert.ok(Math.abs(yaw - 119.0546) < 0.001);
  assert.equal(
    resolveBlocking3dYawFromEntityForward({ x: 0, z: -1 }),
    0,
  );
  assert.equal(
    resolveBlocking3dYawFromEntityForward({ x: 0, z: 0 }, 119),
    119,
  );
});

test("3D 摆位提供坐着、躺着和趴着姿势，并保存可恢复的相机状态", () => {
  assert.ok(BLOCKING_3D_POSES.includes("sitting"));
  assert.ok(BLOCKING_3D_POSES.includes("lying"));
  assert.ok(BLOCKING_3D_POSES.includes("prone"));
  assert.deepEqual(normalizeBlocking3dCamera(undefined), DEFAULT_BLOCKING_3D_CAMERA);
  assert.deepEqual(
    normalizeBlocking3dCamera({ azim: 10, elev: -15, distance: 4, focalPoint: [1, 0, -2] }),
    {
      azim: 10,
      elev: -15,
      distance: 4,
      focalPoint: [1, 0, -2],
      fovDeg: 52,
      nearClip: 0.05,
      farClip: 200,
      depthOfFieldEnabled: false,
      focusDistance: 8,
      focusRange: 5,
      blurRadius: 3,
    },
  );
});

test("3D 角色快照限制范围，并能投影回旧分镜草图字段", () => {
  const actor = normalizeBlocking3dActor({
    characterName: "血角兽",
    position: [2.5, 0, -1.5],
    yawDeg: 35,
    scale: [1.4, 1.4, 1.4],
    pose: "prone",
    actionPlaying: false,
  });
  assert.deepEqual(actor.position, [2.5, 0, -1.5]);
  assert.equal(actor.pose, "prone");
  assert.equal(actor.actionPlaying, false);
  assert.deepEqual(projectBlocking3dActorToLegacy(actor, 0), {
    characterName: "血角兽",
    x: 0.75,
    y: 0.82,
    scale: 0.56,
    flipX: true,
    zIndex: 0,
  });
  assert.equal(projectBlocking3dActorToLegacy({ ...actor, yawDeg: 180 }, 0).flipX, false);
});

test("3D 角色快照接受 5 米怪物并拒绝超出统一边界的身高", () => {
  const monster = normalizeBlocking3dActor({
    characterName: "血角兽",
    position: [0, 0, 0],
    yawDeg: 0,
    scale: [1, 1, 1],
    heightMeters: 5,
    pose: "standing",
    actionPlaying: false,
  });
  assert.equal(monster.heightMeters, 5);
  assert.throws(
    () => normalizeBlocking3dActor({
      ...monster,
      heightMeters: 10.01,
    }),
    /身高基准/,
  );
});

test("3D 客户端相机兼容旧快照并保留景深参数", () => {
  assert.deepEqual(normalizeBlocking3dCamera({
    azim: 10,
    elev: -15,
    distance: 4,
    focalPoint: [1, 0, -2],
  }), {
    azim: 10,
    elev: -15,
    distance: 4,
    focalPoint: [1, 0, -2],
    fovDeg: 52,
    nearClip: 0.05,
    farClip: 200,
    depthOfFieldEnabled: false,
    focusDistance: 8,
    focusRange: 5,
    blurRadius: 3,
  });
  assert.deepEqual(normalizeBlocking3dCamera({
    azim: 10,
    elev: -15,
    distance: 4,
    focalPoint: [1, 0, -2],
    fovDeg: 38,
    nearClip: 0.1,
    farClip: 120,
    depthOfFieldEnabled: true,
    focusDistance: 4.5,
    focusRange: 2.25,
    blurRadius: 4,
  }), {
    azim: 10,
    elev: -15,
    distance: 4,
    focalPoint: [1, 0, -2],
    fovDeg: 38,
    nearClip: 0.1,
    farClip: 120,
    depthOfFieldEnabled: true,
    focusDistance: 4.5,
    focusRange: 2.25,
    blurRadius: 4,
  });
});

test("3D 角色拒绝未知姿势和不合法空间数据", () => {
  assert.throws(
    () => normalizeBlocking3dActor({
      characterName: "沈烬",
      position: [0, 0, 0],
      yawDeg: 0,
      scale: [1, 1, 1],
      pose: "unknown",
      actionPlaying: true,
    }),
    /姿势/,
  );
  assert.throws(
    () => normalizeBlocking3dActor({
      characterName: "沈烬",
      position: [0, -1, 0],
      yawDeg: 0,
      scale: [1, 1, 1],
      pose: "standing",
      actionPlaying: true,
    }),
    /高度/,
  );
});
