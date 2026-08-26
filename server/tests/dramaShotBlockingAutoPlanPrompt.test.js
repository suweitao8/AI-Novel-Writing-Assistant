const assert = require("node:assert/strict");
const test = require("node:test");

const { dramaShotBlockingAutoPlanPrompt } = require("../dist/prompting/prompts/drama/shotBlockingAutoPlan.prompts.js");

test("自动构图 Prompt 输出完整角色摆位与相机景深合同", () => {
  assert.equal(dramaShotBlockingAutoPlanPrompt.id, "drama.shot.blocking.autoPlan");
  assert.equal(dramaShotBlockingAutoPlanPrompt.version, "v3");
  assert.equal(dramaShotBlockingAutoPlanPrompt.mode, "structured");
  const output = dramaShotBlockingAutoPlanPrompt.outputSchema.parse({
    actors: [{ characterName: "沈烬", position: [1, 0, -1], yawDeg: 180, scale: [1, 1, 1], pose: "talking" }],
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
  assert.match(text, /空间固定物体标记/);
  assert.match(text, /不要与.*重叠/);
  assert.match(text, /kind 为 floor.*可行走地面/);
  assert.match(text, /站立区域而不是障碍物/);
  assert.match(text, /投射中心/);

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
