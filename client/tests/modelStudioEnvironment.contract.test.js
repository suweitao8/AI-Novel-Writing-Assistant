import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => {
  const url = new URL(path, import.meta.url);
  return existsSync(url) ? readFileSync(url, "utf8") : "";
};

const presetSource = read("../src/pages/models/modelLibrary3d/studioEnvironmentPresets.ts");
const backdropSource = read("../src/pages/models/modelLibrary3d/studioBackdrop.ts");
const runtimeSource = read("../src/pages/models/modelLibrary3d/studioEnvironmentRuntime.ts");
const lightingSource = read("../src/pages/models/modelLibrary3d/studioLighting.ts");
const viewerSource = read("../src/pages/models/modelLibrary3d/modelViewerApp.ts");
const thumbnailSource = read("../src/pages/models/modelLibrary3d/thumbnailStudio.ts");
const animationThumbnailSource = read("../src/pages/animations/animationThumbnailStudio.ts");
const editorSource = read("../src/pages/models/ModelEditorPage.tsx");
const settingsSource = read("../src/pages/settings/views/NarratorVoiceSettingsPage.tsx");

test("模型环境预设使用固定 10、20、50 米真实半径", () => {
  assert.match(presetSource, /interior/);
  assert.match(presetSource, /exterior/);
  assert.match(presetSource, /nature/);
  assert.match(presetSource, /radiusMeters:\s*10/);
  assert.match(presetSource, /radiusMeters:\s*20/);
  assert.match(presetSource, /radiusMeters:\s*50/);
  assert.match(presetSource, /getStudioEnvironmentDomeDiameterMeters/);
  assert.match(presetSource, /normalizeStudioEnvironmentRadiusMeters\(radiusMeters\)\s*\*\s*2/);
  assert.match(presetSource, /model-indoor-living-room\.hdr/);
  assert.match(presetSource, /model-outdoor-central-plaza\.hdr/);
  assert.match(presetSource, /model-nature-grassland\.hdr/);
  assert.doesNotMatch(presetSource, /localStorage|DIAMETER_LIMITS|diameterMeters/);
});

test("模型可见穹顶不接收相机且固定在原点", () => {
  assert.doesNotMatch(backdropSource, /camera\??\s*:/);
  assert.doesNotMatch(backdropSource, /app\.on\(["']update/);
  assert.doesNotMatch(backdropSource, /getPosition\(\)/);
  assert.match(backdropSource, /getStudioEnvironmentDomeDiameterMeters/);
  assert.match(backdropSource, /createBackdropGeometry\(centerHeight,\s*radiusMeters\)/);
  assert.match(backdropSource, /setLocalScale\(domeDiameterMeters,\s*domeDiameterMeters,\s*domeDiameterMeters\)/);
  assert.match(backdropSource, /setPosition\(0,\s*0,\s*0\)/);
  assert.match(backdropSource, /preset\.sourceUrl/);
});

test("环境光按所选预设加载并保留兼容回退", () => {
  assert.match(lightingSource, /getStudioEnvironmentPreset/);
  assert.match(lightingSource, /presetId/);
  assert.match(lightingSource, /STUDIO_PANORAMA_URL/);
  assert.match(lightingSource, /STUDIO_ENV_URL/);
});

test("模型环境运行时同时装配可见穹顶和环境光", () => {
  assert.match(runtimeSource, /upgradeStudioEnvironment\(app,\s*preset\.id\)/);
  assert.match(runtimeSource, /attachStudioBackdrop\(app/);
  assert.match(runtimeSource, /Promise\.all/);
  assert.match(runtimeSource, /hasVisibleBackdrop/);
  assert.match(runtimeSource, /radiusMeters/);
  assert.doesNotMatch(runtimeSource, /diameterMeters|localStorage/);
});

test("模型查看器固定相机轨道并支持异步切换环境", () => {
  assert.match(viewerSource, /environmentPresetId\?: StudioEnvironmentPresetId/);
  assert.match(viewerSource, /environmentRadiusMeters\?: number/);
  assert.match(viewerSource, /setEnvironmentPreset: \(presetId: StudioEnvironmentPresetId\)/);
  assert.match(viewerSource, /loadStudioEnvironment\(app, presetId,/);
  assert.match(viewerSource, /currentEnvironmentRadiusMeters \* 0\.85/);
  assert.match(viewerSource, /getMaxCameraDistance\(\)/);
  assert.doesNotMatch(viewerSource, /environmentDiameter|setEnvironmentDiameter|saveStudioEnvironment/);
  assert.doesNotMatch(viewerSource, /attachStudioBackdrop\(app/);
});

test("卡片缩略图使用共享室内默认值并刷新缓存版本", () => {
  assert.match(thumbnailSource, /loadStudioEnvironment\(app\)/);
  assert.match(thumbnailSource, /model-library:thumbnails:v16/);
  assert.match(animationThumbnailSource, /loadStudioEnvironment\(app, undefined, \{ radiusMeters: 30 \}\)/);
});

test("模型编辑器只提供三套固定 HDRI 环境选择", () => {
  assert.match(editorSource, /SelectControl/);
  assert.match(editorSource, /STUDIO_ENVIRONMENT_PRESET_IDS/);
  assert.match(editorSource, /getStudioEnvironmentPreset\(id\)/);
  assert.match(editorSource, /半径/);
  assert.match(editorSource, /environmentSwitching/);
  assert.match(editorSource, /disabled=\{!viewer \|\| environmentSwitching\}/);
  assert.doesNotMatch(editorSource, /type="range"|environmentDiameter|STUDIO_ENVIRONMENT_DIAMETER/);
});

test("系统资产预设页展示固定 HDRI 半径，不提供动态缩放", () => {
  assert.match(settingsSource, /title="资产预设"/);
  assert.match(settingsSource, /<table/);
  assert.match(settingsSource, /旁白音色预设/);
  assert.match(settingsSource, /模型与动画 HDRI 预设/);
  assert.match(settingsSource, /STUDIO_ENVIRONMENT_PRESET_IDS/);
  assert.match(settingsSource, /半径/);
  assert.doesNotMatch(settingsSource, /type="range"|saveStudioEnvironmentDiameterPreference|environmentDiameters/);
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
