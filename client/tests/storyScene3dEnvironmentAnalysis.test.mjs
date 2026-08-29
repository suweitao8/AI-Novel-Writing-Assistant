import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync(new URL(
  "../src/pages/drama/comicDrama/DramaScene3DPage.tsx",
  import.meta.url,
), "utf8");
const api = readFileSync(new URL(
  "../src/api/story/storySettings.ts",
  import.meta.url,
), "utf8");
const viewerCore = readFileSync(new URL(
  "../src/pages/drama/comicDrama/components/blocking3d/blocking3dViewerCore.ts",
  import.meta.url,
), "utf8");

test("3D 场景页按状态图指纹自动请求环境分析并保留一次性闸门", () => {
  assert.match(api, /analyzeStoryScene3dEnvironment/);
  assert.match(api, /3d-environment\/analyze/);
  assert.match(page, /environmentAnalysisAttemptRef/);
  assert.match(page, /buildStoryScene3dImageFingerprint/);
  assert.match(page, /shouldAutoAnalyzeStoryScene3dEnvironment/);
  assert.match(page, /dirtyRef/);
});

test("环境分析期间不锁死 3D 预览和参数滑块", () => {
  assert.match(page, /setInteractionEnabled\(!sceneQuery\.isFetching && !saving\)/);
  assert.doesNotMatch(page, /disabled=\{!viewer \|\| saving \|\| analyzingEnvironment\}/);
});

test("客户端 3D 预览默认使用 15 米半球直径和 2 米投射中心", () => {
  assert.match(viewerCore, /projectionCenterHeight: 2/);
  assert.match(viewerCore, /domeRadius: 15/);
});
