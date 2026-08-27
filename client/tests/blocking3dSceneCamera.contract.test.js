import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const bodySource = fs.readFileSync(
  new URL(
    "../src/pages/drama/comicDrama/components/blocking3d/blocking3dCameraBody.ts",
    import.meta.url,
  ),
  "utf8",
);
const viewerSource = [
  "../src/pages/drama/comicDrama/components/blocking3d/blocking3dViewerApp.ts",
  "../src/pages/drama/comicDrama/components/blocking3d/blocking3dViewerCore.ts",
].map((p) => fs.readFileSync(new URL(p, import.meta.url), "utf8")).join(String.fromCharCode(10));
const pageSource = fs.readFileSync(
  new URL("../src/pages/drama/comicDrama/DramaBlocking3DPage.tsx", import.meta.url),
  "utf8",
);
const panelSource = fs.readFileSync(
  new URL("../src/pages/drama/comicDrama/components/editor3d/Drama3DObjectPanel.tsx", import.meta.url),
  "utf8",
);

test("场景摄像机是可拾取、可拖拽的常驻实体", () => {
  assert.match(bodySource, /createBlocking3dCameraBody/);
  assert.match(bodySource, /syncBlocking3dCameraBody/);
  assert.match(bodySource, /rayHitsBlocking3dCameraBody/);
  assert.match(viewerSource, /const cameraBody = createBlocking3dCameraBody\(app\)/);
  assert.match(viewerSource, /syncBlocking3dCameraBody\(cameraBody, cameraState\)/);
  assert.match(viewerSource, /"camera-body"/);
  assert.match(viewerSource, /moveShotCameraToPosition/);
  // 导出摆位草图不能带编辑器辅助对象：机身在截图期间隐藏。
  assert.match(viewerSource, /cameraBody\.enabled = false/);
});

test("摄像机可被选中并在对象列表与属性面板中编辑", () => {
  assert.match(viewerSource, /selectCamera: \(selected: boolean\) => boolean;/);
  assert.match(viewerSource, /onCameraSelection: \(listener: \(selected: boolean\) => void\) => \(\) => void;/);
  assert.match(viewerSource, /setShotCameraPosition: \(position: \[number, number, number\]\) => void;/);
  assert.match(viewerSource, /setShotCameraOrientation: \(azim: number, elev: number\) => void;/);
  assert.match(pageSource, /CAMERA_OBJECT_ID = "camera"/);
  assert.match(pageSource, /label: "摄像机"/);
  assert.match(pageSource, /kind: "camera"/);
  assert.match(pageSource, /nextViewer\.setShotCameraPosition\(next\)/);
  assert.match(pageSource, /nextViewer\.setShotCameraOrientation/);
  // 旋转按钮在摄像机选中时调整镜头朝向（rotateSelected 分支）。
  assert.match(viewerSource, /if \(cameraSelected\) \{[\s\S]*?updateBlocking3dCameraAzimuth/);
  assert.match(panelSource, /"camera"[\s\S]*?Video/);
});
