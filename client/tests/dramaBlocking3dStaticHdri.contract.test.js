import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pageSource = readFileSync(
  new URL("../src/pages/drama/comicDrama/DramaBlocking3DPage.tsx", import.meta.url),
  "utf8",
);
const viewerSource = readFileSync(
  new URL("../src/pages/drama/comicDrama/components/blocking3d/blocking3dViewerApp.ts", import.meta.url),
  "utf8",
);

test("3D 草图只显示静态姿势控制，不提供动态播放入口", () => {
  assert.match(pageSource, /静态姿势/);
  assert.doesNotMatch(pageSource, /播放动作|暂停动作|selectedActionPlaying|setSelectedActionPlaying/);
  assert.match(viewerSource, /actionPlaying: false/);
  assert.match(viewerSource, /layer\.pause\(\)/);
  assert.match(viewerSource, /anim\.playing = false/);
});

test("场景状态图作为半球 HDRI 环境，不再作为后置背景平面", () => {
  assert.match(viewerSource, /new pc\.DomeGeometry/);
  assert.match(viewerSource, /pc\.CULLFACE_FRONT/);
  assert.match(viewerSource, /environmentDome/);
  assert.match(viewerSource, /environmentUrl/);
  assert.doesNotMatch(viewerSource, /createPlane\(app, "blocking3d-background"/);
});

test("HDRI 半球负责弧形地面，纯色地面只在没有 HDRI 时显示", () => {
  assert.match(viewerSource, /ground\.enabled = false/);
  assert.match(viewerSource, /ground\.enabled = true/);
});

test("HDRI 半球跟随相机水平位置但固定在世界地面", () => {
  assert.match(viewerSource, /environmentDome\.setPosition\(cameraPosition\.x, 0, cameraPosition\.z\)/);
  assert.doesNotMatch(viewerSource, /environmentDome\.setPosition\(cameraEntity\.getPosition\(\)\)/);
});

test("普通场景图使用地面投影保护，真正等距 HDRI 保留原生半球采样", () => {
  assert.match(viewerSource, /createScenePlateDomeGeometry/);
  assert.match(viewerSource, /texture\.width \/ texture\.height/);
  assert.match(viewerSource, /GROUND_PROJECTION_SOURCE_ASPECT/);
  assert.match(viewerSource, /groundProjection/);
  assert.match(viewerSource, /DEFAULT_GROUND_UV_BOTTOM - radial/);
});

test("HDRI 环境提供投影高度、半球尺寸、旋转和清晰度参数", () => {
  assert.match(viewerSource, /projectionCenterHeight/);
  assert.match(viewerSource, /domeRadius/);
  assert.match(viewerSource, /yawDeg/);
  assert.match(viewerSource, /texture\.anisotropy/);
  assert.match(viewerSource, /material\.emissiveIntensity/);
  assert.match(viewerSource, /getEnvironmentSettings/);
  assert.match(viewerSource, /setEnvironmentSettings/);
});
