import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = [
  "../src/pages/drama/comicDrama/components/blocking3d/blocking3dViewerApp.ts",
  "../src/pages/drama/comicDrama/components/blocking3d/blocking3dViewerCore.ts",
].map((p) => readFileSync(new URL(p, import.meta.url), "utf8")).join(String.fromCharCode(10));

test("PlayCanvas 预览使用相机裁剪面和真实景深参数", () => {
  assert.match(source, /new pc\.CameraFrame/);
  assert.match(source, /cameraFrame\.dof/);
  assert.match(source, /cameraState\.nearClip/);
  assert.match(source, /cameraState\.farClip/);
  assert.match(source, /cameraState\.focusDistance/);
  assert.match(source, /cameraState\.focusRange/);
  assert.match(source, /cameraState\.blurRadius/);
  assert.match(source, /cameraFrame\.update\(\)/);
});

test("拍摄机位仍收敛在穹顶世界内，编辑视角不再被穹顶边界截断", () => {
  assert.match(source, /clampBlockingCameraPositionToWorld/);
  // setShotCameraPose 是拍摄机位统一写入口：钳制必须发生在其中。
  const poseStart = source.indexOf("const setShotCameraPose = (patch");
  const poseEnd = source.indexOf("const setSceneMarkers = (markers");
  const poseSource = source.slice(poseStart, poseEnd);
  assert.match(poseSource, /clampBlockingCameraPositionToWorld\(merged\.position, environmentSettings\)/);
  // 旧布局没有独立机位时，从收敛后的轨道相机推导，而不是原始布局相机。
  const viewerSource = readFileSync(
    new URL(
      "../src/pages/drama/comicDrama/components/blocking3d/blocking3dViewerApp.ts",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(viewerSource, /deriveShotCameraPoseFromOrbit\(cameraState\)/);
});

test("编辑视角滚轮允许越过 HDRI 半球继续拉远", () => {
  const viewerSource = readFileSync(
    new URL(
      "../src/pages/drama/comicDrama/components/blocking3d/blocking3dViewerApp.ts",
      import.meta.url,
    ),
    "utf8",
  );
  const syncStart = viewerSource.indexOf("const syncCamera = () => {");
  const syncEnd = viewerSource.indexOf("const emitSelection = () => {");
  const syncSource = viewerSource.slice(syncStart, syncEnd);
  const wheelStart = viewerSource.indexOf("const onWheel = (event: WheelEvent) => {");
  const wheelEnd = viewerSource.indexOf("const onContextMenu", wheelStart);
  const wheelSource = viewerSource.slice(wheelStart, wheelEnd);

  assert.match(
    syncSource,
    /clampBlockingCameraOrbitToWorld\(cameraState, environmentSettings, \{[\s\S]*constrainDistance: false,[\s\S]*\}\)/,
  );
  assert.doesNotMatch(wheelSource, /,\s*100,\s*\);/);
  assert.match(wheelSource, /normalizeBlocking3dCameraDistance/);
  assert.match(syncSource, /cameraEntity\.camera\.farClip = resolveBlocking3dEditorFarClip/);
  assert.match(viewerSource, /resolveBlocking3dEditorFarClip/);
  assert.match(viewerSource, /resolveStoryScene3DWorldRadius\(environmentSettings\)/);
});

test("草图导出使用场景摄像机机位并恢复编辑相机", () => {
  const viewerSource = readFileSync(
    new URL(
      "../src/pages/drama/comicDrama/components/blocking3d/blocking3dViewerApp.ts",
      import.meta.url,
    ),
    "utf8",
  );
  const captureStart = viewerSource.indexOf("capturePng() {");
  const captureEnd = viewerSource.indexOf("    destroy() {", captureStart);
  assert.ok(captureStart >= 0 && captureEnd > captureStart);
  const captureSource = viewerSource.slice(captureStart, captureEnd);
  assert.match(captureSource, /cameraEntity\.getPosition\(\)/);
  assert.match(captureSource, /cameraEntity\.getEulerAngles\(\)/);
  assert.match(captureSource, /shotCameraPose\.position/);
  assert.match(captureSource, /shotCameraPose\.yawDeg/);
  assert.match(captureSource, /shotCameraPose\.pitchDeg/);
  assert.match(captureSource, /cameraState\.fovDeg/);
  assert.match(captureSource, /cameraComponent\.nearClip = cameraState\.nearClip/);
  assert.match(captureSource, /cameraComponent\.farClip = cameraState\.farClip/);
  assert.match(captureSource, /cameraComponent\.rect = new pc\.Vec4\(0, 0, 1, 1\)/);
  assert.match(captureSource, /cameraComponent\.layers = editorCameraLayers/);
  assert.match(captureSource, /cameraEntity\.enabled = editorCameraEnabled/);
  assert.match(captureSource, /cameraFrame\.update\(\)/);
  assert.match(captureSource, /finally \{/);
  assert.match(captureSource, /cameraEntity\.setPosition/);
  assert.match(captureSource, /cameraEntity\.setEulerAngles/);
});

test("草图导出期间隐藏场景摄像机辅助线", () => {
  assert.match(
    source,
    /if \(!shotCameraHelpersSuppressed && options\.showShotCameraHelpers !== false\)/,
  );
});
