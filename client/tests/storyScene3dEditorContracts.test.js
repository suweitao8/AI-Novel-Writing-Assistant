import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";

const read = (relativePath) => fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
const storySettingsApi = read("src/api/story/storySettings.ts");
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

test("场景资产入口提供 3D 场景编辑", () => {
  assert.match(scenesTab, /编辑.*3D场景|3D场景编辑/);
  assert.match(dialog, /3D场景编辑/);
  assert.match(router, /drama\/studio\/:novelId\/scenes\/:sceneId\/3d/);
});

test("场景 3D 编辑器用角色代理校准比例并保存场景级参数", () => {
  assert.match(page, /createBlocking3dViewer/);
  assert.match(page, /比例参照/);
  assert.match(page, /场景资产 HDRI/);
  assert.match(page, /min="1" max="10" step="0\.1"/);
  assert.match(page, /min="10" max="50" step="1"/);
  assert.match(page, /保存场景参数/);
  assert.match(page, /updateStorySettingsScene/);
  assert.doesNotMatch(page, /layout3d|saveDramaShotBlockingSketch/);
});
