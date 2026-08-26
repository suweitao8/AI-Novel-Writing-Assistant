const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");

const serviceModule = require("../dist/services/drama/visual/DramaShotBlockingSketchService.js");
const serviceSource = fs.readFileSync(
  path.join(__dirname, "../src/services/drama/visual/DramaShotBlockingSketchService.ts"),
  "utf8",
);

const actors = [
  { characterName: "沈烬", sourceImageKind: "state_sheet" },
  { characterName: "血角兽", sourceImageKind: "state_sheet" },
];

const planOutput = {
  actors: [
    { characterName: "沈烬", position: [1, 0, -1], yawDeg: 180, scale: [1, 1, 1], pose: "talking" },
    { characterName: "血角兽", position: [-1, 0, 0], yawDeg: 0, scale: [1.2, 1.2, 1.2], pose: "fighting" },
  ],
  camera: {
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
  },
  compositionNote: "双人关系清楚",
};

test("自动构图服务把 AI 输出归一化为完整 PlayCanvas 布局", () => {
  assert.equal(typeof serviceModule.buildDramaShotBlockingAutoPlanLayout, "function");
  const result = serviceModule.buildDramaShotBlockingAutoPlanLayout(
    planOutput,
    actors,
    { projectionCenterHeight: 3, domeRadius: 20, yawDeg: 0, intensity: 1 },
  );
  assert.deepEqual(result.layout.actors.map((actor) => actor.characterName), ["沈烬", "血角兽"]);
  assert.equal(result.layout.actors[1].actionPlaying, false);
  assert.equal(result.layout.camera.depthOfFieldEnabled, true);
  assert.equal(result.layout.camera.focusDistance, 7);
  assert.equal(result.compositionNote, "双人关系清楚");
});

test("编辑器上下文摘要保留当前镜头的设计字段", () => {
  assert.equal(typeof serviceModule.buildDramaShotBlockingEditorShotSummary, "function");
  assert.deepEqual(
    serviceModule.buildDramaShotBlockingEditorShotSummary({
      order: 4,
      location: "废墟广场",
      shotSize: "近景",
      cameraMove: "缓慢推进",
      durationSec: 3.5,
      action: "血角兽抬头冲向镜头",
      dialogue: null,
      visualPrompt: "低机位，红色天光",
    }),
    {
      order: 4,
      location: "废墟广场",
      shotSize: "近景",
      cameraMove: "缓慢推进",
      durationSec: 3.5,
      action: "血角兽抬头冲向镜头",
      dialogue: "",
      visualPrompt: "低机位，红色天光",
    },
  );
});

test("自动构图服务拒绝缺失当前镜头角色而不使用固定坐标补齐", () => {
  assert.throws(
    () => serviceModule.buildDramaShotBlockingAutoPlanLayout(
      { ...planOutput, actors: [planOutput.actors[0]] },
      actors,
      { projectionCenterHeight: 3, domeRadius: 20, yawDeg: 0, intensity: 1 },
    ),
    /角色.*不一致|遗漏|缺少/,
  );
});

test("自动构图把局部缩放乘到角色身高基准上并保存身高元数据", () => {
  const heightAwareActors = [
    { characterName: "高个成年人", sourceImageKind: "state_sheet", heightMeters: 1.8, heightSource: "ai" },
    { characterName: "小孩", sourceImageKind: "state_sheet", heightMeters: 0.9, heightSource: "ai" },
  ];
  const heightAwareOutput = {
    ...planOutput,
    actors: [
      { ...planOutput.actors[0], characterName: "高个成年人", scale: [1, 1, 1] },
      { ...planOutput.actors[1], characterName: "小孩", scale: [1, 1, 1] },
    ],
  };
  const result = serviceModule.buildDramaShotBlockingAutoPlanLayout(
    heightAwareOutput,
    heightAwareActors,
    { projectionCenterHeight: 3, domeRadius: 20, yawDeg: 0, intensity: 1 },
  );
  const tall = result.layout.actors[0];
  const child = result.layout.actors[1];
  assert.equal(tall.heightMeters, 1.8);
  assert.equal(child.heightMeters, 0.9);
  assert.ok(Math.abs(tall.scale[0] / child.scale[0] - 2) < 0.0001);
});

test("自动构图服务通过注册 Prompt 获取镜头上下文并返回未落库布局", () => {
  assert.match(serviceSource, /runStructuredPrompt/);
  assert.match(serviceSource, /dramaShotBlockingAutoPlanPrompt/);
  assert.match(serviceSource, /async autoPlan/);
  assert.match(serviceSource, /shotSize/);
  assert.match(serviceSource, /visualPrompt/);
  assert.match(serviceSource, /context\.actors/);
  assert.match(serviceSource, /heightMeters/);
  assert.match(serviceSource, /不一致|遗漏|缺少/);
  assert.doesNotMatch(serviceSource, /blockingSketchData:\s*JSON\.stringify\(.*autoPlan/s);
});
