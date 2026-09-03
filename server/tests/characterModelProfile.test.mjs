import assert from "node:assert/strict";
import test from "node:test";

import {
  storyEntityGeneratePrompt,
  storySettingsBundlePrompt,
} from "../src/prompting/prompts/novel/storySettings.prompts.ts";

function characterFields() {
  return {
    name: "林岚",
    role: "侦查员",
    gender: "female",
    actorKind: "human",
    bodyBuild: "slender",
    ageGroup: "youth",
    physique: "肩背清瘦，行动轻快",
    personality: "谨慎而果断，习惯先观察再行动。",
    appearance: "短发，眉眼锐利。",
    attireStyle: "轻便的深色外套。",
    facePrompt: "女性，青年，黑色短发，锐利眼睛，暖肤色，窄脸",
    voicePrompt: "清亮偏低，语速克制。",
    background: "来自边境城镇。",
  };
}

test("设定包角色 schema 接受结构化演员类型和体型", () => {
  const parsed = storySettingsBundlePrompt.outputSchema.parse({
    characters: [characterFields()],
    scenes: [{
      name: "边境城",
      sceneType: "exterior",
      timeOfDay: "morning",
      weather: "sunny",
      summary: "边境城的主街。",
      significance: "线索交汇处。",
      environmentPrompt: "石墙、木楼与晨雾构成的边境主街空间，远处有钟楼和巡逻塔，地面铺着旧石板。",
      mapLocationName: "边境城",
    }],
    props: [{
      name: "铜哨",
      propType: "accessory",
      description: "旧铜制哨子。",
      plotFunction: "传递暗号。",
      visualPrompt: "磨损铜面、细小刻纹与暗金色泽，尺寸便于握持。",
      importance: "minor",
    }],
    world: {
      premise: "边境城里隐藏着一场秘密交易。",
      era: "架空近代",
      toneRules: ["克制"],
      keySettings: [
        { title: "边境", content: "各方势力在此交错并争夺商路。" },
        { title: "钟楼", content: "钟声是城内约定俗成的时间信号。" },
      ],
      mapLocations: [
        { id: "border", name: "边境城", kind: "city", summary: "边境城市与贸易关口。" },
        { id: "square", name: "主街广场", kind: "other", summary: "线索交汇的公共广场。" },
      ],
      mapEdges: [],
    },
  });

  assert.equal(parsed.characters[0].actorKind, "human");
  assert.equal(parsed.characters[0].bodyBuild, "slender");
});

test("实体角色草稿 schema 接受结构化体型并拒绝自由文本替代值", () => {
  const parsed = storyEntityGeneratePrompt.outputSchema.parse({
    character: characterFields(),
    scene: null,
    prop: null,
  });
  assert.equal(parsed.character.bodyBuild, "slender");
  assert.throws(() => storyEntityGeneratePrompt.outputSchema.parse({
    character: { ...characterFields(), bodyBuild: "魁梧" },
    scene: null,
    prop: null,
  }));
});
