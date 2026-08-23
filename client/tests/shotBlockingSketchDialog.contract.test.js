import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("../src/pages/drama/comicDrama/components/ShotBlockingSketchDialog.tsx", import.meta.url),
  "utf8",
);

test("摆位草图对话框使用可导出画布，并支持保存和确认", () => {
  assert.match(source, /<canvas/);
  assert.match(source, /toBlob/);
  assert.match(source, /saveDramaShotBlockingSketch/);
  assert.match(source, /uploadDramaShotBlockingSketchPng/);
  assert.match(source, /confirmDramaShotBlockingSketch/);
  assert.match(source, /保存草图/);
  assert.match(source, /确认草图/);
});

test("摆位草图支持角色拖动、缩放、翻转与层级调整", () => {
  assert.match(source, /onPointerDown/);
  assert.match(source, /flipX/);
  assert.match(source, /zIndex/);
  assert.match(source, /角色列表/);
});
