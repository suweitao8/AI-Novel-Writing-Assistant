import assert from "node:assert/strict";
import test from "node:test";

import {
  buildScene3dEditorPath,
  readStudioNavigation,
  resolveStudioReturnPath,
} from "../src/pages/drama/comicDrama/navigation/studioNavigation.ts";

test("工作室导航状态从查询参数恢复资产场景页签", () => {
  assert.deepEqual(readStudioNavigation("?stage=assets&assetTab=scenes"), {
    stage: "assets",
    assetTab: "scenes",
  });
  assert.deepEqual(readStudioNavigation(""), {
    stage: "current",
    assetTab: "characters",
  });
});

test("场景 3D 入口携带资产场景来源，并生成确定性的返回路径", () => {
  const editorPath = buildScene3dEditorPath("novel/1", "scene/2", "state/3");

  assert.equal(
    editorPath,
    "/drama/studio/novel%2F1/scenes/scene%2F2/states/state%2F3/3d?returnStage=assets&returnAssetTab=scenes",
  );
  assert.equal(
    resolveStudioReturnPath("novel/1", "?returnStage=assets&returnAssetTab=scenes"),
    "/drama/studio/novel%2F1?stage=assets&assetTab=scenes",
  );
  assert.equal(resolveStudioReturnPath("novel/1", ""), null);
});
