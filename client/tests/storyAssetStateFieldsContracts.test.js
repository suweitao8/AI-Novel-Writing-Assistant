import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (relativePath) => readFileSync(new URL(`../src/${relativePath}`, import.meta.url), "utf8");
const assetForms = read("pages/novels/components/storySettings/assetForms.tsx");
const scenes = read("pages/novels/components/storySettings/SettingsScenesTab.tsx");
const props = read("pages/novels/components/storySettings/SettingsPropsTab.tsx");
const characters = read("pages/novels/components/storySettings/SettingsCharactersTab.tsx");
const detail = read("components/storyAssets/StoryAssetDetailDialog.tsx");
const extractionDialog = read("pages/drama/comicDrama/components/ExtractApplyDialog.tsx");
const extractionStage = read("pages/drama/comicDrama/hooks/useReferenceExtractStage.ts");

test("场景和道具资产级表单只保留名称", () => {
  const sceneForm = assetForms.match(/export interface SceneAssetFormState \{[\s\S]*?\n\}/)?.[0] ?? "";
  const propForm = assetForms.match(/export interface PropAssetFormState \{[\s\S]*?\n\}/)?.[0] ?? "";
  assert.match(sceneForm, /name: string/);
  assert.doesNotMatch(sceneForm, /sceneType|timeOfDay|weather|environmentPrompt/);
  assert.match(propForm, /name: string/);
  assert.doesNotMatch(propForm, /visualPrompt/);
});

test("场景状态编辑器承载类型、时间、天气和图片提示词", () => {
  assert.match(assetForms, /kind === "scene"/);
  assert.match(assetForms, /场景类型/);
  assert.match(assetForms, /时间/);
  assert.match(assetForms, /天气/);
  assert.match(assetForms, /图片提示词/);
  assert.match(scenes, /<AssetStatesEditor[\s\S]*kind="scene"/);
  assert.match(props, /<AssetStatesEditor[\s\S]*kind="prop"/);
});

test("三类资产创建时都显示状态编辑器，且编辑弹窗统一放大", () => {
  assert.match(scenes, /<AssetStatesEditor states=\{states\}/);
  assert.match(props, /<AssetStatesEditor states=\{states\}/);
  assert.match(scenes, /setStates\(\[createInitialSceneState\(\{ name: "" \}\)\]\)/);
  assert.match(props, /setStates\(\[createInitialPropState\(\{ name: "" \}\)\]\)/);
  assert.match(characters, /setStates\(\[createInitialCharacterState/);
  assert.match(characters, /className="max-w-6xl"/);
  assert.match(scenes, /className="max-w-6xl"/);
  assert.match(props, /className="max-w-6xl"/);
  assert.match(detail, /className="max-w-5xl"/);
});

test("道具正式编辑入口不再单独维护旧透视图", () => {
  assert.doesNotMatch(props, /generateStoryPropImage/);
  assert.doesNotMatch(props, /45° 透视参考图/);
});

test("小说章节提取应用也使用同一套状态字段", () => {
  assert.match(extractionDialog, /<AssetStatesEditor/);
  assert.match(extractionDialog, /createInitialSceneState/);
  assert.match(extractionDialog, /createInitialPropState/);
  assert.match(extractionStage, /form\.states/);
  assert.doesNotMatch(extractionStage, /form\.environmentPrompt|form\.visualPrompt/);
});
