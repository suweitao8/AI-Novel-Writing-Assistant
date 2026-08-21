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
    asset: { id: "s1", name: "客厅", sceneType: "interior", timeOfDay: "night", weather: null, environmentPrompt: "冷色灯光", states: [] },
  });
  const prop = buildStoryAssetPresentation({
    kind: "prop",
    asset: { id: "p1", name: "怀表", visualPrompt: "铜制外壳", image: { status: "done", url: "/watch.png" }, states: [] },
  });

  assert.deepEqual([character.kind, scene.kind, prop.kind], ["character", "scene", "prop"]);
  assert.equal(character.typeLabel, "角色");
  assert.equal(scene.typeLabel, "场景");
  assert.equal(prop.typeLabel, "道具");
  assert.equal(character.details.some((item) => item.label === "性别" && item.value === "男"), true);
  assert.equal(scene.details.some((item) => item.label === "图片提示词" && item.value === "冷色灯光"), true);
  assert.equal(prop.media?.url, "/watch.png");
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
