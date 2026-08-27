const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const serviceModule = require("../dist/modules/novel/story-settings/application/StoryScene3dMarkerService.js");
const { STORY_SCENE_3D_MARKER_SIZE_POLICIES } = require("../../shared/dist/utils/scene3dProjection.js");
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
    panoramaHorizonV: 0.5,
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

test("场景标记服务把上半区的地面家具贴到半球内表面", () => {
  const result = serviceModule.buildStoryScene3dMarkerSet({
    markers: [{
      kind: "table",
      label: "桌子",
      anchor: "floor",
      position: [0, 0.4, 0],
      size: [1.2, 0.8, 0.8],
      yawDeg: 15,
      confidence: 0.9,
      imageRegion: { x: 0.4, y: 0.3, width: 0.2, height: 0.16 },
    }],
    analysisNote: "固定家具",
  }, {
    projectionCenterHeight: 2,
    domeRadius: 15,
    yawDeg: 0,
    intensity: 1,
  }, { artifactId: "artifact-table" });

  const position = result.markers[0]?.position;
  const size = result.markers[0]?.size;
  assert.ok(position);
  assert.ok(size);
  // 不再估算深度：长方体贴到半球内表面，桌类面板厚度 0.35m。
  const worldRadius = 7.5;
  const latitude = (0.5 - (0.3 + 0.16 / 2)) * Math.PI;
  const sinLatitude = Math.sin(latitude);
  const cosLatitude = Math.cos(latitude);
  const rayDistance = 2 * sinLatitude + Math.sqrt(worldRadius ** 2 - (2 * cosLatitude) ** 2);
  const surfaceRadius = rayDistance * cosLatitude;
  const expectedRadius = surfaceRadius - STORY_SCENE_3D_MARKER_SIZE_POLICIES.table.z[0] / 2;
  assert.ok(
    Math.abs(Math.hypot(position[0], position[2]) - expectedRadius) < 0.02,
    `桌子应贴在半球内表面，期望 ${expectedRadius.toFixed(3)}，实际 ${Math.hypot(position[0], position[2]).toFixed(3)}`,
  );
  assert.ok(Math.hypot(position[0], position[2]) > 0.8, "桌子不能塌缩回投射中心");
  assert.equal(position[1], size[1] / 2);
});

test("场景标记服务保存结果时以图像区域纠正墙面物体方向", () => {
  const result = serviceModule.buildStoryScene3dMarkerSet({
    markers: [{
      kind: "door",
      label: "房门",
      anchor: "wall",
      position: [3.3, 1.15, 0.6],
      size: [0.9, 2.3, 0.12],
      yawDeg: -90,
      confidence: 0.88,
      imageRegion: { x: 0.78, y: 0.34, width: 0.06, height: 0.32 },
    }],
    analysisNote: "右侧房门",
  }, {
    projectionCenterHeight: 2,
    domeRadius: 15,
    yawDeg: 0,
    intensity: 1,
    panoramaHorizonV: 0.5,
  }, { artifactId: "artifact-door" });
  assert.ok(result.markers[0].position[0] > 0);
  assert.ok(result.markers[0].position[2] < 0);
  assert.ok(result.markers[0].yawDeg > 90);
});

test("场景标记服务把窗户标记完整贴到半球内表面，不保存近中心坐标", () => {
  const result = serviceModule.buildStoryScene3dMarkerSet({
    markers: [{
      kind: "window",
      label: "窗户",
      anchor: "wall",
      position: [0, 1.2, 0],
      size: [1, 1, 0.1],
      yawDeg: 0,
      confidence: 0.9,
      imageRegion: { x: 0.78, y: 0.34, width: 0.06, height: 0.18 },
    }],
  }, {
    projectionCenterHeight: 2,
    domeRadius: 15,
    yawDeg: 0,
    intensity: 1,
  }, { artifactId: "artifact-window" });

  const marker = result.markers[0];
  assert.ok(marker);
  // 不再估算深度：窗体按面板厚度完整贴在球面上。
  const worldRadius = 7.5;
  const latitude = (0.5 - (0.34 + 0.18 / 2)) * Math.PI;
  const sinLatitude = Math.sin(latitude);
  const cosLatitude = Math.cos(latitude);
  const rayDistance = 2 * sinLatitude + Math.sqrt(worldRadius ** 2 - (2 * cosLatitude) ** 2);
  const surfaceRadius = rayDistance * cosLatitude;
  const expectedRadius = surfaceRadius - STORY_SCENE_3D_MARKER_SIZE_POLICIES.window.z[0] / 2;
  assert.ok(
    Math.abs(Math.hypot(marker.position[0], marker.position[2]) - expectedRadius) < 0.02,
    `窗应贴住半球内表面，期望 ${expectedRadius.toFixed(3)}，实际 ${Math.hypot(marker.position[0], marker.position[2]).toFixed(3)}`,
  );
  assert.ok(Math.hypot(marker.position[0], marker.position[2]) > 1, "窗不能停留在投射中心");
  assert.ok(marker.size[0] >= 0.6 && marker.size[0] <= 3, "窗宽保持在类别范围内");
  assert.ok(marker.size[1] > 1);
  assert.equal(marker.position[1] >= marker.size[1] / 2, true);
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
    projectionCenterHeightRatio: 0.1333,
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

test("空间识别默认路由到视觉槽，并把视觉通道传入结构化调用", () => {
  assert.match(serviceSource, /const effectiveProvider = options\.provider \?\? getVisionModelProvider\(\)/);
  assert.match(serviceSource, /provider: effectiveProvider/);
  assert.doesNotMatch(serviceSource, /getTextModelProvider/);
});
