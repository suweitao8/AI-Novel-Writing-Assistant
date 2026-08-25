import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (relativePath) => readFileSync(new URL(`../src/${relativePath}`, import.meta.url), "utf8");
const scenesSource = read("pages/novels/components/storySettings/SettingsScenesTab.tsx");
const outlineSource = read("pages/drama/comicDrama/components/OutlineSettingsAside.tsx");
const assetEditDialogSource = read("pages/novels/components/storySettings/StoryAssetEditDialog.tsx");
const assetFormsSource = read("pages/novels/components/storySettings/assetForms.tsx");

test("场景编辑器通过统一资产弹窗展示和生成状态图片", () => {
  assert.doesNotMatch(scenesSource, /generateStorySceneImage/);
  assert.doesNotMatch(scenesSource, /360° 全景参考图/);
  assert.match(scenesSource, /<StoryAssetEditDialog[\s\S]*kind="scene"/);
  assert.match(assetEditDialogSource, /<AssetStatesEditor[\s\S]*kind=\{kind\}/);
});

test("大纲侧场景详情只展示场景状态图片", () => {
  assert.doesNotMatch(outlineSource, /scene\.image\?\.url/);
  assert.doesNotMatch(outlineSource, /全景图/);
  assert.match(outlineSource, /StoryAssetEditDialog/);
  assert.match(outlineSource, /buildStoryAssetPresentation/);
});

test("场景状态编辑器只展示静态状态图，3D效果通过独立编辑入口进入", () => {
  assert.doesNotMatch(assetFormsSource, /PanoramaViewer/);
  assert.doesNotMatch(assetFormsSource, /sceneFlatView/);
  assert.doesNotMatch(assetFormsSource, /平面图|360° 预览/);
  assert.match(assetFormsSource, /<LightboxImage[\s\S]*selectedState\.image\.url/);
  assert.match(assetFormsSource, /buildScene3dEditorPath\(asset\.novelId, asset\.assetId, selectedState\.id\)/);
  assert.match(assetFormsSource, /3D编辑/);
});
