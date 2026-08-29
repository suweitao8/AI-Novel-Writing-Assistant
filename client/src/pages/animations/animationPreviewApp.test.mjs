import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

// 预览器依赖 playcanvas 与 @/ 路径别名，Node 里不可直接导入；这里的契约
// 断言读取源码，守住「同步构建 → 加载 GLB → 装配动画组件 → 循环播放 →
// 可取消销毁」链路，特别是同一画布同一时刻只能存在一个 PlayCanvas 应用。
const previewSource = readFileSync(path.join(import.meta.dirname, "animationPreviewApp.ts"), "utf8");
const pageSource = readFileSync(path.join(import.meta.dirname, "AnimationLibraryPage.tsx"), "utf8");
const previewPageSource = readFileSync(path.join(import.meta.dirname, "AnimationPreviewPage.tsx"), "utf8");
const studioSource = readFileSync(path.join(import.meta.dirname, "animationThumbnailStudio.ts"), "utf8");
const modelPageSource = readFileSync(
  path.join(import.meta.dirname, "..", "models", "ModelLibraryPage.tsx"),
  "utf8",
);
const navSource = readFileSync(
  path.join(import.meta.dirname, "..", "..", "config", "dramaFocusNav.ts"),
  "utf8",
);
const catalogSource = readFileSync(
  path.join(import.meta.dirname, "..", "..", "config", "animationLibrary.ts"),
  "utf8",
);

