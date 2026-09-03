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

const cameraIntent = {
  focalCharacterName: "血角兽",
  compositionBias: "center",
  cameraAngle: "eye_level",
  depthOfFieldEnabled: true,
};

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
  camera: cameraIntent,
  compositionNote: "双人关系清楚",
};

test("自动构图把越界角色 clamp 回舞台半径并把相机钉在投射中心", () => {
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
  const result = serviceModule.buildDramaShotBlockingAutoPlanLayout(outOfStage, actors, environment, "全景");
  const clamped = result.layout.actors[0].position;
  const expectedRadius = resolveStoryScene3DActorStageRadius(environment);
  assert.ok(
    Math.abs(Math.hypot(clamped[0], clamped[2]) - expectedRadius) < 1e-9,
    `跑动落点必须回到舞台半径 ${expectedRadius} 内`,
  );
  assert.ok(clamped[0] > 0 && clamped[2] < 0, "clamp 后方位角不变");
  assert.equal(clamped[1], 0);

  const placement = resolveBlockingCameraWorldPlacement(result.layout.camera);
  assert.ok(Math.abs(placement.position[0]) < 1e-6, "相机 x 在投射中心");
  assert.ok(Math.abs(placement.position[1] - 3) < 1e-6, "相机高度等于投射中心高度");
  assert.ok(Math.abs(placement.position[2]) < 1e-6, "相机 z 在投射中心");
  assert.match(serviceSource, /stageRadiusMeters/);
  assert.match(serviceSource, /resolveStoryScene3DActorStageRadius|resolveAutoPlanCameraFromIntent/);
});

test("自动构图服务把 AI 输出归一化为完整 PlayCanvas 布局", () => {
  assert.equal(typeof serviceModule.buildDramaShotBlockingAutoPlanLayout, "function");
  const result = serviceModule.buildDramaShotBlockingAutoPlanLayout(
    planOutput,
    actors,
    { projectionCenterHeight: 3, domeRadius: 20, yawDeg: 0, intensity: 1 },
    "全景",
  );
  assert.deepEqual(result.layout.actors.map((actor) => actor.characterName), ["沈烬", "血角兽"]);
  assert.equal(result.layout.actors[1].actionPlaying, false);
  assert.equal(result.layout.camera.depthOfFieldEnabled, true);
  // 景深焦点落在相机到焦点的实际距离上。
  assert.ok(Math.abs(result.layout.camera.focusDistance - result.layout.camera.distance) < 1e-9);
  assert.equal(result.compositionNote, "双人关系清楚");
});

test("确定性相机解析器把视线正对焦点主体并按景别计算 fov", () => {
  const { resolveAutoPlanCameraFromIntent, normalizeBlockingShotSizeKey } = serviceModule;
  const { resolveBlockingCameraWorldPlacement } = require("../../shared/dist/utils/blockingStage.js");
  const environment = { projectionCenterHeight: 2, domeRadius: 20, yawDeg: 0, intensity: 1 };
  const placedActors = [
    { characterName: "沈烬", position: [4, 0, 0], heightMeters: 1.75 },
    { characterName: "血角兽", position: [-2, 0, 1], heightMeters: 2.1 },
  ];

  // 焦点角色：相机钉在投射中心，视线（forward）指向该角色的取景点。
  const aimed = resolveAutoPlanCameraFromIntent({
    intent: { focalCharacterName: "沈烬", compositionBias: "center", cameraAngle: "eye_level", depthOfFieldEnabled: true },
    actors: placedActors,
    shotSize: "中景",
    environment,
  });
  const placement = resolveBlockingCameraWorldPlacement(aimed);
  assert.ok(Math.abs(placement.position[0]) < 1e-6, "相机 x 在投射中心");
  assert.ok(Math.abs(placement.position[1] - 2) < 1e-6, "相机高度等于投射中心高度");
  assert.ok(Math.abs(placement.position[2]) < 1e-6, "相机 z 在投射中心");
  const forwardLength = Math.hypot(placement.forward[0], placement.forward[1], placement.forward[2]);
  const toFocal = [4 - 0, 1.05 - 2, 0 - 0];
  const toFocalLength = Math.hypot(...toFocal);
  for (let i = 0; i < 3; i += 1) {
    assert.ok(
      Math.abs(placement.forward[i] / forwardLength - toFocal[i] / toFocalLength) < 1e-6,
      `视线方向第 ${i} 分量必须指向焦点主体`,
    );
  }
  // 相机到焦点的距离等于视线距离，焦点高度按中景落在腰部（0.6·身高）。
  assert.ok(Math.abs(aimed.distance - toFocalLength) < 1e-6);
  assert.ok(Math.abs(aimed.focalPoint[1] - 1.05) < 1e-6);
  assert.ok(aimed.fovDeg >= 30 && aimed.fovDeg <= 100);

  // 景别档位：特写比全景更"紧"（fov 更小或同钳制下取更小值），档位映射正确。
  assert.equal(normalizeBlockingShotSizeKey("特写"), "close_up");
  assert.equal(normalizeBlockingShotSizeKey("中近景"), "medium_close");
  assert.equal(normalizeBlockingShotSizeKey("近景"), "medium_close");
  assert.equal(normalizeBlockingShotSizeKey("中景"), "medium");
  assert.equal(normalizeBlockingShotSizeKey("全景"), "full");
  assert.equal(normalizeBlockingShotSizeKey("远景"), "extreme_wide");
  assert.equal(normalizeBlockingShotSizeKey(null), "medium");

  const closeUp = resolveAutoPlanCameraFromIntent({
    intent: { focalCharacterName: "沈烬", compositionBias: "center", cameraAngle: "eye_level", depthOfFieldEnabled: true },
    actors: [{ characterName: "沈烬", position: [1.4, 0, 0], heightMeters: 1.75 }],
    shotSize: "特写",
    environment,
  });
  const fullShot = resolveAutoPlanCameraFromIntent({
    intent: { focalCharacterName: "沈烬", compositionBias: "center", cameraAngle: "eye_level", depthOfFieldEnabled: true },
    actors: [{ characterName: "沈烬", position: [6, 0, 0], heightMeters: 1.75 }],
    shotSize: "全景",
    environment,
  });
  assert.ok(closeUp.fovDeg < fullShot.fovDeg || closeUp.distance < fullShot.distance,
    "特写必须比全景更紧（fov 或距离更小）");
  // 景别档位决定景深：特写景深范围远小于全景。
  assert.ok(closeUp.focusRange < fullShot.focusRange);
});

