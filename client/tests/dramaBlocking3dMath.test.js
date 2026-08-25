import assert from "node:assert/strict";
import test from "node:test";

import {
  BLOCKING_3D_POSES,
  DEFAULT_BLOCKING_3D_CAMERA,
  normalizeBlocking3dActor,
  normalizeBlocking3dCamera,
  projectBlocking3dActorToLegacy,
} from "../src/pages/drama/comicDrama/components/blocking3d/blocking3dMath.ts";

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
