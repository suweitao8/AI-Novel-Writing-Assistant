const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(
  path.join(__dirname, "../src/services/drama/visual/DramaShotBlockingSketchService.ts"),
  "utf8",
);

test("摆位草图保存、PNG 上传和确认都校验镜头归属与确认状态", () => {
  assert.match(source, /assertShotInProject/);
  assert.match(source, /async saveSketch/);
  assert.match(source, /async uploadSketchPng/);
  assert.match(source, /async confirmSketch/);
  assert.match(source, /草图图片尚未上传/);
  assert.match(source, /blocking-sketch\.png/);
});

test("摆位草图 PNG 只写入当前镜头目录，并拒绝非 PNG 或超限上传", () => {
  assert.match(source, /resolveGeneratedImagesRoot/);
  assert.match(source, /drama-shots/);
  assert.match(source, /MAX_BLOCKING_SKETCH_BYTES/);
  assert.match(source, /isPngBuffer/);
  assert.match(source, /仅支持 PNG/);
});

test("编辑器上下文从镜头场景和角色状态中构建，而不是让前端猜测资产", () => {
  assert.match(source, /async getEditorContext/);
  assert.match(source, /loadNovelCharacterStatesByName/);
  assert.match(source, /stateImageUrl/);
  assert.match(source, /matchSceneByName/);
});

test("环境快照不一致时，分镜上下文不会继续提供旧空间标记", () => {
  assert.match(source, /isStoryScene3DMarkerSetCurrent/);
  assert.match(source, /const markerAnalysis = matchedSceneState\?\.scene3dMarkers \?\? null/);
  assert.match(source, /markers: markersAreCurrent \? markerAnalysis\?\.markers \?\? \[\] : \[\]/);
});
