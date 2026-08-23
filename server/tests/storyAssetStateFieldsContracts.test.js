const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.join(__dirname, "..", "..");
const read = (relativePath) => fs.readFileSync(path.join(projectRoot, relativePath), "utf8");
const stateTypes = read("shared/types/novelReferenceExtraction.ts");
const statePolicy = read("server/src/modules/novel/story-settings/application/StorySettingsStatePolicy.ts");
const routes = read("server/src/modules/novel/story-settings/http/storySettingsRoutes.ts");
const imageService = read("server/src/modules/novel/story-settings/application/StoryAssetStateImageService.ts");
const keyframeService = read("server/src/services/drama/visual/DramaShotKeyframeService.ts");
const prompt = read("server/src/prompting/prompts/novel/storySettings.prompts.ts");

test("状态契约包含场景状态字段，旧场景字段由归一化策略注入初始状态", () => {
  assert.match(stateTypes, /sceneType\?: StoryAssetSceneType/);
  assert.match(stateTypes, /timeOfDay\?: StoryAssetTimeOfDay/);
  assert.match(stateTypes, /weather\?: StoryAssetWeather/);
  assert.match(statePolicy, /sceneType/);
  assert.match(statePolicy, /timeOfDay/);
  assert.match(statePolicy, /weather/);
  assert.match(statePolicy, /normalizeStoryAssetStates\(states, \{[\s\S]*sceneType/);
});

test("状态生图和首帧接线读取场景状态元数据", () => {
  assert.match(routes, /sceneType:[\s\S]*assetStateSchema/);
  assert.match(routes, /timeOfDay:[\s\S]*assetStateSchema/);
  assert.match(routes, /weather:[\s\S]*assetStateSchema/);
  assert.match(imageService, /state\.sceneType/);
  assert.match(imageService, /state\.timeOfDay/);
  assert.match(imageService, /state\.weather/);
  assert.match(keyframeService, /timeOfDay/);
  assert.match(keyframeService, /weather/);
});

test("身上状态标签契约：5 标签 + 旧 id 迁移 + 守卫只查结构 + 生图接线（2026-08-23，同日合并）", () => {
  // shared：5 标签契约（血迹/脏污/破损/伤痕/烟熏）+ 旧 8 标签迁移映射——守卫只查
  // 「是数组」，枚举校验会把带旧 id 的整个状态在读取时过滤掉（丢状态）；
  // 迁移/白名单过滤统一在 normalizeStoryAssetStates 的 canonicalizeWearTags。
  assert.match(stateTypes, /wearTags\?: StoryAssetWearTag\[\]/);
  assert.match(stateTypes, /type StoryAssetWearTag = "blood" \| "grime" \| "damage" \| "wound" \| "soot"/);
  assert.match(stateTypes, /LEGACY_STORY_ASSET_WEAR_TAG_MAP/);
  assert.match(stateTypes, /canonicalizeWearTags\(legacyWearTags\)/);
  assert.match(stateTypes, /STORY_ASSET_WEAR_TAG_OPTIONS/);
  // 路由：wearTags 只在角色状态 schema 上（场景/道具不吃这个字段）；结构校验放宽，
  // 旧标签 id 与未知值由归一化迁移/过滤，旧客户端保存不报错。
  assert.match(routes, /characterAssetStateSchema = assetStateSchema\.extend\(\{[\s\S]*wearTags: z\.array\(z\.string\(\)\.trim\(\)\.min\(1\)\.max\(20\)\)\.max\(8\)/);
  // 生图：状态图角色分支把 wearTags 传进四视图模板（模板负责短语渲染与未知值丢弃）。
  assert.match(imageService, /wearTags: state\.wearTags/);
});

test("场景 AI 草稿契约允许初始状态需要的时间和天气", () => {
  assert.match(prompt, /timeOfDay/);
  assert.match(prompt, /weather/);
});

test("身上状态旧标签 id 在归一化时自动迁移合并，不丢状态（2026-08-23 合并为 5 标签）", () => {
  const { normalizeStoryAssetStates } = require("@ai-novel/shared/types/novelReferenceExtraction");
  // 首版 8 标签里存的 stain/dust/mud/worn/torn 归一化后分别并进 grime/damage；
  // 未知标签丢弃；空结果不保留字段（不勾＝干净）。
  const states = normalizeStoryAssetStates([
    {
      id: "s1",
      label: "战后",
      description: "刚经历恶战",
      imagePrompt: "青年男性",
      wearTags: ["dust", "stain", "torn", "legacy_unknown"],
    },
  ]);
  assert.deepEqual(states[0].wearTags, ["grime", "damage"]);
  const clean = normalizeStoryAssetStates([
    { id: "s1", label: "日常", description: "日常便装", imagePrompt: "青年男性", wearTags: ["legacy_unknown"] },
  ]);
  assert.equal(clean[0].wearTags, undefined);
});
