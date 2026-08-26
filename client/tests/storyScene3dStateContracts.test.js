import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";

const read = (relativePath) => fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
const assetForms = read("src/pages/novels/components/storySettings/assetForms.tsx");
const scenesTab = read("src/pages/novels/components/storySettings/SettingsScenesTab.tsx");
const dialog = read("src/pages/novels/components/storySettings/StoryAssetEditDialog.tsx");
const page = read("src/pages/drama/comicDrama/DramaScene3DPage.tsx");
const router = read("src/router/index.tsx");
const viewer = read("src/pages/drama/comicDrama/components/blocking3d/blocking3dViewerApp.ts");

test("场景状态图片操作旁提供携带当前状态的 3D 编辑入口", () => {
  assert.match(assetForms, /fit="natural"/);
  assert.match(assetForms, /3D编辑/);
  assert.match(assetForms, /buildScene3dEditorPath\(asset\.novelId, asset\.assetId, selectedState\.id\)/);
});

test("场景 3D 编辑器使用路由指定的状态图", () => {
  assert.match(router, /drama\/studio\/:novelId\/scenes\/:sceneId\/states\/:stateId\/3d/);
  assert.match(page, /stateId/);
  assert.match(page, /states\.find\(\(state\) => state\.id === stateId\)/);
  assert.doesNotMatch(page, /const defaultState = scene\.states\.find/);
});

test("场景级入口不再重复提供 3D 编辑", () => {
  assert.doesNotMatch(scenesTab, /3D场景编辑/);
  assert.doesNotMatch(dialog, /3D场景编辑/);
});

test("2:1 全景图也通过连续 EnviroDome 投影，使投射中心高度参与地面重建", () => {
  assert.match(viewer, /function createBackdropGeometry\(projectionCenterHeight: number, domeRadius: number\)/);
  assert.match(viewer, /createBackdropGeometryData\(projectionCenterHeight, domeRadius\)/);
  assert.match(viewer, /createBackdropGeometry\(environmentSettings\.projectionCenterHeight, environmentSettings\.domeRadius\)/);
  assert.doesNotMatch(viewer, /createUpperDomeGeometry/);
  assert.doesNotMatch(viewer, /createGroundDomeGeometry\(environmentSettings\.projectionCenterHeight/);
  assert.doesNotMatch(viewer, /const groundProjection = !isEquirectangular/);
});

test("场景 3D 编辑器不再暴露可调全景地面分界", () => {
  assert.doesNotMatch(page, /全景地面分界/);
  assert.doesNotMatch(page, /panoramaHorizonV/);
  assert.doesNotMatch(viewer, /panoramaHorizonV/);
});
