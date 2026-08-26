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

test("场景 3D 编辑器可调分界线（45%–55%）并沿用半球直径范围", () => {
  assert.match(page, /aria-label="分界线"/);
  assert.match(page, /min="45" max="55" step="1"/);
  assert.match(page, /panoramaHorizonV/);
  assert.match(viewer, /panoramaHorizonV/);
});

test("环境滑块拖动不得触发 3D 视图整体重建", () => {
  assert.match(page, /sceneMarkers: visibleSceneMarkersRef\.current/);
  assert.doesNotMatch(page, /\[environmentUrl, scene, selectedState, visibleSceneMarkers\]/);
});

test("场景 3D 编辑器投射中心高度限制为 0.5 到 2、半球直径限制为 5 到 20", () => {
  assert.match(page, /min="0.5" max="2" step="0.1"/);
  assert.match(page, /min="5" max="20" step="1"/);
  assert.match(viewer, /projectionCenterHeight: clamp\(numberOr\(input\?\.projectionCenterHeight,[\s\S]*?, 0\.5, 2\)/);
  assert.match(viewer, /domeRadius: clamp\(numberOr\(input\?\.domeRadius,[\s\S]*?, 5, 20\)/);
});
