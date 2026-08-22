const test = require("node:test");
const assert = require("node:assert/strict");

// 资产状态图（StoryAssetStateImageService）纯函数契约：
// 提示词组装（角色/场景/道具 + 基础外观 + 状态变化 + 参考图一致性指令）
// 与参考图解析（只认已生成完成的状态图）。

const {
  buildStateImagePrompt,
  resolveStateReferenceImageUrl,
} = require("../dist/modules/novel/story-settings/application/StoryAssetStateImageService.js");
const fs = require("node:fs");
const path = require("node:path");

const imageServiceSource = fs.readFileSync(
  path.join(__dirname, "../src/modules/novel/story-settings/application/StoryAssetStateImageService.ts"),
  "utf8",
);

test("buildStateImagePrompt：角色带状态身份信息与参考图一致性指令", () => {
  const prompt = buildStateImagePrompt({
    kind: "character",
    assetName: "林澈",
    baseAppearance: null,
    gender: "male",
    state: { label: "重伤", ageGroup: "youth", description: "左臂受伤流血", imagePrompt: "衣服破损，左臂缠着渗血的绷带" },
    hasReference: true,
  }, ["style: 角色画风", "style: 现代都市"]);
  assert.match(prompt, /character state reference image/);
  assert.match(prompt, /subject: 林澈/);
  assert.match(prompt, /gender: male/);
  assert.match(prompt, /age group: youth/);
  assert.match(prompt, /state: 重伤/);
  assert.match(prompt, /state change: 左臂受伤流血/);
  assert.match(prompt, /state image prompt: 衣服破损/);
  assert.match(prompt, /keep the same subject identity as the reference image, change only what the state describes/);
  assert.ok(prompt.startsWith("style: 角色画风"));
});

test("buildStateImagePrompt：不参考时不输出一致性指令；场景/道具各用主题行", () => {
  const scene = buildStateImagePrompt({
    kind: "scene",
    assetName: "废弃地铁站",
    baseAppearance: null,
    state: {
      label: "黑夜",
      description: "停电后的站台",
      imagePrompt: "应急灯红光，一片漆黑",
      sceneType: "exterior",
      timeOfDay: "night",
      weather: "rainy",
    },
    hasReference: false,
  }, []);
  assert.match(scene, /scene state reference image/);
  assert.match(scene, /subject: 废弃地铁站/);
  assert.match(scene, /scene type: exterior/);
  assert.match(scene, /time of day: night/);
  assert.match(scene, /weather: rainy/);
  assert.doesNotMatch(scene, /base appearance: /);
  const prop = buildStateImagePrompt({
    kind: "prop",
    assetName: "军刀",
    baseAppearance: "生锈的军刀",
    state: { label: "折断", description: "刀身折断", imagePrompt: "断裂的刀身，断口发亮" },
    hasReference: false,
  }, []);
  assert.match(prop, /prop state reference image/);
  assert.match(prop, /base appearance: 生锈的军刀/);
  assert.doesNotMatch(prop, /keep the same subject identity/);
  // 2026-08-22：角色/道具参考图统一透明底；场景全景保持不透明。
  assert.match(prop, /fully transparent background, genuine PNG alpha channel/);
  assert.doesNotMatch(scene, /fully transparent background/);
  // 旧提示词里的风格/背景/视图词只是内容描述，不改变渲染方向与背景规则。
  assert.match(prop, /metadata only/);
});

test("场景状态提示词会把叙事里的生物改写为环境痕迹", () => {
  const prompt = buildStateImagePrompt({
    kind: "scene",
    assetName: "荒原猎场",
    baseAppearance: null,
    state: { label: "血雾", description: "怪物出没后的荒原", imagePrompt: "远处有猛兽轮廓" },
    hasReference: false,
  }, []);
  assert.match(prompt, /pure empty environment reference/);
  assert.match(prompt, /environmental traces/);
  assert.doesNotMatch(prompt, /猛兽/);
  assert.doesNotMatch(prompt, /怪物/);
});

test("角色状态图一次生成完整四视图，不再四次独立生图后裁切", () => {
  assert.match(imageServiceSource, /runImageGeneration/);
  assert.match(imageServiceSource, /buildCharacterStateSheetPrompt/);
  assert.match(imageServiceSource, /buildAssetStylePromptLines\(kind, styleContext\.assets\[kind\]/);
  assert.doesNotMatch(imageServiceSource, /runCompositeImageGeneration/);
  assert.doesNotMatch(imageServiceSource, /buildCharacterStateViewPrompts/);
  assert.doesNotMatch(imageServiceSource, /styleContext\.universal/);
});

test("resolveStateReferenceImageUrl：未指定参考时默认取上一状态，null 才表示明确不参考", () => {
  const states = [
    { id: "s1", label: "初始", description: "", imagePrompt: "", image: { status: "done", url: "/api/novels/n1/settings/state-images/s1" } },
    { id: "s2", label: "生成中", description: "", imagePrompt: "", image: { status: "generating" } },
    { id: "s3", label: "无图", description: "", imagePrompt: "" },
    { id: "s4", label: "参考初始", description: "", imagePrompt: "", referenceStateId: "s1" },
  ];
  assert.equal(
    resolveStateReferenceImageUrl(states, { ...states[3], referenceStateId: "s1" }),
    "/api/novels/n1/settings/state-images/s1",
  );
  assert.equal(resolveStateReferenceImageUrl(states, { ...states[3], referenceStateId: "s2" }), "/api/novels/n1/settings/state-images/s1");
  assert.equal(resolveStateReferenceImageUrl(states, { ...states[3], referenceStateId: "s3" }), "/api/novels/n1/settings/state-images/s1");
  assert.equal(resolveStateReferenceImageUrl(states, { ...states[3], referenceStateId: "s404" }), null);
  assert.equal(resolveStateReferenceImageUrl(states, { ...states[3], referenceStateId: null }), null);
  assert.equal(
    resolveStateReferenceImageUrl(
      [states[0], { id: "s5", label: "默认上一状态", description: "", imagePrompt: "" }],
      { id: "s5", label: "默认上一状态", description: "", imagePrompt: "" },
    ),
    "/api/novels/n1/settings/state-images/s1",
  );
});

test("resolveStateReferenceImageUrl：直接参考状态没有图片时继续沿祖先链查找", () => {
  const states = [
    { id: "s1", label: "初始", description: "正常", imagePrompt: "正常", image: { status: "done", url: "/state/s1" } },
    { id: "s2", label: "受伤", description: "轻伤", imagePrompt: "轻伤" },
    { id: "s3", label: "重伤", description: "重伤", imagePrompt: "重伤" },
  ];
  assert.equal(resolveStateReferenceImageUrl(states, states[2]), "/state/s1");
});

test("场景和道具状态图写回时会保留无状态旧资产的初始状态", () => {
  assert.match(imageServiceSource, /normalizeStoryAssetStates/);
  assert.match(imageServiceSource, /updateStoryAssetStateJsonWithCas/);
  assert.match(imageServiceSource, /statesJson: expectedRaw/);
});