test("躺姿特写把焦点落在角色实际高度并保持紧凑景别", () => {
  const result = serviceModule.buildDramaShotBlockingAutoPlanLayout({
    actors: [{
      characterName: "叶晨",
      position: [0, 0.15, -1.25],
      yawDeg: 0,
      scale: [1, 1, 1],
      pose: "lying",
    }],
    relations: [],
    camera: {
      focalCharacterName: "叶晨",
      compositionBias: "center",
      cameraAngle: "eye_level",
      depthOfFieldEnabled: true,
    },
  }, [
    { characterName: "叶晨", sourceImageKind: "state_sheet", heightMeters: 1.75 },
  ], { projectionCenterHeight: 1, domeRadius: 10, yawDeg: 0, intensity: 1 }, "特写");

  assert.ok(result.layout.camera.focalPoint[1] < 1, "躺姿特写不能把焦点抬到站立角色头部");
  assert.ok(result.layout.camera.elev < 0, "投射中心高于躺姿主体时应向下取景");
  assert.ok(result.layout.camera.fovDeg <= 40, "特写不能被角色全身包络兜底放宽成远景");
});

test("三分法偏置把焦点主体推离画面中心", () => {
  const { resolveAutoPlanCameraFromIntent } = serviceModule;
  const environment = { projectionCenterHeight: 2, domeRadius: 20, yawDeg: 0, intensity: 1 };
  const placedActors = [{ characterName: "沈烬", position: [4, 0, 0], heightMeters: 1.75 }];
  const center = resolveAutoPlanCameraFromIntent({
    intent: { compositionBias: "center", cameraAngle: "eye_level", depthOfFieldEnabled: false },
    actors: placedActors,
    shotSize: "中景",
    environment,
  });
  const left = resolveAutoPlanCameraFromIntent({
    intent: { compositionBias: "left", cameraAngle: "eye_level", depthOfFieldEnabled: false },
    actors: placedActors,
    shotSize: "中景",
    environment,
  });
  // 偏置只移动取景点与视线，主体仍在舞台原位。
  assert.notEqual(center.azim, left.azim);
  assert.ok(Math.abs(center.focalPoint[0] - left.focalPoint[0]) > 0.05
    || Math.abs(center.focalPoint[2] - left.focalPoint[2]) > 0.05);
});

