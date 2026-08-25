import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("../src/pages/drama/comicDrama/components/blocking3d/blocking3dViewerApp.ts", import.meta.url),
  "utf8",
);

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
