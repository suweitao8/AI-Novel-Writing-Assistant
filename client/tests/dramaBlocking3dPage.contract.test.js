import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";

const pageSource = fs.readFileSync(
  path.join(process.cwd(), "src/pages/drama/comicDrama/DramaBlocking3DPage.tsx"),
  "utf8",
);
const viewerSource = fs.readFileSync(
  path.join(process.cwd(), "src/pages/drama/comicDrama/components/blocking3d/blocking3dViewerApp.ts"),
  "utf8",
);
const mathSource = fs.readFileSync(
  path.join(process.cwd(), "src/pages/drama/comicDrama/components/blocking3d/blocking3dMath.ts"),
  "utf8",
);
const entrySource = fs.readFileSync(
  path.join(process.cwd(), "src/pages/drama/comicDrama/ShotVoiceListPanel.tsx"),
  "utf8",
);

test("3D 摆位页面保存快照并继续上传 PNG 参考图", () => {
  assert.match(pageSource, /createBlocking3dViewer/);
  assert.match(pageSource, /layout3d/);
  assert.match(pageSource, /uploadDramaShotBlockingSketchPng/);
  assert.match(pageSource, /confirmDramaShotBlockingSketch/);
  assert.match(pageSource, /setInteractionEnabled\(false\)/);
  assert.match(pageSource, /queryKeys\.drama\.project/);
  assert.match(mathSource, /prone/);
});

test("3D 草图 runtime 提供代理模型、静态姿势、相机和导出能力", () => {
  assert.match(viewerSource, /UAL2_Standard\.glb/);
  assert.match(viewerSource, /UAL1_Standard\.glb/);
  assert.match(viewerSource, /setSelectedPose/);
  assert.match(viewerSource, /setCameraState/);
  assert.match(viewerSource, /BLOCKING_SKETCH_CAPTURE_SIZE/);
  assert.match(viewerSource, /setInteractionEnabled/);
  assert.match(viewerSource, /capturePng/);
  assert.match(viewerSource, /DomeGeometry/);
  assert.match(viewerSource, /setEnvironment/);
  assert.doesNotMatch(viewerSource, /setSelectedActionPlaying|getSelectedActionPlaying/);
  assert.doesNotMatch(viewerSource, /blocking3d-background/);
});

test("分镜列表只进入独立 3D 草图，不再保留 2D 草图入口", () => {
  assert.match(entrySource, /blocking-3d\?order=/);
  assert.match(entrySource, /3D 草图/);
  assert.doesNotMatch(entrySource, /2D 草图|ShotBlockingSketchDialog/);
});

test("分镜 3D 草图从场景资产继承 HDRI 参数，不再单独编辑", () => {
  assert.match(pageSource, /context\.scene\.environment/);
  assert.match(pageSource, /environment: context\.scene\.environment/);
  assert.doesNotMatch(pageSource, /HDRI 环境|投射中心高度|半球直径|setEnvironmentSettings/);
  assert.doesNotMatch(pageSource, /type=\"range\"/);
});
