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
const viewer = [
  read("src/pages/drama/comicDrama/components/blocking3d/blocking3dViewerApp.ts"),
  read("src/pages/drama/comicDrama/components/blocking3d/blocking3dViewerCore.ts"),
  read("src/pages/drama/comicDrama/components/blocking3d/blocking3dEnvironmentRuntime.ts"),
].join(String.fromCharCode(10));

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
  assert.match(viewer, /function createBackdropGeometry\(\s*projectionCenterHeight: number,\s*radiusMeters: number,?\s*\)/);
  assert.match(viewer, /createBackdropGeometryData\(projectionCenterHeight, radiusMeters\)/);
  assert.match(viewer, /createBackdropGeometry\(environmentSettings\.projectionCenterHeight, environmentSettings\.radiusMeters\)/);
  assert.doesNotMatch(viewer, /createUpperDomeGeometry/);
  assert.match(viewer, /createGroundDomeGeometry\(environmentSettings\.projectionCenterHeight, environmentSettings\.radiusMeters\)/);
  assert.doesNotMatch(viewer, /const groundProjection = !isEquirectangular/);
});

test("场景 3D 编辑器可调分界线（45%–55%）并沿用圆半径范围", () => {
  assert.match(page, /aria-label="分界线"/);
  assert.match(page, /min="45" max="55" step="1"/);
  assert.match(page, /panoramaHorizonV/);
  assert.match(viewer, /panoramaHorizonV/);
});

test("环境滑块拖动不得触发 3D 视图整体重建", () => {
  assert.match(page, /sceneMarkers: visibleSceneMarkersRef\.current/);
  assert.doesNotMatch(page, /\[environmentUrl, scene, selectedState, visibleSceneMarkers\]/);
});

test("场景 3D 编辑器投射中心高度按占比调节（10%–40%），半球直径限制为 5 到 30", () => {
  assert.match(page, /aria-label="投射中心高度占比"/);
  assert.match(page, /min="10" max="40" step="0\.5"/);
  assert.match(page, /projectionCenterHeightRatio/);
  assert.match(page, /STORY_SCENE_3D_ENVIRONMENT_DIAMETER_LIMITS\.min/);
  assert.match(page, /STORY_SCENE_3D_ENVIRONMENT_DIAMETER_LIMITS\.max/);
  assert.match(page, /value=\{environmentSettings\.radiusMeters \* 2\}/);
  assert.match(page, /Number\(event\.target\.value\) \/ 2/);
  assert.match(page, /round\(next\.radiusMeters \* next\.projectionCenterHeightRatio \* 100\) \/ 100/);
  assert.match(page, /半球直径/);
  assert.doesNotMatch(page, /aria-label="圆半径"/);
});
