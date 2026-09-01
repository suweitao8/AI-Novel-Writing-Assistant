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

test("编辑视角与拍摄机位统一收敛在穹顶世界内，旧布局载入即自愈", () => {
  assert.match(source, /clampBlockingCameraOrbitToWorld/);
  assert.match(source, /clampBlockingCameraPositionToWorld/);
  // syncCamera 是编辑视角唯一出口：钳制必须发生在 syncCamera 内。
  const syncStart = source.indexOf("const syncCamera = () => {");
  const syncEnd = source.indexOf("const emitSelection = () => {");
  const syncSource = source.slice(syncStart, syncEnd);
  assert.match(syncSource, /clampBlockingCameraOrbitToWorld\(cameraState, environmentSettings\)/);
  // setShotCameraPose 是拍摄机位统一写入口：钳制必须发生在其中。
  const poseStart = source.indexOf("const setShotCameraPose = (patch");
  const poseEnd = source.indexOf("const setSceneMarkers = (markers");
  const poseSource = source.slice(poseStart, poseEnd);
  assert.match(poseSource, /clampBlockingCameraPositionToWorld\(merged\.position, environmentSettings\)/);
  // 旧布局没有独立机位时，从收敛后的轨道相机推导，而不是原始布局相机。
  assert.match(source, /deriveShotCameraPoseFromOrbit\(cameraState\)/);
});
