import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => {
  const url = new URL(path, import.meta.url);
  return existsSync(url) ? readFileSync(url, "utf8") : "";
};

const presetSource = read("../src/pages/models/modelLibrary3d/studioEnvironmentPresets.ts");
const runtimeSource = read("../src/pages/models/modelLibrary3d/studioEnvironmentRuntime.ts");
const blockingEnvironmentRuntimeSource = read(
  "../src/pages/drama/comicDrama/components/blocking3d/blocking3dEnvironmentRuntime.ts",
);
const viewerSource = read("../src/pages/models/modelLibrary3d/modelViewerApp.ts");
const thumbnailSource = read("../src/pages/models/modelLibrary3d/thumbnailStudio.ts");
const animationThumbnailSource = read("../src/pages/animations/animationThumbnailStudio.ts");
const editorSource = read("../src/pages/models/ModelEditorPage.tsx");
const settingsSource = read("../src/pages/settings/views/NarratorVoiceSettingsPage.tsx");

test("模型环境预设使用 5 到 30 米的半球直径", () => {
  assert.match(presetSource, /interior/);
  assert.match(presetSource, /exterior/);
  assert.match(presetSource, /nature/);
  assert.match(presetSource, /STUDIO_ENVIRONMENT_DIAMETER_LIMITS/);
  assert.match(presetSource, /min:\s*5/);
  assert.match(presetSource, /max:\s*30/);
  assert.equal((presetSource.match(/diameterMeters:\s*15/g) ?? []).length, 3);
  assert.match(presetSource, /projectionCenterHeightMeters:\s*2/);
  assert.match(presetSource, /panoramaHorizonV:\s*0\.5/);
  assert.match(presetSource, /getStudioEnvironmentDiameterMeters\(diameterMeters\)\s*\/\s*2/);
});

test("模型可见穹顶不接收相机且固定在原点", () => {
  assert.match(runtimeSource, /new pc\.Entity\("studio-environment-world"\)/);
  assert.match(runtimeSource, /createBlocking3dEnvironmentRuntime/);
  assert.match(blockingEnvironmentRuntimeSource, /setPosition\(environmentWorldPosition\)/);
  assert.doesNotMatch(runtimeSource, /camera\??\s*:/);
});

test("模型环境运行时同时装配可见穹顶和环境光", () => {
  assert.match(runtimeSource, /createBlocking3dEnvironmentRuntime/);
  assert.match(runtimeSource, /environment\.load\(/);
  assert.doesNotMatch(runtimeSource, /upgradeStudioEnvironment\(app/);
  assert.doesNotMatch(runtimeSource, /attachStudioBackdrop\(app/);
  assert.doesNotMatch(runtimeSource, /Promise\.all/);
  assert.match(runtimeSource, /hasVisibleBackdrop/);
});

test("模型查看器固定相机轨道并支持异步切换环境", () => {
  assert.match(viewerSource, /environmentPresetId\?: StudioEnvironmentPresetId/);
  assert.match(viewerSource, /setEnvironmentPreset: \(presetId: StudioEnvironmentPresetId\)/);
  assert.match(viewerSource, /environmentDiameterMeters\?: number/);
  assert.match(viewerSource, /setEnvironmentDiameter: \(diameterMeters: number\)/);
  assert.match(viewerSource, /loadStudioEnvironment\(app, presetId,/);
  assert.match(viewerSource, /studioEnvironmentLoadQueue/);
  assert.match(viewerSource, /buildBlocking3dGroundGridLines/);
  assert.match(viewerSource, /rebuildEnvironmentBackdropMesh/);
  assert.match(viewerSource, /currentEnvironmentRadiusMeters \* 0\.85/);
  assert.doesNotMatch(viewerSource, /attachStudioBackdrop\(app/);
});

test("卡片缩略图使用共享室内默认值并刷新缓存版本", () => {
  assert.match(thumbnailSource, /loadStudioEnvironment\(app\)/);
  assert.match(thumbnailSource, /model-library:thumbnails:v17/);
  assert.match(animationThumbnailSource, /animation-library:thumbnails:v3/);
  assert.match(animationThumbnailSource, /loadStudioEnvironment\(app\)/);
  assert.match(thumbnailSource, /buildBlocking3dGroundGridLines/);
  assert.match(animationThumbnailSource, /buildBlocking3dGroundGridLines/);
});

test("模型编辑器提供三套 HDRI 环境选择和 5 到 30 米直径调节", () => {
  assert.match(editorSource, /SelectControl/);
  assert.match(editorSource, /STUDIO_ENVIRONMENT_PRESET_IDS/);
  assert.match(editorSource, /getStudioEnvironmentPreset\(id\)/);
  assert.match(editorSource, /半球直径/);
  assert.match(editorSource, /STUDIO_ENVIRONMENT_DIAMETER_LIMITS\.min/);
  assert.match(editorSource, /STUDIO_ENVIRONMENT_DIAMETER_LIMITS\.max/);
  assert.match(editorSource, /environmentSwitching/);
  assert.match(editorSource, /environmentDiameterRequestRef/);
  assert.match(editorSource, /requestId !== environmentDiameterRequestRef\.current/);
  assert.match(editorSource, /disabled=\{!viewer\}/);
});

test("系统资产预设页用表格统一管理旁白音色和 HDRI 直径", () => {
  assert.match(settingsSource, /title="资产预设"/);
  assert.match(settingsSource, /<table/);
  assert.match(settingsSource, /旁白音色预设/);
  assert.match(settingsSource, /模型与动画 HDRI 预设/);
  assert.match(settingsSource, /STUDIO_ENVIRONMENT_PRESET_IDS/);
  assert.match(settingsSource, /STUDIO_ENVIRONMENT_DIAMETER_LIMITS\.min/);
  assert.match(settingsSource, /STUDIO_ENVIRONMENT_DIAMETER_LIMITS\.max/);
  assert.match(settingsSource, /saveStudioEnvironmentDiameterPreference/);
});

test("三张模型 HDRI 都是 Radiance RGBE 文件", () => {
  for (const fileName of [
    "model-indoor-living-room.hdr",
    "model-outdoor-central-plaza.hdr",
    "model-nature-grassland.hdr",
  ]) {
    const url = new URL(`../public/models/env/${fileName}`, import.meta.url);
    assert.equal(existsSync(url), true, `${fileName} 不存在`);
    const header = readFileSync(url).subarray(0, 10).toString("ascii");
    assert.equal(header, "#?RADIANCE", `${fileName} 不是 Radiance HDR`);
  }
});
