const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildDramaShotBlockingAutoPlanLayout,
  fitAutoPlanCameraFovToActors,
} = require("../dist/services/drama/visual/DramaShotBlockingSketchService.js");

const BASE_CAMERA = {
  azim: -45,
  elev: -12,
  distance: 8,
  focalPoint: [0, 0.8, 0],
  fovDeg: 52,
  nearClip: 0.05,
  farClip: 200,
  depthOfFieldEnabled: true,
  focusDistance: 7,
  focusRange: 4,
  blurRadius: 3,
};

test("取景兜底：角色都在锥内时保持模型给的 fovDeg 不变", () => {
  const camera = fitAutoPlanCameraFovToActors(BASE_CAMERA, [
    { position: [0.6, 0, -1], heightMeters: 1.75 },
    { position: [-0.6, 0, -0.5], heightMeters: 1.6 },
  ]);
  assert.equal(camera.fovDeg, 52);
  assert.deepEqual(
    [
      camera.azim,
      camera.elev,
      camera.distance,
      camera.focalPoint,
      camera.focusDistance,
    ],
    [-45, -12, 8, [0, 0.8, 0], 7],
  );
});

test("取景兜底：角色落在取景锥外时只放宽 fovDeg（上限 100）", () => {
  const widened = fitAutoPlanCameraFovToActors(BASE_CAMERA, [
    { position: [-6, 0, -6], heightMeters: 1.75 },
  ]);
  assert.ok(widened.fovDeg > 52, `expected widened fov, got ${widened.fovDeg}`);
  assert.ok(widened.fovDeg <= 100);
  // 只允许动 fovDeg，其余创意参数原样保留。
  assert.equal(widened.distance, BASE_CAMERA.distance);
  assert.equal(widened.depthOfFieldEnabled, BASE_CAMERA.depthOfFieldEnabled);
  assert.equal(widened.focusDistance, BASE_CAMERA.focusDistance);

  const capped = fitAutoPlanCameraFovToActors(
    { ...BASE_CAMERA, fovDeg: 99 },
    [{ position: [2.5, 0, 9.5], heightMeters: 2.4 }],
  );
  assert.equal(capped.fovDeg, 100);
});

test("关系归一化后的最终角色布局仍受 100 度 FOV 上限保护", () => {
  const actors = [
    { characterName: "叶晨", sourceImageKind: "state_sheet", heightMeters: 1.75, heightSource: "manual" },
    { characterName: "血角兽", sourceImageKind: "state_sheet", heightMeters: 2.2, heightSource: "ai" },
  ];
  const result = buildDramaShotBlockingAutoPlanLayout({
    actors: [
      { characterName: "叶晨", position: [8, 0, 8], yawDeg: 0, scale: [1, 1, 1], pose: "standing" },
      { characterName: "血角兽", position: [-8, 0, -8], yawDeg: 0, scale: [0.7, 0.7, 0.7], pose: "prone" },
    ],
    relations: [{
      subjectCharacterName: "血角兽",
      objectCharacterName: "叶晨",
      relation: "on_top_of",
      sizeRelation: "larger",
    }],
    camera: {
      focalCharacterName: "血角兽",
      compositionBias: "center",
      depthOfFieldEnabled: false,
    },
  }, actors, { projectionCenterHeight: 1, domeRadius: 20, yawDeg: 0, intensity: 1 }, "全景");

  assert.ok(result.layout.camera.fovDeg >= 30 && result.layout.camera.fovDeg <= 100);
  assert.ok(result.layout.actors.every((actor) => actor.position[1] >= 0));
  assert.ok(result.layout.actors.find((actor) => actor.characterName === "血角兽").scale[1]
    > result.layout.actors.find((actor) => actor.characterName === "叶晨").scale[1]);
});
