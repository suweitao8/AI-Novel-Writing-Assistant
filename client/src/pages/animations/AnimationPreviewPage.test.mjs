import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const pageDir = import.meta.dirname;
const pageSource = readFileSync(
  path.join(pageDir, "AnimationPreviewPage.tsx"),
  "utf8",
);
const librarySource = readFileSync(
  path.join(pageDir, "AnimationLibraryPage.tsx"),
  "utf8",
);
const routerSource = readFileSync(
  path.join(pageDir, "..", "..", "router", "index.tsx"),
  "utf8",
);
const blockingPageSource = readFileSync(
  path.join(pageDir, "..", "drama", "comicDrama", "DramaBlocking3DPage.tsx"),
  "utf8",
);

test("动画入口卡片跳转到独立预览路由，而不是打开弹窗", () => {
  assert.match(librarySource, /<Link/);
  assert.match(librarySource, /to=\{`\/animations\/\$\{entry\.id\}`\}/);
  assert.doesNotMatch(librarySource, /Dialog|openAnimationPreview/);
  assert.match(routerSource, /path: "animations\/:animationId"/);
});

test("独立预览页提供可访问时间轴和关键帧保存流程", () => {
  assert.match(pageSource, /useParams/);
  assert.match(pageSource, /data-animation-preview-page/);
  assert.match(pageSource, /data-animation-preview-canvas/);
  assert.match(pageSource, /type="range"/);
  assert.match(pageSource, /aria-label=\{`\$\{entry\.name\} 时间轴`\}/);
  assert.match(pageSource, /viewer\?\.setTime\(/);
  assert.match(pageSource, /capturePreviewFrame\(\)/);
  assert.match(pageSource, /setAnimationKeyframe\(/);
  assert.match(pageSource, /clearAnimationKeyframe\(/);
  assert.match(pageSource, /viewer\?\.fitView\(\)/);
  assert.match(pageSource, /viewer\?\.resetView\(\)/);
  assert.match(pageSource, /重新加载/);
  assert.match(pageSource, /handle\.cancel\(\)/);
});

test("分镜姿势下拉只呈现当前统一 UAL2 文件支持的选项", () => {
  assert.match(blockingPageSource, /getAvailablePoses\(\)/);
  assert.match(blockingPageSource, /availablePoses\.map\(\(pose\)/);
});
