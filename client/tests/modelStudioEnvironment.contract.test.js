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
const blockingViewerSource = read("../src/pages/drama/comicDrama/components/blocking3d/blocking3dViewerApp.ts");
const thumbnailSource = read("../src/pages/models/modelLibrary3d/thumbnailStudio.ts");
const animationThumbnailSource = read("../src/pages/animations/animationThumbnailStudio.ts");
const editorSource = read("../src/pages/models/ModelEditorPage.tsx");
const settingsSource = read("../src/pages/settings/views/NarratorVoiceSettingsPage.tsx");
const routerSource = read("../src/router/index.tsx");
const previewSource = read("../src/pages/settings/views/StudioEnvironmentPreviewPage.tsx");

test("模型环境预设统一为中央广场并使用 5 到 30 米半球直径", () => {
  assert.match(presetSource, /exterior/);
  assert.doesNotMatch(presetSource, /interior|nature/);
  assert.match(presetSource, /DEFAULT_STUDIO_ENVIRONMENT_PRESET_ID[^=]*= "exterior"/);
  assert.match(presetSource, /STUDIO_ENVIRONMENT_DIAMETER_LIMITS/);
  assert.match(presetSource, /STUDIO_ENVIRONMENT_DIAMETER_LIMITS\s*=\s*\{\s*min:\s*5,\s*max:\s*30\s*\}/);
  assert.equal((presetSource.match(/diameterMeters:\s*15/g) ?? []).length, 1);
  assert.match(presetSource, /projectionCenterHeightMeters:\s*2/);
  assert.match(presetSource, /panoramaHorizonV:\s*0\.5/);
  assert.match(presetSource, /getStudioEnvironmentDiameterMeters\(diameterMeters\)\s*\/\s*2/);
  assert.match(presetSource, /model-outdoor-central-plaza\.hdr/);
  assert.match(presetSource, /previewImageUrl/);
  for (const fileName of ["model-outdoor-central-plaza-preview.png"]) {
    assert.equal(
      existsSync(new URL(`../public/models/env/${fileName}`, import.meta.url)),
      true,
      `${fileName} 不存在`,
    );
  }
  // 已下线的室内/草地静态资产不再随包发布。
  assert.equal(existsSync(new URL("../public/models/env/model-indoor-living-room.hdr", import.meta.url)), false);
  assert.equal(existsSync(new URL("../public/models/env/model-nature-grassland.hdr", import.meta.url)), false);
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
  assert.match(runtimeSource, /diameterMeters/);
  assert.match(runtimeSource, /radiusMeters/);
  assert.doesNotMatch(runtimeSource, /localStorage/);
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
  assert.match(viewerSource, /getStudioEnvironmentDiameterMeters/);
  assert.doesNotMatch(viewerSource, /attachStudioBackdrop\(app/);
});

test("卡片缩略图使用共享中央广场默认值并刷新缓存版本", () => {
  assert.match(thumbnailSource, /loadStudioEnvironment\(app\)/);
  assert.match(thumbnailSource, /model-library:thumbnails:v18/);
  assert.match(animationThumbnailSource, /animation-library:thumbnails:v5/);
  assert.match(animationThumbnailSource, /loadStudioEnvironment\(app\)/);
  assert.match(thumbnailSource, /buildBlocking3dGroundGridLines/);
  assert.match(animationThumbnailSource, /buildBlocking3dGroundGridLines/);
  assert.doesNotMatch(thumbnailSource, /setupStudioLighting/);
  assert.doesNotMatch(animationThumbnailSource, /setupStudioLighting/);
});

test("模型编辑器固定中央广场环境并提供 5 到 30 米直径调节", () => {
  assert.match(editorSource, /模型预览统一使用中央广场环境/);
  assert.doesNotMatch(editorSource, /HDRI 场景/);
  assert.doesNotMatch(editorSource, /setEnvironmentPreset\(/);
  assert.match(editorSource, /半球直径/);
  assert.match(editorSource, /STUDIO_ENVIRONMENT_DIAMETER_LIMITS\.min/);
  assert.match(editorSource, /STUDIO_ENVIRONMENT_DIAMETER_LIMITS\.max/);
  assert.match(editorSource, /environmentSwitching/);
  assert.match(editorSource, /environmentDiameterRequestRef/);
  assert.match(editorSource, /requestId !== environmentDiameterRequestRef\.current/);
  assert.match(editorSource, /disabled=\{!viewer\}/);
});

test("场景 blocking viewer 支持只加载环境而不加载代理角色", () => {
  assert.match(blockingViewerSource, /loadProxyActor\?: boolean/);
  assert.match(blockingViewerSource, /loadProxyActor !== false/);
  assert.match(blockingViewerSource, /if \(options\.loadProxyActor !== false\)/);
});

test("通用资产页的 HDRI 环境复用场景资产卡片，直径只在 3D 预览页调节", () => {
  assert.match(settingsSource, /title="通用资产"/);
  assert.match(settingsSource, /<table/);
  assert.match(settingsSource, /旁白音色预设/);
  assert.match(settingsSource, /模型与动画 HDRI 预设/);
  assert.match(settingsSource, /STUDIO_ENVIRONMENT_PRESET_IDS/);
  // 环境列表就是场景资产卡片：点卡片进入编辑，不再有独立的编辑/预览按钮和直径滑杆。
  assert.match(settingsSource, /StoryAssetCard/);
  assert.match(settingsSource, /buildEnvironmentAssetPresentation/);
  assert.match(settingsSource, /onOpen=\{\(\) => setEditingEnvironmentId\(id\)\}/);
  assert.doesNotMatch(settingsSource, /STUDIO_ENVIRONMENT_DIAMETER_LIMITS/);
  assert.doesNotMatch(settingsSource, /saveStudioEnvironmentDiameterPreference/);
  assert.doesNotMatch(settingsSource, /3D 预览/);
  assert.match(settingsSource, /settings\/narrator-voice\/hdri/);
  assert.match(settingsSource, /previewImageUrl/);
  assert.match(settingsSource, /AppDialogContent/);
  assert.doesNotMatch(settingsSource, /preset\.sourceUrl/);
});

test("HDRI 预览页复用场景编辑器布局并提供完整直径交互", () => {
  assert.match(routerSource, /settings\/narrator-voice\/hdri\/:environmentId/);
  assert.match(previewSource, /HDRI 3D 预览/);
  assert.match(previewSource, /返回通用资产/);
  assert.match(previewSource, /Drama3DEditorShell/);
  assert.match(previewSource, /Drama3DObjectPanel/);
  assert.match(previewSource, /createBlocking3dViewer/);
  assert.match(previewSource, /loadProxyActor:\s*false/);
  assert.match(previewSource, /STUDIO_ENVIRONMENT_DIAMETER_LIMITS\.min/);
  assert.match(previewSource, /STUDIO_ENVIRONMENT_DIAMETER_LIMITS\.max/);
  assert.match(previewSource, /type="range"/);
  assert.match(previewSource, /useParams/);
  assert.doesNotMatch(previewSource, /studioEnvironmentPreviewApp/);
});

test("纯 HDRI 预览关闭空阴影接收器，场景预览仍保留阴影路径", () => {
  assert.match(blockingEnvironmentRuntimeSource, /enableShadowCatcher/);
  assert.match(blockingEnvironmentRuntimeSource, /if \(enableShadowCatcher\)/);
  assert.match(previewSource, /loadProxyActor:\s*false/);
  assert.match(blockingViewerSource, /enableShadowCatcher:\s*options\.loadProxyActor\s*!==\s*false/);
});

test("可见 HDRI cubemap 使用 RGBP 编码并按 RGBP 解码", () => {
  const coreSource = read(
    "../src/pages/drama/comicDrama/components/blocking3d/blocking3dViewerCore.ts",
  );
  assert.match(coreSource, /type:\s*pc\.TEXTURETYPE_RGBP/);
  assert.match(
    read("../src/pages/drama/comicDrama/components/blocking3d/blocking3dEnvironmentProjection.ts"),
    /decodeRGBP\(rawColor\)/,
  );
});

test("模型 HDRI 使用 Radiance RGBE 文件", () => {
  for (const fileName of ["model-outdoor-central-plaza.hdr"]) {
    const url = new URL(`../public/models/env/${fileName}`, import.meta.url);
    assert.equal(existsSync(url), true, `${fileName} 不存在`);
    const header = readFileSync(url).subarray(0, 10).toString("ascii");
    assert.equal(header, "#?RADIANCE", `${fileName} 不是 Radiance HDR`);
  }
});
