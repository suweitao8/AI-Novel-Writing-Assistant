const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const serviceModule = require("../dist/modules/novel/story-settings/application/StoryScene3dMarkerService.js");
const serviceSource = fs.readFileSync(
  path.join(__dirname, "../src/modules/novel/story-settings/application/StoryScene3dMarkerService.ts"),
  "utf8",
);

test("场景标记服务把识别结果绑定到当前图片制品并归一化世界坐标", () => {
  assert.equal(typeof serviceModule.buildStoryScene3dMarkerSet, "function");
  const result = serviceModule.buildStoryScene3dMarkerSet({
    markers: [{
      kind: "bed",
      label: "床",
      anchor: "floor",
      position: [2, 8, -2],
      size: [2, 1, 2],
      yawDeg: 5,
      confidence: 0.88,
    }],
    analysisNote: "室内主要家具",
  }, {
    projectionCenterHeight: 2,
    domeRadius: 15,
    yawDeg: 0,
    intensity: 1,
  }, {
    artifactId: "artifact-9",
    generatedAt: "2026-08-25T00:00:00.000Z",
  });
  assert.equal(result.status, "ready");
  assert.equal(result.sourceImageArtifactId, "artifact-9");
  assert.deepEqual(result.markers[0].position, [2, 0.5, -2]);
  assert.equal(result.analysisNote, "室内主要家具");
});

test("场景标记服务保存投射环境快照，并用图像区域重算位置", () => {
  const result = serviceModule.buildStoryScene3dMarkerSet({
    markers: [{
      kind: "door",
      label: "正前方的门",
      anchor: "wall",
      position: [8, 4, -8],
      size: [1.2, 2.2, 0.2],
      yawDeg: 0,
      confidence: 0.92,
      imageRegion: { x: 0.4, y: 0.28, width: 0.2, height: 0.32 },
    }],
  }, {
    projectionCenterHeight: 2,
    domeRadius: 15,
    panoramaHorizonV: 0.5,
    yawDeg: 0,
    intensity: 1,
  }, {});

  assert.deepEqual(result.sourceEnvironment, {
    projectionCenterHeight: 2,
    domeRadius: 15,
    panoramaHorizonV: 0.5,
  });
  assert.ok(Math.abs(result.markers[0].position[0]) < 0.05);
  assert.ok(result.markers[0].position[2] > 0);
});
test("场景标记服务必须走真实图片制品、结构化 Prompt 和状态 CAS", () => {
  assert.match(serviceSource, /runStructuredPrompt/);
  assert.match(serviceSource, /resolveStateImagePath/);
  assert.match(serviceSource, /updateStoryAssetStateJsonWithCas/);
  assert.match(serviceSource, /scene3dEnvironmentJson/);
  assert.match(serviceSource, /sceneState3dMarkersPrompt/);
  assert.doesNotMatch(serviceSource, /床.*坐标|桌.*坐标|椅.*坐标/);
});
