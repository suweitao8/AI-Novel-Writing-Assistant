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

test("每一镜支持水平切换草图与 AI 画面，并保留下方三个操作按钮", () => {
  assert.match(source, /type PreviewKind = "sketch" \| "ai"/);
  assert.match(source, /role="tablist"/);
  assert.match(source, /role="tab"/);
  assert.match(source, /aria-orientation="horizontal"/);
  assert.match(source, /grid grid-cols-2/);
  assert.doesNotMatch(source, /aria-orientation="vertical"/);
  assert.match(source, /\["ArrowLeft", "ArrowRight"\]/);
  assert.match(source, /aria-selected=\{activePreviewKind === "sketch"\}/);
  assert.match(source, /disabled=\{!hasBlockingSketch\}/);
  assert.match(source, /disabled=\{!hasReadyAiPreview\}/);
  assert.match(source, />\s*3D图\s*<\/button>/);
  assert.match(source, />\s*AI图\s*<\/button>/);
  assert.match(source, /编辑3D/);
  assert.match(source, /AI摆位/);
  assert.match(source, /生成AI图/);
  assert.match(source, /重新生图/);
  assert.match(source, /sm:w-\[26rem\]/);
});

test("水平预览切换下面按固定顺序放置三个操作", () => {
  const tabListStart = source.indexOf('role="tablist"');
  const controlPanelEnd = source.indexOf("/* 分镜信息 + 配音段 */", tabListStart);
  const controlPanel = source.slice(tabListStart, controlPanelEnd);

  assert.match(
    controlPanel,
    /<\/div>\s*<Button[\s\S]*编辑3D[\s\S]*<AiButton[\s\S]*AI摆位[\s\S]*<AiButton[\s\S]*生成中…/,
  );
});

test("没有可用 AI 图时强制显示 3D 草图", () => {
  assert.match(source, /const hasReadyAiPreview/);
  assert.match(source, /hasBlockingSketch && !hasReadyAiPreview/);
  assert.match(source, /activePreviewKind === "sketch"/);
});

test("AI 图和 3D 图使用生成版本刷新缓存，AI 图加载失败时回退到 3D 草图", () => {
  assert.match(source, /generatedAt/);
  assert.match(source, /cache|version/);
  assert.match(source, /onError/);
  assert.match(source, /暂无可用 AI 画面|AI 图不可用/);
  assert.match(source, /autoPlan=1/);
});
