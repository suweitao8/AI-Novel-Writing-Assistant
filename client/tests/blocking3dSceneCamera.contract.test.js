import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const blocking3dDir = "../src/pages/drama/comicDrama/components/blocking3d";
const shotCameraSource = fs.readFileSync(
  new URL(`${blocking3dDir}/blocking3dShotCamera.ts`, import.meta.url),
  "utf8",
);
const gizmoSource = fs.readFileSync(
  new URL(`${blocking3dDir}/blocking3dCameraGizmo.ts`, import.meta.url),
  "utf8",
);
const viewerSource = [
  `${blocking3dDir}/blocking3dViewerApp.ts`,
  `${blocking3dDir}/blocking3dViewerCore.ts`,
].map((p) => fs.readFileSync(new URL(p, import.meta.url), "utf8")).join(String.fromCharCode(10));
const pageSource = fs.readFileSync(
  new URL("../src/pages/drama/comicDrama/DramaBlocking3DPage.tsx", import.meta.url),
  "utf8",
);
const panelSource = fs.readFileSync(
  new URL("../src/pages/drama/comicDrama/components/editor3d/Drama3DObjectPanel.tsx", import.meta.url),
  "utf8",
);

test("场景摄像机拥有独立机位，不跟随编辑视角移动", () => {
  assert.match(shotCameraSource, /interface Blocking3dShotCameraPose/);
  assert.match(shotCameraSource, /deriveShotCameraPoseFromOrbit/);
  assert.match(shotCameraSource, /normalizeShotCameraPose/);
  assert.match(viewerSource, /const shotCamera = createBlocking3dShotCamera\(app, canvas, cameraComponent, editorOverlayLayer\.id\)/);
  // 编辑视角相机同步不得再带动机身：旧的轨道跟随入口必须移除。
  assert.doesNotMatch(viewerSource, /syncBlocking3dCameraBody/);
  assert.doesNotMatch(viewerSource, /moveShotCameraToPosition/);
  // 旧布局没有独立机位字段时从轨道相机推导，新布局直接读 shotCamera。
  assert.match(viewerSource, /normalizeShotCameraPose\(layout\.shotCamera, deriveShotCameraPoseFromOrbit\(layout\.camera\)\)/);
  // 取景锥 gizmo 画的是独立机位，不是编辑轨道相机。
  assert.match(gizmoSource, /interface Blocking3dCameraGizmoSource/);
  assert.match(viewerSource, /drawBlocking3dCameraGizmo\(app, \{[\s\S]*?shotCameraPose\.yawDeg/);
});

test("机位可拖拽、可挂手柄、可旋转，并经属性面板提交", () => {
  assert.match(viewerSource, /"camera-body"/);
  assert.match(viewerSource, /setShotCameraPose: \(patch: \{ position\?: \[number, number, number\]; yawDeg\?: number; pitchDeg\?: number \}\) => void;/);
  assert.match(viewerSource, /getShotCameraPose: \(\) => \{ position: \[number, number, number\]; yawDeg: number; pitchDeg: number \};/);
  // 移动/旋转手柄可以作用在摄像机机身上。
  assert.match(viewerSource, /\?\? \(cameraSelected \? shotCamera\.body : null\)/);
  // 旋转按钮在摄像机选中时调整独立机位朝向。
  assert.match(viewerSource, /setShotCameraPose\(\{ yawDeg: shotCameraPose\.yawDeg \+ degrees \}\)/);
  assert.match(pageSource, /nextViewer\.setShotCameraPose\(/);
  assert.match(pageSource, /nextViewer\.getShotCameraPose\(\)/);
  assert.doesNotMatch(pageSource, /setShotCameraPosition|setShotCameraOrientation/);
  assert.match(panelSource, /"camera"[\s\S]*?Video/);
});

test("选中摄像机即显示右下角取景画中画，预览摄像机拍到的草图内容", () => {
  assert.match(viewerSource, /shotCameraHelpersVisible \|\| cameraSelected/);
  assert.match(shotCameraSource, /0\.975 - PIP_RECT_WIDTH/);
  assert.match(shotCameraSource, /preview\.setEulerAngles\(pose\.pitchDeg, pose\.yawDeg, 0\)/);
  assert.match(pageSource, /shotPreviewOn \|\| cameraSelected/);
});

test("取景画中画只渲染草图内容，不混入机身与编辑器辅助元素", () => {
  // 机身与镜头渲染在编辑器辅助图层：取景相机若渲染自己的机身，画面会被机身挡住。
  assert.match(shotCameraSource, /layers: \[editorOnlyLayerId\]/);
  // 画中画显式只挂世界图层 + 构图线图层，网格 / 边界圈 / 机位 gizmo 都进不了预览。
  assert.match(shotCameraSource, /layers: \[pc\.LAYERID_WORLD, compositionLayer\.id\]/);
  assert.doesNotMatch(viewerSource, /previewComponent\.layers = editorCamera\.layers/);
});

test("取景画中画叠加三分构图线", () => {
  assert.match(shotCameraSource, /drawCompositionGuides\(app: pc\.AppBase\): void/);
  // 构图线画进画中画专属图层，编辑主视口不出现。
  assert.match(shotCameraSource, /COMPOSITION_GUIDE_COLOR,[\s\S]*?compositionLayer,/);
  assert.match(viewerSource, /shotCamera\.drawCompositionGuides\(app\)/);
});

test("摆位快照保存独立机位，导出草图不包含摄像机辅助对象", () => {
  assert.match(viewerSource, /position: \[\.\.\.shotCameraPose\.position\] as \[number, number, number\]/);
  // 导出摆位草图不能带编辑器辅助对象：机身与取景画中画在截图期间隐藏。
  assert.match(viewerSource, /shotCamera\.body\.enabled = false/);
  assert.match(viewerSource, /shotCameraHelpersSuppressed = true;[\s\S]*?syncShotCameraVisuals\(\);/);
});