test("机位俯仰意图改变视线俯仰与取景点高度而不移动主体", () => {
  const { resolveAutoPlanCameraFromIntent } = serviceModule;
  const environment = { projectionCenterHeight: 2, domeRadius: 20, yawDeg: 0, intensity: 1 };
  const placedActors = [{ characterName: "沈烬", position: [4, 0, 0], heightMeters: 1.75 }];
  const resolveWithAngle = (cameraAngle) => resolveAutoPlanCameraFromIntent({
    intent: { compositionBias: "center", cameraAngle, depthOfFieldEnabled: false },
    actors: placedActors,
    shotSize: "中景",
    environment,
  });
  const eye = resolveWithAngle("eye_level");
  const low = resolveWithAngle("low_angle");
  const high = resolveWithAngle("high_angle");
  // 俯仰由取景点竖直偏移表达：仰拍取景点抬高（视线向上、主体落画面下三分），俯拍压低。
  assert.ok(high.elev < eye.elev, `俯拍俯仰角必须更低：high=${high.elev} eye=${eye.elev}`);
  assert.ok(low.elev > eye.elev, `仰拍俯仰角必须更高：low=${low.elev} eye=${eye.elev}`);
  assert.ok(low.focalPoint[1] > eye.focalPoint[1] && eye.focalPoint[1] > high.focalPoint[1],
    `取景点高度必须按仰拍/平视/俯拍递减：low=${low.focalPoint[1]} eye=${eye.focalPoint[1]} high=${high.focalPoint[1]}`);
  // 俯仰只动取景点：方位角与主体站位不变。
  assert.ok(Math.abs(eye.azim - low.azim) < 1e-9 && Math.abs(eye.azim - high.azim) < 1e-9);
  // 取景点不低于地面。
  assert.ok(high.focalPoint[1] >= 0.1);
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
      "全景",
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
    "中景",
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
    "近景",
  );
  const yechen = result.layout.actors.find((actor) => actor.characterName === "叶晨");
  const beast = result.layout.actors.find((actor) => actor.characterName === "血角兽");
  assert.equal(yechen.pose, "lying");
  assert.equal(yechen.position[1], 0);
  assert.equal(beast.pose, "prone");
  assert.ok(beast.position[1] > yechen.position[1]);
  assert.ok(Math.hypot(beast.position[0] - yechen.position[0], beast.position[2] - yechen.position[2]) <= 0.9);
  assert.ok(beast.scale[1] > yechen.scale[1]);
});

test("自动构图从结构化姿势识别出 on_top_of 方向反转并恢复血角兽在上方", () => {
  const firstShotActors = [
    { characterName: "叶晨", sourceImageKind: "state_sheet", heightMeters: 1.75, heightSource: "manual" },
    { characterName: "血角兽", sourceImageKind: "state_sheet", heightMeters: 2.2, heightSource: "ai" },
  ];
  const reversedOutput = {
    ...planOutput,
    actors: [
      { ...planOutput.actors[0], characterName: "叶晨", position: [0.4, 0, 0.1], pose: "lying", scale: [1, 1, 1] },
      { ...planOutput.actors[1], characterName: "血角兽", position: [-0.4, 0.2, -0.1], pose: "crouching", scale: [0.7, 0.7, 0.7] },
    ],
    relations: [{
      subjectCharacterName: "叶晨",
      objectCharacterName: "血角兽",
      relation: "on_top_of",
      sizeRelation: "smaller",
    }],
  };
  const result = serviceModule.buildDramaShotBlockingAutoPlanLayout(
    reversedOutput,
    firstShotActors,
    { projectionCenterHeight: 1, domeRadius: 20, yawDeg: 0, intensity: 1 },
    "近景",
  );
  const yechen = result.layout.actors.find((actor) => actor.characterName === "叶晨");
  const beast = result.layout.actors.find((actor) => actor.characterName === "血角兽");
  assert.equal(yechen.pose, "lying");
  assert.equal(yechen.position[1], 0);
  assert.equal(beast.pose, "crouching");
  assert.ok(beast.position[1] > yechen.position[1]);
  assert.ok(Math.hypot(beast.position[0] - yechen.position[0], beast.position[2] - yechen.position[2]) <= 0.9);
  assert.ok(beast.scale[1] > yechen.scale[1]);
});

test("自动构图把上下关系的主动方朝向承载者", () => {
  const firstShotActors = [
    { characterName: "叶晨", sourceImageKind: "state_sheet", heightMeters: 1.75, heightSource: "manual" },
    { characterName: "血角兽", sourceImageKind: "state_sheet", heightMeters: 2.2, heightSource: "ai" },
  ];
  const output = {
    ...planOutput,
    actors: [
      { ...planOutput.actors[0], characterName: "叶晨", position: [0.15, 0.3, 2.3], yawDeg: -120, pose: "lying", scale: [1, 1, 1] },
      { ...planOutput.actors[1], characterName: "血角兽", position: [-0.682, 0.1, 2.643], yawDeg: 15, pose: "crouching", scale: [1, 1, 1] },
    ],
    relations: [{
      subjectCharacterName: "血角兽",
      objectCharacterName: "叶晨",
      relation: "on_top_of",
      sizeRelation: "larger",
    }],
  };
  const result = serviceModule.buildDramaShotBlockingAutoPlanLayout(
    output,
    firstShotActors,
    { projectionCenterHeight: 1, domeRadius: 20, yawDeg: 0, intensity: 1 },
    "近景",
  );
  const yechen = result.layout.actors.find((actor) => actor.characterName === "叶晨");
  const beast = result.layout.actors.find((actor) => actor.characterName === "血角兽");
  const expectedYaw = Math.atan2(
    yechen.position[0] - beast.position[0],
    yechen.position[2] - beast.position[2],
  ) * 180 / Math.PI;
  assert.ok(Math.abs(beast.yawDeg - expectedYaw) < 1e-9);
  assert.notEqual(beast.yawDeg, 15);
});

