import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../src/api/media/drama.ts", import.meta.url), "utf8");

test("客户端草图 API 使用独立的元数据、PNG 上传与确认端点", () => {
  assert.match(source, /DramaShotBlockingSketchData/);
  assert.match(source, /getDramaShotBlockingSketch/);
  assert.match(source, /saveDramaShotBlockingSketch/);
  assert.match(source, /uploadDramaShotBlockingSketchPng/);
  assert.match(source, /confirmDramaShotBlockingSketch/);
  assert.match(source, /blocking-sketch\/image/);
});

test("客户端草图 API 暴露自动构图端点", () => {
  assert.match(source, /autoPlanDramaShotBlockingSketch/);
  assert.match(source, /blocking-sketch\/auto-plan/);
});
