const test = require("node:test");
const assert = require("node:assert/strict");

const { buildSceneSheetPrompt } = require("../dist/services/comic/ComicSceneService.js");

test("旧漫剧场景全景区分合法背景与需要后置摆放的前景物", () => {
  const prompt = buildSceneSheetPrompt({
    name: "空置猎场",
    sceneType: "interior",
    bible: {
      keyElements: "床靠墙，前景有石头，白墙和远处山体",
      materials: "白墙和木地板",
    },
    stylePrefix: "写实影视化",
  });

  const contextIndex = prompt.indexOf("key elements: 床靠墙，前景有石头，白墙和远处山体");
  const policyIndex = prompt.indexOf("background layer allowed content:");
  assert.ok(contextIndex >= 0, "场景 bible 内容必须保留为背景语境");
  assert.ok(policyIndex >= 0, "旧漫剧场景入口必须使用共享背景分层规则");
  assert.ok(contextIndex < policyIndex, "共享分层规则必须位于 bible 内容之后");
  assert.match(prompt, /fixed non-interactive surfaces and architecture such as walls, ceilings, floor or terrain materials/);
  assert.match(prompt, /foreground exclusion is absolute: beds, tables, chairs, sofas, desks, cabinets, shelves, counters/);
  assert.match(prompt, /near-field natural-object exclusion is absolute: never render individual rocks, stones, boulders/);
  assert.doesNotMatch(prompt, /NO characters or only tiny background figures/);
});
