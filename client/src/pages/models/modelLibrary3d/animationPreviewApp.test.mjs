import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

// 预览器依赖 playcanvas 与 @/ 路径别名，Node 里不可直接导入；这里的契约
// 断言读取源码，守住「同步构建 → 加载 GLB → 装配动画组件 → 循环播放 →
// 可取消销毁」链路，特别是同一画布同一时刻只能存在一个 PlayCanvas 应用。
const previewSource = readFileSync(path.join(import.meta.dirname, "animationPreviewApp.ts"), "utf8");
const pageSource = readFileSync(path.join(import.meta.dirname, "..", "ModelLibraryPage.tsx"), "utf8");
const catalogSource = readFileSync(
  path.join(import.meta.dirname, "..", "..", "..", "config", "animationLibrary.ts"),
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

test("加载中也可同步取消：cancel 销毁应用，避免双应用共享 WebGL 上下文", () => {
  assert.match(previewSource, /cancel: \(\) =>/);
  assert.match(previewSource, /cleanup\(\)/);
  assert.match(previewSource, /if \(destroyed\) throw new Error\("预览已关闭。"\)/);
  // 页面 effect 清理必须调用 cancel（而不是等加载完成后销毁）
  assert.match(pageSource, /handle\.cancel\(\)/);
});

test("预览器销毁时释放资产与上下文，不残留 WebGL 画布", () => {
  assert.match(previewSource, /app\.assets\.remove\(asset\)/);
  assert.match(previewSource, /app\.destroy\(\)/);
  assert.match(previewSource, /resizeObserver\.disconnect\(\)/);
});

test("页面在模型表格旁渲染动画表格并提供预览弹窗", () => {
  assert.match(pageSource, /data-animation-table/);
  assert.match(pageSource, /data-animation-row-table/);
  assert.match(pageSource, /data-animation-row/);
  assert.match(pageSource, /ANIMATION_LIBRARY\.filter/);
  assert.match(pageSource, /openAnimationPreview\(/);
  assert.match(pageSource, /data-animation-preview-canvas/);
  assert.match(pageSource, /toast\.error\(/);
});

test("动画表格与模型表格同款分类页签（计数 + 过滤）", () => {
  assert.match(pageSource, /data-animation-category-table/);
  assert.match(pageSource, /aria-label="动画分类"/);
  assert.match(pageSource, /\["全部", \.\.\.ANIMATION_LIBRARY_CATEGORIES\]/);
  assert.match(catalogSource, /ANIMATION_LIBRARY_CATEGORIES = \["待机", "移动", "坐姿"\] as const/);
});

test("动画表格在宽屏位于模型网格旁、窄屏置顶，不再被网格压到底部", () => {
  const page = pageSource.replace(/\r\n/g, "\n");
  const animIdx = page.indexOf("data-animation-aside");
  const gridIdx = page.indexOf("data-model-grid");
  assert.ok(animIdx >= 0 && gridIdx >= 0 && animIdx < gridIdx, "动画区应在 DOM 中先于模型网格");
  assert.match(page, /xl:w-80 xl:shrink-0 xl:order-2" data-animation-aside/);
});

test("动画目录来源与片段名保持 Cine57 重定向产物命名", () => {
  assert.match(catalogSource, /ANIMATION_LIBRARY_SOURCE = "Cine57"/);
  assert.match(catalogSource, /clipName: "A_INP_Idle"/);
  assert.match(catalogSource, /clipName: "A_INP_WalkFwd_Loop"/);
  assert.match(catalogSource, /clipName: "A_chair_loop01"/);
});