test("自动构图保留明确的贴地上方主体趴姿并朝向承载者", () => {
  const firstShotActors = [
    { characterName: "叶晨", sourceImageKind: "state_sheet", heightMeters: 1.75, heightSource: "manual" },
    { characterName: "血角兽", sourceImageKind: "state_sheet", heightMeters: 2.2, heightSource: "ai" },
  ];
  const output = {
    ...planOutput,
    actors: [
      { ...planOutput.actors[0], characterName: "叶晨", position: [0.2, 0.2, 2.3], yawDeg: 0, pose: "lying", scale: [1, 1, 1] },
      { ...planOutput.actors[1], characterName: "血角兽", position: [-0.4, 0.5, 2.1], yawDeg: 15, pose: "prone", scale: [1, 1, 1] },
    ],
    relations: [{
      subjectCharacterName: "血角兽",
      objectCharacterName: "叶晨",
      relation: "on_top_of",
      sizeRelation: "larger",
    }],
  };
  const result = serviceModule.buildDramaShotBlockingAutoPlanLayout(
    output,
    firstShotActors,
    { projectionCenterHeight: 1, domeRadius: 20, yawDeg: 0, intensity: 1 },
    "近景",
  );
  const yechen = result.layout.actors.find((actor) => actor.characterName === "叶晨");
  const beast = result.layout.actors.find((actor) => actor.characterName === "血角兽");
  assert.equal(beast.pose, "prone");
  assert.equal(yechen.pose, "lying");
  const expectedYaw = Math.atan2(
    yechen.position[0] - beast.position[0],
    yechen.position[2] - beast.position[2],
  ) * 180 / Math.PI;
  assert.ok(Math.abs(beast.yawDeg - expectedYaw) < 1e-9);
});

test("自动构图把结构化有向动作关系的 subject 朝向 object", () => {
  const relationTypes = ["facing", "attacking", "holding", "following"];
  for (const relation of relationTypes) {
    const output = {
      ...planOutput,
      actors: [
        { ...planOutput.actors[0], characterName: "沈烬", position: [2, 0, 1], yawDeg: -11, pose: "standing" },
        { ...planOutput.actors[1], characterName: "血角兽", position: [-1, 0, 4], yawDeg: 77, pose: "standing" },
      ],
      relations: [{
        subjectCharacterName: "沈烬",
        objectCharacterName: "血角兽",
        relation,
        sizeRelation: "similar",
      }],
    };
    const result = serviceModule.buildDramaShotBlockingAutoPlanLayout(
      output,
      actors,
      { projectionCenterHeight: 1, domeRadius: 20, yawDeg: 0, intensity: 1 },
      "中景",
    );
    const subject = result.layout.actors.find((actor) => actor.characterName === "沈烬");
    const object = result.layout.actors.find((actor) => actor.characterName === "血角兽");
    const expectedYaw = Math.atan2(
      object.position[0] - subject.position[0],
      object.position[2] - subject.position[2],
    ) * 180 / Math.PI;
    assert.ok(
      Math.abs(subject.yawDeg - expectedYaw) < 1e-9,
      `${relation} 必须让 subject 朝向 object`,
    );
    assert.equal(object.yawDeg, 77, `${relation} 不应无故旋转 object`);
  }
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
      "近景",
    ),
    /关系.*角色|未知|不一致/,
  );
  assert.throws(
    () => serviceModule.buildDramaShotBlockingAutoPlanLayout(
      { ...valid, relations: [...valid.relations, valid.relations[0]] },
      firstShotActors,
      environment,
      "近景",
    ),
    /重复|关系/,
  );
  assert.throws(
    () => serviceModule.buildDramaShotBlockingAutoPlanLayout(
      { ...valid, relations: [] },
      firstShotActors,
      environment,
      "近景",
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
  assert.match(serviceSource, /resolveAutoPlanCameraFromIntent/);
  assert.match(serviceSource, /不一致|遗漏|缺少/);
  assert.doesNotMatch(serviceSource, /blockingSketchData:\s*JSON\.stringify\(.*autoPlan/s);
});
