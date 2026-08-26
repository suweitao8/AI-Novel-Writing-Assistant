import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";

const read = (relativePath) => fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
const storySettingsApi = read("src/api/story/storySettings.ts");
const assetForms = read("src/pages/novels/components/storySettings/assetForms.tsx");
const scenesTab = read("src/pages/novels/components/storySettings/SettingsScenesTab.tsx");
const dialog = read("src/pages/novels/components/storySettings/StoryAssetEditDialog.tsx");
const page = read("src/pages/drama/comicDrama/DramaScene3DPage.tsx");
const router = read("src/router/index.tsx");

test("场景资产 API 暴露统一 HDRI 参数读写", () => {
  assert.match(storySettingsApi, /scene3dEnvironment/);
  assert.match(storySettingsApi, /getStorySettingsScene/);
  assert.match(storySettingsApi, /settings\/scenes\/\$\{encodeURIComponent\(sceneId\)\}/);
  assert.match(storySettingsApi, /updateStorySettingsScene/);
});

test("场景状态图片旁提供携带当前状态的 3D 场景编辑", () => {
  assert.match(assetForms, /fit="natural"/);
  assert.match(assetForms, /3D编辑/);
  assert.match(assetForms, /buildScene3dEditorPath\(asset\.novelId, asset\.assetId, selectedState\.id\)/);
  assert.doesNotMatch(scenesTab, /3D场景编辑/);
  assert.doesNotMatch(dialog, /3D场景编辑/);
  assert.match(router, /drama\/studio\/:novelId\/scenes\/:sceneId\/states\/:stateId\/3d/);
});

test("场景 3D 编辑器用角色代理校准比例并保存场景级参数", () => {
  assert.match(page, /createBlocking3dViewer/);
  assert.match(page, /比例参照|参考角色/);
  assert.match(page, /场景环境/);
  assert.match(page, /min="0.5" max="2" step="0\.1"/);
  assert.match(page, /min="5" max="20" step="1"/);
  assert.match(page, /aria-label="全景地面分界"/);
  assert.match(page, /min="40" max="65" step="1"/);
  assert.match(page, /panoramaHorizonV/);
  assert.match(page, /saveBeforeExit/);
  assert.match(page, /await saveBeforeExit\(\)/);
  assert.match(page, /updateStorySettingsScene/);
  assert.match(page, /场景参数已保存/);
  assert.doesNotMatch(page, /自动保存/);
  assert.doesNotMatch(page, /saveTimerRef/);
  assert.doesNotMatch(page, /setTimeout\(\(\) => \{[\s\S]*saveScene/);
  assert.doesNotMatch(page, /window\.confirm/);
  assert.doesNotMatch(page, /layout3d|saveDramaShotBlockingSketch/);
});
