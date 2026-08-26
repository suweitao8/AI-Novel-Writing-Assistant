import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const pageSource = fs.readFileSync(
  new URL("../src/pages/drama/comicDrama/DramaScene3DPage.tsx", import.meta.url),
  "utf8",
);
const blockingPageSource = fs.readFileSync(
  new URL("../src/pages/drama/comicDrama/DramaBlocking3DPage.tsx", import.meta.url),
  "utf8",
);

test("场景 3D 编辑器提供状态级 AI 空间识别和标记聚焦", () => {
  assert.match(pageSource, /analyzeStoryScene3dMarkers/);
  assert.match(pageSource, /sceneMarkers:/);
  assert.match(pageSource, /onMarkerSelection/);
  assert.match(pageSource, /空间标记/);
  assert.match(pageSource, /重新识别/);
  assert.match(pageSource, /isStoryScene3DMarkerSetCurrent/);
  assert.match(pageSource, /场景投射参数已改变，请重新识别空间标记/);
  assert.match(pageSource, /dirty && !\(await saveScene\(\)\)/);
});

test("分镜 3D 编辑器复用场景状态标记而不把标记写进镜头角色布局", () => {
  assert.match(blockingPageSource, /sceneMarkers: context\.scene\.markers/);
  assert.match(blockingPageSource, /focusMarker\(markerId\)/);
  assert.match(blockingPageSource, /场景空间标记/);
  assert.doesNotMatch(blockingPageSource, /layout3d\.markers/);
});
