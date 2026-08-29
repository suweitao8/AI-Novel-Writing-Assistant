const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");

const { dramaShotBlockingAutoPlanPrompt } = require("../dist/prompting/prompts/drama/shotBlockingAutoPlan.prompts.js");
const promptRegistrySource = fs.readFileSync(
  path.join(__dirname, "../src/prompting/registry/promptAssetLoaderEntries.ts"),
  "utf8",
);

test("自动构图 Prompt 输出完整角色摆位与相机景深合同", () => {
  assert.equal(dramaShotBlockingAutoPlanPrompt.id, "drama.shot.blocking.autoPlan");
  assert.equal(dramaShotBlockingAutoPlanPrompt.version, "v8");
  assert.match(promptRegistrySource, /drama\.shot\.blocking\.autoPlan@v8/);
  assert.equal(dramaShotBlockingAutoPlanPrompt.mode, "structured");
  const output = dramaShotBlockingAutoPlanPrompt.outputSchema.parse({
    actors: [{ characterName: "沈烬", position: [1, 0, -1], yawDeg: 180, scale: [1, 1, 1], pose: "talking" }],
    relations: [],
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
  });
  assert.equal(output.actors[0].characterName, "沈烬");
  assert.equal(output.camera.depthOfFieldEnabled, true);
  assert.deepEqual(output.relations, []);

  const relational = dramaShotBlockingAutoPlanPrompt.outputSchema.parse({
    ...output,
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
  assert.equal(relational.relations[0].subjectCharacterName, "血角兽");
  assert.equal(relational.relations[0].objectCharacterName, "叶晨");
  assert.equal(relational.relations[0].sizeRelation, "larger");
  assert.throws(
    () => dramaShotBlockingAutoPlanPrompt.postValidate(
      output,
      { actorsJson: JSON.stringify([{ characterName: "血角兽" }, { characterName: "叶晨" }]) },
      {},
    ),
    /角色名单/,
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
  // v5：可行走地面薄板已移除，站位只受投射中心半径约束。
  assert.doesNotMatch(text, /floor|可行走地面/);
  assert.match(text, /可用站位半径/);
  assert.match(text, /投射中心/);
  // v4：构图工艺基线——景别距离、三分法、轴线、相机高度语义与出画自检。
  assert.match(text, /景别定距离/);
  assert.match(text, /三分法/);
  assert.match(text, /180° 轴线/);
  assert.match(text, /elev 为负是俯拍/);
  assert.match(text, /输出前自检/);
  assert.match(text, /subject.*object|主动方.*承载方/);
  assert.match(text, /on_top_of|上方/);
  assert.match(text, /larger|更大|体量/);
  assert.match(text, /先识别关系.*再规划坐标|关系.*坐标/);
  assert.match(text, /subject.*crouching.*kneeling/);
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
