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

test("身上状态标签契约：类型守卫 + 角色专用路由白名单 + 生图接线（2026-08-23）", () => {
  // shared：字段类型 + 白名单守卫（守卫不认 wearTags 的话整个状态会被 normalize 过滤掉）。
  assert.match(stateTypes, /wearTags\?: StoryAssetWearTag\[\]/);
  assert.match(stateTypes, /STORY_ASSET_WEAR_TAGS\.has\(tag as StoryAssetWearTag\)/);
  assert.match(stateTypes, /STORY_ASSET_WEAR_TAG_OPTIONS/);
  // 路由：wearTags 只在角色状态 schema 上（场景/道具不吃这个字段）。
  assert.match(routes, /characterAssetStateSchema = assetStateSchema\.extend\(\{[\s\S]*wearTags: z\.array\(z\.enum\(\["blood", "stain", "dust", "mud", "worn", "torn", "wound", "soot"\]\)\)/);
  // 生图：状态图角色分支把 wearTags 传进四视图模板（模板负责短语渲染与未知值丢弃）。
  assert.match(imageService, /wearTags: state\.wearTags/);
});

test("场景 AI 草稿契约允许初始状态需要的时间和天气", () => {
  assert.match(prompt, /timeOfDay/);
  assert.match(prompt, /weather/);
});
