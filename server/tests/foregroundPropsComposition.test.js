const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");

const {
  createStoryScene3dMarker,
  mergeStoryScene3dMarkerSets,
} = require("../../shared/dist/utils/scene3dMarkers.js");
const autoPlanPrompts = require("../dist/prompting/prompts/drama/shotBlockingAutoPlan.prompts.js");

const read = (relativePath) => fs.readFileSync(path.resolve(__dirname, "..", relativePath), "utf8");

const baseCamera = {
  azim: -35,
  elev: -10,
  distance: 7,
  focalPoint: [0, 0.8, 0],
  fovDeg: 52,
  nearClip: 0.05,
  farClip: 200,
  depthOfFieldEnabled: true,
  focusDistance: 7,
  focusRange: 4,
  blurRadius: 3,
};

function buildOutput(actorExtra = {}) {
  return {
    actors: [
      { characterName: "沈烬", position: [0.4, 0.45, 1.2], yawDeg: 170, scale: [1, 1, 1], pose: "sitting", ...actorExtra },
    ],
    relations: [],
    camera: baseCamera,
  };
}

const sceneJsonWithMarker = JSON.stringify({
  markers: [{ id: "marker-chair-1", kind: "chair", label: "椅子", position: [0, 0.22, 1.5], size: [0.5, 0.45, 0.5] }],
});

test("手动创建的前景道具标记带默认尺寸与 manual 来源", () => {
  const chair = createStoryScene3dMarker("chair", { label: "椅子2", forwardMeters: 2 });
  assert.equal(chair.kind, "chair");
  assert.equal(chair.label, "椅子2");
  assert.equal(chair.anchor, "floor");
  assert.equal(chair.source, "manual");
  assert.deepEqual(chair.size, [0.5, 0.45, 0.5]);
  assert.equal(chair.position[2], 2);
  assert.ok(chair.id.length > 0);

  const bed = createStoryScene3dMarker("bed");
  assert.equal(bed.label, "床");
  assert.deepEqual(bed.size, [2, 0.55, 1.5]);

  const door = createStoryScene3dMarker("door");
  assert.equal(door.anchor, "wall");
});

test("重新空间识别保留手动前景道具标记", () => {
  const manual = createStoryScene3dMarker("bed", { id: "manual-bed-1" });
  const previous = {
    schemaVersion: 1,
    status: "ready",
    markers: [
      { id: "ai-door-1", kind: "door", label: "门", anchor: "wall", position: [0, 1, 3], size: [1, 2, 0.1], yawDeg: 0, confidence: 0.9, source: "ai" },
      manual,
    ],
  };
  const next = {
    schemaVersion: 1,
    status: "ready",
    analyzedAt: "2026-08-28T00:00:00.000Z",
    markers: [
      { id: "ai-window-1", kind: "window", label: "窗户", anchor: "wall", position: [1, 1.4, 3], size: [1.4, 1.4, 0.1], yawDeg: 0, confidence: 0.8, source: "ai" },
    ],
  };
  const mergedWithManual = mergeStoryScene3dMarkerSets(next, previous);
  assert.equal(mergedWithManual.markers.length, 2);
  assert.equal(mergedWithManual.markers[0].source, "ai");
  assert.equal(mergedWithManual.markers[1].source, "manual");
  assert.equal(mergedWithManual.markers[1].id, "manual-bed-1");
  assert.equal(mergedWithManual.analyzedAt, next.analyzedAt);

  // 识别结果里已存在同 id 标记时不重复携带。
  const overlapping = mergeStoryScene3dMarkerSets({
    ...next,
    markers: [...next.markers, manual],
  }, previous);
  assert.equal(overlapping.markers.filter((marker) => marker.id === "manual-bed-1").length, 1);

  // 没有手动标记时原样返回新集合。
  const withoutManual = mergeStoryScene3dMarkerSets(next, { schemaVersion: 1, status: "ready", markers: [] });
  assert.equal(withoutManual, next);
});

test("自动构图的道具交互必须指向真实存在的空间标记", () => {
  const { dramaShotBlockingAutoPlanPrompt } = autoPlanPrompts;
  const input = {
    shotJson: "{}",
    sceneJson: sceneJsonWithMarker,
    actorsJson: JSON.stringify([{ characterName: "沈烬" }]),
  };

  const accepted = dramaShotBlockingAutoPlanPrompt.postValidate(
    buildOutput({ interactionMarkerId: " marker-chair-1 " }),
    input,
  );
  assert.equal(accepted.actors[0].interactionMarkerId, "marker-chair-1");

  const withoutInteraction = dramaShotBlockingAutoPlanPrompt.postValidate(buildOutput(), input);
  assert.equal(withoutInteraction.actors[0].interactionMarkerId, undefined);

  assert.throws(
    () => dramaShotBlockingAutoPlanPrompt.postValidate(buildOutput({ interactionMarkerId: "marker-missing" }), input),
    /不存在的空间标记/,
  );
  assert.throws(
    () => dramaShotBlockingAutoPlanPrompt.postValidate(buildOutput({ interactionMarkerId: "marker-chair-1" }), {
      ...input,
      sceneJson: JSON.stringify({ markers: [] }),
    }),
    /不存在的空间标记/,
  );
});

test("自动构图 v7 契约：交互字段与坐/躺提示词就位", () => {
  const promptSource = read("src/prompting/prompts/drama/shotBlockingAutoPlan.prompts.ts");
  assert.match(promptSource, /version: "v7"/);
  assert.match(promptSource, /interactionMarkerId: z\.string\(\)/);
  assert.match(promptSource, /pose=sitting，并把该道具的 marker id 填入 interactionMarkerId/);
  assert.match(promptSource, /pose=lying，interactionMarkerId 指向该床或沙发/);
  assert.match(promptSource, /parseSceneJsonMarkerIds/);
});

test("keyframe 首帧提示词携带前景家具摘要", () => {
  const keyframeService = read("src/services/drama/visual/DramaShotKeyframeService.ts");
  assert.match(keyframeService, /collectForegroundProps/);
  assert.match(keyframeService, /场景内前景家具（按摆位草图的位置与朝向呈现）：/);
  assert.match(keyframeService, /foregroundProps: initial\.foregroundProps/);
  const keyframePrompt = read("src/prompting/prompts/drama/shotKeyframe.prompts.ts");
  assert.match(keyframePrompt, /version: "v3"/);
});

test("全景图负向约束禁止一切可移动家具", () => {
  const panorama = read("src/services/image/panorama/scenePanoramaLayout.ts");
  assert.match(panorama, /any bed, table, chair, sofa, desk, cabinet, shelf or counter anywhere in the image/);
  assert.match(panorama, /furniture-free background/);
  assert.match(panorama, /furniture-free backdrop/);
});
