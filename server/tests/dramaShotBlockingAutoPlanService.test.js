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
  relations: [{
    subjectCharacterName: "血角兽",
    objectCharacterName: "沈烬",
    relation: "on_top_of",
    sizeRelation: "larger",
  }],
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

test("自动构图把越界角色 clamp 回舞台半径并把相机锚定到投射中心", () => {
  const {
    resolveBlockingCameraWorldPlacement,
    resolveStoryScene3DActorStageRadius,
  } = require("../../shared/dist/utils/blockingStage.js");
  const environment = { projectionCenterHeight: 3, domeRadius: 20, yawDeg: 0, intensity: 1 };
  const outOfStage = {
    ...planOutput,
    actors: [
      { ...planOutput.actors[0], position: [28, 0, -4] },
      planOutput.actors[1],
    ],
  };
  const result = serviceModule.buildDramaShotBlockingAutoPlanLayout(outOfStage, actors, environment);
  const clamped = result.layout.actors[0].position;
  const expectedRadius = resolveStoryScene3DActorStageRadius(environment);
  assert.ok(
    Math.abs(Math.hypot(clamped[0], clamped[2]) - expectedRadius) < 1e-9,
    `跑动落点必须回到舞台半径 ${expectedRadius} 内`,
  );
  assert.ok(clamped[0] > 0 && clamped[2] < 0, "clamp 后方位角不变");
  assert.equal(clamped[1], 0);

  const placement = resolveBlockingCameraWorldPlacement(result.layout.camera);
  assert.ok(Math.abs(placement.position[0]) < 1e-9, "相机 x 在投射中心");
  assert.ok(Math.abs(placement.position[1] - 3) < 1e-9, "相机高度等于投射中心高度");
  assert.ok(Math.abs(placement.position[2]) < 1e-9, "相机 z 在投射中心");
  assert.match(serviceSource, /stageRadiusMeters/);
  assert.match(serviceSource, /resolveStoryScene3DActorStageRadius|anchorBlockingCameraAtProjectionCenter/);
});

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
      action: "血角兽抬头冲向镜头",
      dialogue: null,
      visualPrompt: "低机位，红色天光",
    }),
    {
      order: 4,
      location: "废墟广场",
      shotSize: "近景",
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
    relations: [{
      subjectCharacterName: "小孩",
      objectCharacterName: "高个成年人",
      relation: "beside",
      sizeRelation: "similar",
    }],
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

test("第一镜头的关系归一化不会把承载者和上方主体反过来，并保留血角兽更大", () => {
  const firstShotActors = [
    { characterName: "叶晨", sourceImageKind: "state_sheet", heightMeters: 1.75, heightSource: "manual" },
    { characterName: "血角兽", sourceImageKind: "state_sheet", heightMeters: 2.2, heightSource: "ai" },
  ];
  const invertedFirstShotOutput = {
    ...planOutput,
    actors: [
      { ...planOutput.actors[0], characterName: "叶晨", position: [0.4, 0.25, 0.1], pose: "standing", scale: [1, 1, 1] },
      { ...planOutput.actors[1], characterName: "血角兽", position: [-0.4, 0, -0.1], pose: "prone", scale: [0.7, 0.7, 0.7] },
    ],
    relations: [{
      subjectCharacterName: "血角兽",
      objectCharacterName: "叶晨",
      relation: "on_top_of",
      sizeRelation: "larger",
    }],
  };
  const result = serviceModule.buildDramaShotBlockingAutoPlanLayout(
    invertedFirstShotOutput,
    firstShotActors,
    { projectionCenterHeight: 1, domeRadius: 20, yawDeg: 0, intensity: 1 },
  );
  const yechen = result.layout.actors.find((actor) => actor.characterName === "叶晨");
  const beast = result.layout.actors.find((actor) => actor.characterName === "血角兽");
  assert.equal(yechen.pose, "lying");
  assert.equal(yechen.position[1], 0);
  assert.ok(["crouching", "prone", "kneeling"].includes(beast.pose));
  assert.ok(beast.position[1] > yechen.position[1]);
  assert.ok(Math.hypot(beast.position[0] - yechen.position[0], beast.position[2] - yechen.position[2]) <= 0.9);
  assert.ok(beast.scale[1] > yechen.scale[1]);
});

test("自动构图服务拒绝关系中的未知角色、重复关系和多角色空关系", () => {
  const firstShotActors = [
    { characterName: "叶晨", sourceImageKind: "state_sheet", heightMeters: 1.75, heightSource: "manual" },
    { characterName: "血角兽", sourceImageKind: "state_sheet", heightMeters: 2.2, heightSource: "ai" },
  ];
  const valid = {
    ...planOutput,
    actors: [
      { ...planOutput.actors[0], characterName: "叶晨", pose: "lying" },
      { ...planOutput.actors[1], characterName: "血角兽", pose: "crouching" },
    ],
    relations: [{
      subjectCharacterName: "血角兽",
      objectCharacterName: "叶晨",
      relation: "on_top_of",
      sizeRelation: "larger",
    }],
  };
  const environment = { projectionCenterHeight: 1, domeRadius: 20, yawDeg: 0, intensity: 1 };
  assert.throws(
    () => serviceModule.buildDramaShotBlockingAutoPlanLayout(
      { ...valid, relations: [{ ...valid.relations[0], objectCharacterName: "不存在" }] },
      firstShotActors,
      environment,
    ),
    /关系.*角色|未知|不一致/,
  );
  assert.throws(
    () => serviceModule.buildDramaShotBlockingAutoPlanLayout(
      { ...valid, relations: [...valid.relations, valid.relations[0]] },
      firstShotActors,
      environment,
    ),
    /重复|关系/,
  );
  assert.throws(
    () => serviceModule.buildDramaShotBlockingAutoPlanLayout(
      { ...valid, relations: [] },
      firstShotActors,
      environment,
    ),
    /关系/,
  );
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