test("预览器同步构建应用，异步加载后装配动画组件并循环播放", () => {
  assert.match(previewSource, /export function openAnimationPreview/);
  assert.match(previewSource, /instantiateRenderEntity/);
  assert.match(previewSource, /addComponent\("anim"/);
  assert.match(previewSource, /anim\.rootBone = model/);
  assert.match(previewSource, /assignAnimation\(clipName, track, 0, 1, true\)/);
  assert.match(previewSource, /baseLayer\?\.play\(clipName\)/);
  assert.match(previewSource, /app\.start\(\)/);
});

test("预览器提供 HDR 场景、时间轴控制和关键帧截图能力", () => {
  assert.match(previewSource, /setupStudioLighting\(app/);
  assert.match(previewSource, /upgradeStudioEnvironment\(app/);
  assert.match(previewSource, /attachStudioBackdrop\(app/);
  assert.match(previewSource, /initialTimeSeconds/);
  assert.match(previewSource, /onTimeChange/);
  assert.match(previewSource, /pause: /);
  assert.match(previewSource, /setTime: /);
  assert.match(previewSource, /getTime: /);
  assert.match(previewSource, /getDuration: /);
  assert.match(previewSource, /isPlaying: /);
  assert.match(previewSource, /fitView: /);
  assert.match(previewSource, /resetView: /);
  assert.match(previewSource, /capturePreviewFrame: /);
  assert.match(previewSource, /toDataURL\("image\/jpeg"/);
  assert.doesNotMatch(previewSource, /UAL1_Standard\.glb/);
});

test("加载中也可同步取消：cancel 销毁应用，避免双应用共享 WebGL 上下文", () => {
  assert.match(previewSource, /cancel: \(\) =>/);
  assert.match(previewSource, /cleanup\(\)/);
  assert.match(previewSource, /if \(destroyed\) throw new Error\("预览已关闭。"\)/);
  // 完整预览页 effect 清理必须调用 cancel（而不是等加载完成后销毁）
  assert.match(previewPageSource, /handle\.cancel\(\)/);
});

test("预览器销毁时释放资产与上下文，不残留 WebGL 画布", () => {
  assert.match(previewSource, /app\.assets\.remove\(asset\)/);
  assert.match(previewSource, /app\.destroy\(\)/);
  assert.match(previewSource, /resizeObserver\.disconnect\(\)/);
});

test("缩略图生成器装配动作片段并摆到代表帧后抓图，缓存进 localStorage", () => {
  assert.match(studioSource, /export function ensureAnimationThumbnail/);
  assert.match(studioSource, /export function getAnimationThumbnail/);
  assert.match(studioSource, /export function subscribeAnimationThumbnails/);
  assert.match(studioSource, /animation-library:thumbnails:v3/);
  assert.match(studioSource, /preserveDrawingBuffer: true/);
  assert.match(studioSource, /addComponent\("anim"/);
  assert.match(studioSource, /anim\.rootBone = model/);
  assert.match(studioSource, /assignAnimation\(entry\.clipName, track, 0, 1, true\)/);
  assert.match(studioSource, /activeStateCurrentTime = /);
  assert.match(studioSource, /app\.assets\.remove\(asset\)/);
  assert.match(studioSource, /app\.destroy\(\)/);
});

test("动画库是入口页：分类页签 + 动画卡片（预览图 + 名字）+ 完整预览页", () => {
  assert.match(pageSource, /data-animation-page/);
  assert.match(pageSource, /data-animation-category-table/);
  assert.match(pageSource, /aria-label="动画分类"/);
  assert.match(pageSource, /\["全部", \.\.\.ANIMATION_LIBRARY_CATEGORIES\]/);
  assert.match(pageSource, /data-animation-grid/);
  assert.match(pageSource, /data-animation-card/);
  assert.match(pageSource, /ensureAnimationThumbnail\(entry\)/);
  assert.match(pageSource, /getAnimationThumbnail\(entry\.id\)/);
  assert.match(pageSource, /subscribeAnimationThumbnails/);
  assert.match(pageSource, /alt=\{`\$\{entry\.name\} 预览`\}/);
  assert.match(pageSource, /ANIMATION_LIBRARY\.filter/);
  assert.match(pageSource, /Link/);
  assert.match(pageSource, /to=\{`\/animations\/\$\{entry\.id\}`\}/);
  assert.doesNotMatch(pageSource, /Dialog/);
  // 卡片网格取代旧表格：页面不再渲染 <table>
  assert.doesNotMatch(pageSource, /<table/);
});

test("动画预览页包含 3D 画布、时间轴、播放控制和关键帧操作", () => {
  assert.match(previewPageSource, /useParams/);
  assert.match(previewPageSource, /openAnimationPreview\(/);
  assert.match(previewPageSource, /data-animation-preview-page/);
  assert.match(previewPageSource, /data-animation-preview-canvas/);
  assert.match(previewPageSource, /type="range"/);
  assert.match(previewPageSource, /setTime\(/);
  assert.match(previewPageSource, /capturePreviewFrame\(/);
  assert.match(previewPageSource, /setAnimationKeyframe\(/);
  assert.match(previewPageSource, /clearAnimationKeyframe\(/);
  assert.match(previewPageSource, /fitView\(/);
  assert.match(previewPageSource, /resetView\(/);
  assert.match(previewPageSource, /handle\.cancel\(\)/);
});

test("顶部导航在模型与系统之间提供动画入口，模型页不再内嵌动画", () => {
  const items = navSource.indexOf('to: "/animations", label: "动画"');
  const models = navSource.indexOf('to: "/models", label: "模型"');
  const settings = navSource.indexOf('to: "/settings", label: "系统"');
  assert.ok(items > models && items < settings, "动画入口应位于模型与系统之间");
  assert.doesNotMatch(modelPageSource, /AnimationTable|data-animation-table|openAnimationPreview/);
});

test("动画目录来源与片段名保持 Cine57 重定向产物命名", () => {
  assert.match(catalogSource, /ANIMATION_LIBRARY_SOURCE = "Cine57"/);
  assert.match(catalogSource, /clipName: "A_INP_Idle"/);
  assert.match(catalogSource, /clipName: "A_INP_WalkFwd_Loop"/);
  assert.match(catalogSource, /clipName: "A_chair_loop01"/);
});
