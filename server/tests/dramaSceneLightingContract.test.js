const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildSceneLightingContract,
  buildSceneLightingAvoidInstructions,
} = require("../dist/services/drama/visual/sceneLightingContract.js");

test("scene state image is the sole lighting anchor", () => {
  const text = buildSceneLightingContract({
    sceneName: "叶晨大学出租屋",
    stateLabel: "默认",
    sceneType: "interior",
    timeOfDay: "morning",
    weather: "cloudy",
    hasReferenceImage: true,
  });
  assert.match(text, /场景光照契约/);
  assert.match(text, /状态图.*唯一|唯一.*状态图/);
  assert.match(text, /光源方向|色温|阴影/);
  assert.match(buildSceneLightingAvoidInstructions(), /暖黄|冷蓝|血红|霓虹/);
});

test("scene without a state image does not claim an image anchor", () => {
  const text = buildSceneLightingContract({
    sceneName: "公交站",
    sceneType: "exterior",
    timeOfDay: "night",
    weather: "rainy",
    hasReferenceImage: false,
  });
  assert.doesNotMatch(text, /状态图中的/);
  assert.match(text, /夜|雨/);
});
