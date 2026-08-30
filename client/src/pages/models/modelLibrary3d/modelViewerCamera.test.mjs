import assert from "node:assert/strict";
import test from "node:test";

import {
  getModelViewerCameraClipPlanes,
  getModelViewerCameraMinimumDistance,
  normalizeModelViewerCameraDistance,
} from "./modelViewerCamera.ts";

test("模型相机远端不再被 15 米 HDRI 的旧边界截断", () => {
  const distance = normalizeModelViewerCameraDistance(8, 1);

  assert.equal(distance, 8);
  assert.ok(distance > 6.375);
});

test("小模型的最近距离按模型尺寸计算，而不是固定 0.2 米", () => {
  const minimum = getModelViewerCameraMinimumDistance(0.001);

  assert.ok(minimum < 0.2);
  assert.equal(normalizeModelViewerCameraDistance(minimum / 2, 0.001), minimum);
});

test("远裁剪面随相机距离和模型半径扩大，近裁剪面支持近距离查看", () => {
  const close = getModelViewerCameraClipPlanes(0.01, 0.001);
  const far = getModelViewerCameraClipPlanes(500, 25);

  assert.ok(close.nearClip < 0.05);
  assert.ok(far.farClip > 500 + 25);
  assert.ok(far.farClip > close.farClip);
});

test("相机距离出现非有限值时回到模型尺度内的安全值", () => {
  const distance = normalizeModelViewerCameraDistance(Number.POSITIVE_INFINITY, 2);

  assert.ok(Number.isFinite(distance));
  assert.ok(distance >= getModelViewerCameraMinimumDistance(2));
});
