import assert from "node:assert/strict";
import test from "node:test";

import {
  buildScene3dEditorPath,
  buildStudioNavigationPath,
  readStudioNavigation,
  resolveStudioReturnPath,
} from "../src/pages/drama/comicDrama/navigation/studioNavigation.ts";

test("工作室导航状态从查询参数恢复二级页签与章节子页签", () => {
  // 旧链接兼容：拍平前的 stage=assets&assetTab=… 映射到新二级页签。
  assert.deepEqual(readStudioNavigation("?stage=assets&assetTab=scenes"), {
    stage: "scenes",
    currentTab: "script",
  });
  assert.deepEqual(readStudioNavigation(""), {
    stage: "current",
    currentTab: "script",
  });
});

test("章节子页签支持 tab 深链，3D 编辑器跳回时还原到指定子页签", () => {
  assert.deepEqual(readStudioNavigation("?stage=current&tab=storyboard"), {
    stage: "current",
    currentTab: "storyboard",
  });
  // 非法 tab 值回落脚本页签；非章节 stage 忽略 tab。
  assert.equal(readStudioNavigation("?tab=nope").currentTab, "script");
  assert.equal(readStudioNavigation("?stage=characters&tab=video").stage, "characters");
});

test("工作室跳转路径生成确定性的页面地址", () => {
  assert.equal(
    buildStudioNavigationPath("novel/1", { stage: "current", currentTab: "storyboard" }),
    "/drama/studio/novel%2F1?stage=current&tab=storyboard",
  );
  assert.equal(
    buildStudioNavigationPath("novel/1", { stage: "characters" }),
    "/drama/studio/novel%2F1?stage=characters",
  );
  // 非 chapter stage 不携带子页签参数。
  assert.equal(
    buildStudioNavigationPath("novel/1", { stage: "settings", currentTab: "video" }),
    "/drama/studio/novel%2F1?stage=settings",
  );
});

test("场景 3D 入口携带场景来源，并生成确定性的返回路径", () => {
  const editorPath = buildScene3dEditorPath("novel/1", "scene/2", "state/3");

  assert.equal(
    editorPath,
    "/drama/studio/novel%2F1/scenes/scene%2F2/states/state%2F3/3d?returnStage=scenes",
  );
  assert.equal(
    resolveStudioReturnPath("novel/1", "?returnStage=scenes"),
    "/drama/studio/novel%2F1?stage=scenes",
  );
  // 拍平前的旧地址照旧映射。
  assert.equal(
    resolveStudioReturnPath("novel/1", "?returnStage=assets&returnAssetTab=scenes"),
    "/drama/studio/novel%2F1?stage=scenes",
  );
  assert.equal(resolveStudioReturnPath("novel/1", ""), null);
});
