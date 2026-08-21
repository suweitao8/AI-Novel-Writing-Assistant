import test from "node:test";
import assert from "node:assert/strict";
import { buildStoryAssetPresentation } from "../src/components/storyAssets/storyAssetPresentation.ts";

test("角色、场景、道具都输出统一卡片模型和详情字段", () => {
  const character = buildStoryAssetPresentation({
    kind: "character",
    asset: { id: "c1", name: "林川", gender: "male", states: [{ id: "s1", label: "初始", description: "青年", imagePrompt: "黑发" }] },
  });
  const scene = buildStoryAssetPresentation({
    kind: "scene",
    asset: {
      id: "s1",
      name: "客厅",
      sceneType: null,
      timeOfDay: null,
      weather: null,
      environmentPrompt: null,
      states: [{ id: "initial", label: "初始状态", description: "冷色客厅", imagePrompt: "冷色灯光", sceneType: "interior", timeOfDay: "night" }],
    },
  });
  const prop = buildStoryAssetPresentation({
    kind: "prop",
    asset: {
      id: "p1",
      name: "怀表",
      visualPrompt: "铜制外壳",
      image: { status: "done", url: "/legacy-watch.png" },
      states: [{ id: "initial", label: "初始状态", description: "铜制怀表", imagePrompt: "铜制外壳", image: { status: "done", url: "/watch.png" } }],
    },
  });

  assert.deepEqual([character.kind, scene.kind, prop.kind], ["character", "scene", "prop"]);
  assert.equal(character.typeLabel, "角色");
  assert.equal(scene.typeLabel, "场景");
  assert.equal(prop.typeLabel, "道具");
  assert.equal(character.details.some((item) => item.label === "性别" && item.value === "男"), true);
  assert.equal(scene.states[0].imagePrompt, "冷色灯光");
  assert.equal(prop.media, null);
  assert.equal(prop.states[0].imageUrl, "/watch.png");
});

test("详情字段会过滤空值并保留状态图片与音色信息", () => {
  const view = buildStoryAssetPresentation({
    kind: "character",
    asset: {
      id: "c2", name: "空字段角色", gender: "unknown", states: [{
        id: "s2", label: "受伤", description: "左臂包扎", imagePrompt: "绷带", voicePrompt: "沙哑",
        image: { url: "/hurt.png" },
      }],
    },
  });
  assert.equal(view.details.some((item) => !item.value.trim()), false);
  assert.equal(view.states[0].imageUrl, "/hurt.png");
  assert.equal(view.states[0].voicePrompt, "沙哑");
});

test("场景的类型、时间、天气从状态展示而不是依赖资产顶层", () => {
  const view = buildStoryAssetPresentation({
    kind: "scene",
    asset: {
      id: "s2",
      name: "荒原",
      sceneType: null,
      timeOfDay: null,
      weather: null,
      environmentPrompt: null,
      states: [{
        id: "initial",
        label: "暴雨夜",
        description: "空旷荒原被暴雨冲刷",
        imagePrompt: "湿冷岩地，远处山脊被闪电照亮",
        sceneType: "nature",
        timeOfDay: "night",
        weather: "rainy",
      }],
    },
  });

  assert.equal(view.badges.includes("自然"), true);
  assert.equal(view.badges.includes("晚上"), true);
  assert.equal(view.badges.includes("雨天"), true);
  assert.equal(view.states[0].sceneTypeLabel, "自然");
  assert.equal(view.states[0].timeOfDayLabel, "晚上");
  assert.equal(view.states[0].weatherLabel, "雨天");
});
