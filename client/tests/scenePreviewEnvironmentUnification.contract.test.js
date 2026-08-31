import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => {
  const url = new URL(path, import.meta.url);
  return existsSync(url) ? readFileSync(url, "utf8") : "";
};

const runtimeSource = read("../src/pages/models/modelLibrary3d/studioEnvironmentRuntime.ts");
const blockingEnvironmentRuntimeSource = read(
  "../src/pages/drama/comicDrama/components/blocking3d/blocking3dEnvironmentRuntime.ts",
);
const presetSource = read("../src/pages/models/modelLibrary3d/studioEnvironmentPresets.ts");
const overlaySource = read("../src/pages/drama/comicDrama/components/blocking3d/blocking3dEnvironmentOverlay.ts");
const modelSource = read("../src/pages/models/modelLibrary3d/modelViewerApp.ts");
const animationPreviewSource = read("../src/pages/animations/animationPreviewApp.ts");
const animationThumbnailSource = read("../src/pages/animations/animationThumbnailStudio.ts");
const modelThumbnailSource = read("../src/pages/models/modelLibrary3d/thumbnailStudio.ts");

test("模型与动画环境通过漫剧 blocking3d 运行时共享一次 HDR 装配", () => {
  assert.match(runtimeSource, /createBlocking3dEnvironmentRuntime/);
  assert.match(runtimeSource, /environment\.load\(/);
  assert.match(runtimeSource, /normalizeEnvironmentSettings/);
  assert.doesNotMatch(runtimeSource, /Promise\.all/);
  assert.doesNotMatch(runtimeSource, /upgradeStudioEnvironment\(app/);
  assert.doesNotMatch(runtimeSource, /attachStudioBackdrop\(app/);
  assert.match(modelSource, /studioEnvironmentLoadQueue/);
  assert.match(blockingEnvironmentRuntimeSource, /ownsEnvironmentLighting/);
  assert.match(blockingEnvironmentRuntimeSource, /if \(ownsEnvironmentLighting\) app\.scene\.ambientLight/);
});

test("模型 HDR 预设（中央广场）遵守 15 米直径、10% 投射中心和半数地平线默认值", () => {
  assert.equal((presetSource.match(/diameterMeters:\s*15/g) ?? []).length, 1);
  assert.equal((presetSource.match(/projectionCenterHeightRatio:\s*0\.1/g) ?? []).length, 1);
  assert.equal((presetSource.match(/projectionCenterHeightMeters/g) ?? []).length, 0);
  assert.equal((presetSource.match(/panoramaHorizonV:\s*0\.5/g) ?? []).length, 1);
  assert.match(runtimeSource, /normalizeEnvironmentSettings/);
});

test("漫剧、模型和动画使用同一套半径驱动地面网格", () => {
  assert.match(overlaySource, /export function buildBlocking3dGroundGridLines/);
  assert.match(overlaySource, /GROUND_DOME_FLAT_RADIUS/);
  assert.match(overlaySource, /resolveStoryScene3DWorldRadius/);
  assert.match(modelSource, /buildBlocking3dGroundGridLines/);
  assert.match(animationPreviewSource, /buildBlocking3dGroundGridLines/);
  assert.match(animationThumbnailSource, /buildBlocking3dGroundGridLines/);
  assert.match(modelThumbnailSource, /buildBlocking3dGroundGridLines/);
});

test("动画实时预览完全使用 HDR 半圆环境，不再创建旧平面地面", () => {
  assert.match(animationPreviewSource, /loadStudioEnvironment/);
  assert.match(animationPreviewSource, /LAYERID_SKYBOX/);
  assert.doesNotMatch(animationPreviewSource, /GROUND_HALF_SIZE/);
  assert.doesNotMatch(animationPreviewSource, /createPlane\(/);
  assert.doesNotMatch(animationPreviewSource, /createMaterial\(/);
});

test("两个离屏缩略图都使用统一环境，不再维护独立平面", () => {
  assert.match(animationThumbnailSource, /loadStudioEnvironment\(app,\s*undefined,\s*\{[\s\S]*enableShadowCatcher:\s*false/);
  assert.match(modelThumbnailSource, /loadStudioEnvironment\(app,\s*undefined,\s*\{/);
  assert.doesNotMatch(animationThumbnailSource, /anim-thumb-ground/);
  assert.doesNotMatch(modelThumbnailSource, /thumb-ground/);
});
