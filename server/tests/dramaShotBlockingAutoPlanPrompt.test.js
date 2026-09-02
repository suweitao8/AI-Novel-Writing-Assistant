const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");

const { dramaShotBlockingAutoPlanPrompt } = require("../dist/prompting/prompts/drama/shotBlockingAutoPlan.prompts.js");
const promptRegistrySource = fs.readFileSync(
  path.join(__dirname, "../src/prompting/registry/promptAssetLoaderEntries.ts"),
  "utf8",
);

test("自动构图 Prompt 输出角色摆位与相机构图意图合同", () => {
  assert.equal(dramaShotBlockingAutoPlanPrompt.id, "drama.shot.blocking.autoPlan");
  assert.equal(dramaShotBlockingAutoPlanPrompt.version, "v10");
  assert.match(promptRegistrySource, /drama\.shot\.blocking\.autoPlan@v10/);
  assert.equal(dramaShotBlockingAutoPlanPrompt.mode, "structured");
  const output = dramaShotBlockingAutoPlanPrompt.outputSchema.parse({
    actors: [{ characterName: "沈烬", position: [1, 0, -1], yawDeg: 180, scale: [1, 1, 1], pose: "talking" }],
    relations: [],
    camera: {
      focalCharacterName: "沈烬",
      compositionBias: "left",
      cameraAngle: "low_angle",
      depthOfFieldEnabled: true,
    },
    compositionNote: "双人关系清楚",
  });
  assert.equal(output.actors[0].characterName, "沈烬");
  assert.equal(output.camera.focalCharacterName, "沈烬");
  assert.equal(output.camera.compositionBias, "left");
  assert.equal(output.camera.cameraAngle, "low_angle");
  assert.equal(output.camera.depthOfFieldEnabled, true);
  assert.deepEqual(output.relations, []);

  // v10：相机轨道参数不再由模型输出；即使模型多输出 azim/distance 等字段也会被 schema 剥离。
  const orbitAttempt = dramaShotBlockingAutoPlanPrompt.outputSchema.parse({
    actors: output.actors,
    relations: [],
    camera: {
      focalCharacterName: "沈烬",
      compositionBias: "center",
      cameraAngle: "eye_level",
      depthOfFieldEnabled: true,
      azim: -35,
      elev: -10,
      distance: 7,
      fovDeg: 52,
    },
    compositionNote: "多余的相机参数",
  });
  assert.equal("azim" in orbitAttempt.camera, false);
  assert.equal("distance" in orbitAttempt.camera, false);
  assert.equal("fovDeg" in orbitAttempt.camera, false);

  const relational = dramaShotBlockingAutoPlanPrompt.outputSchema.parse({
    ...output,
    camera: { ...output.camera, focalCharacterName: undefined, compositionBias: "center" },
    actors: [
      { ...output.actors[0], characterName: "血角兽", pose: "crouching" },
      { ...output.actors[0], characterName: "叶晨", pose: "lying" },
    ],
    relations: [{
      subjectCharacterName: "血角兽",
      objectCharacterName: "叶晨",
      relation: "on_top_of",
      sizeRelation: "larger",
    }],
  });
  assert.equal(relational.camera.focalCharacterName, undefined);
  assert.equal(relational.relations[0].subjectCharacterName, "血角兽");
  assert.equal(relational.relations[0].objectCharacterName, "叶晨");
  assert.equal(relational.relations[0].sizeRelation, "larger");
  assert.throws(
    () => dramaShotBlockingAutoPlanPrompt.postValidate(
      {
        ...relational,
        camera: { ...relational.camera, focalCharacterName: "不在场角色" },
      },
      { actorsJson: JSON.stringify([{ characterName: "血角兽" }, { characterName: "叶晨" }]) },
      {},
    ),
    /焦点角色/,
  );
  assert.equal(dramaShotBlockingAutoPlanPrompt.semanticRetryPolicy.maxAttempts, 1);
  const retryMessages = dramaShotBlockingAutoPlanPrompt.semanticRetryPolicy.buildMessages({
    promptId: dramaShotBlockingAutoPlanPrompt.id,
    promptVersion: dramaShotBlockingAutoPlanPrompt.version,
    attempt: 1,
    promptInput: { actorsJson: "[]", shotJson: "", sceneJson: "" },
    context: {},
    baseMessages: [],
    parsedOutput: relational,
    validationError: "关系无效",
  });
  assert.match(String(retryMessages.at(-1).content), /on_top_of/);
});

test("自动构图 Prompt 明确要求使用全部输入角色和横屏构图", () => {
  const messages = dramaShotBlockingAutoPlanPrompt.render({
    shotJson: "动作：沈烬与血角兽对峙",
    sceneJson: "荒原",
    actorsJson: "沈烬、血角兽",
  });
  const text = messages.map((message) => String(message.content)).join("\n");
  assert.match(text, /全部角色|每个.*角色/);
  assert.match(text, /16:9/);
  assert.match(text, /前景道具（床、桌、椅、沙发、书桌、柜子等）和固定结构/);
  assert.match(text, /不得与门窗、楼梯、柜子以及本镜动作没有用到的桌椅床沙发重叠/);
  assert.match(text, /可用站位半径/);
  assert.match(text, /投射中心/);
  // v10：相机由服务端按意图与角色落位生成；模型只声明焦点、三分偏置、机位俯仰与景深开关。
  assert.match(text, /相机完全由服务端生成/);
  assert.match(text, /camera\.focalCharacterName/);
  assert.match(text, /compositionBias/);
  assert.match(text, /camera\.cameraAngle/);
  assert.match(text, /俯拍/);
  assert.match(text, /仰拍/);
  assert.match(text, /景别决定主体与投射中心的距离/);
  assert.match(text, /画面左右以/);
  assert.match(text, /第一个角色是本镜叙事主体/);
  assert.match(text, /三分法/);
  assert.match(text, /180° 轴线/);
  assert.match(text, /输出前自检/);
  assert.match(text, /subject.*object|主动方.*承载方/);
  assert.match(text, /on_top_of|上方/);
  assert.match(text, /larger|更大|体量/);
  assert.match(text, /不要.*prone|禁止.*prone/);

  const constrained = dramaShotBlockingAutoPlanPrompt.render({
    shotJson: "动作：沈烬奔跑",
    sceneJson: "{}",
    actorsJson: "沈烬",
    stageRadiusMeters: 7,
    projectionCenterHeight: 1.2,
  });
  const constrainedText = constrained.map((message) => String(message.content)).join("\n");
  assert.match(constrainedText, /可用站位半径 7\.00 米/);
  assert.match(constrainedText, /边缘保留活动缓冲/);
  assert.match(constrainedText, /\[0, 1\.20, 0\]/);
});
