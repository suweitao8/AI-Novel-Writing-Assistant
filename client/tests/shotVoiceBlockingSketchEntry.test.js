import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../src/pages/drama/comicDrama/ShotVoiceListPanel.tsx", import.meta.url), "utf8");

test("每一镜的画面区域都有摆位入口，并在保存后刷新当前项目", () => {
  assert.doesNotMatch(source, /ShotBlockingSketchDialog/);
  assert.match(source, /3D 草图/);
  assert.doesNotMatch(source, /2D 草图/);
  assert.match(source, /encodeURIComponent\(props\.projectId\)/);
});

test("每一镜支持在草图与 AI 画面之间切换，并把操作放在预览图右侧", () => {
  assert.match(source, /type PreviewKind = "sketch" \| "ai"/);
  assert.match(source, /role="tablist"/);
  assert.match(source, /role="tab"/);
  assert.match(source, /aria-selected=\{activePreviewKind === "sketch"\}/);
  assert.match(source, /disabled=\{!hasBlockingSketch\}/);
  assert.match(source, />\s*3D图\s*<\/button>/);
  assert.match(source, />\s*AI图\s*<\/button>/);
  assert.match(source, /编辑3D/);
  assert.match(source, /生成AI图/);
  assert.match(source, /重新生图/);
  assert.match(source, /sm:w-\[26rem\]/);
});
