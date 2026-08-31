import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  MODEL_PREVIEW_FRAMING,
  fitModelPreviewCamera,
  getModelPreviewAspectRatio,
  projectModelPreviewPoints,
  projectModelPreviewBounds,
} from "./modelPreviewFraming.ts";

const BOXES = {
  compact: { min: [-0.5, 0, -0.5], max: [0.5, 1, 0.5] },
  tall: { min: [-0.35, 0, -0.35], max: [0.35, 3, 0.35] },
  wideFlat: { min: [-2.5, 0, -0.45], max: [2.5, 0.2, 0.45] },
};

const THUMBNAIL_SOURCE = fs.readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "thumbnailStudio.ts"),
  "utf8",
);

test("模型预览使用统一的三分之四标准视角", () => {
  assert.equal(MODEL_PREVIEW_FRAMING.azimuthDegrees, -45);
  assert.equal(MODEL_PREVIEW_FRAMING.elevationDegrees, -25);
  assert.equal(MODEL_PREVIEW_FRAMING.fovDegrees, 50);
  assert.equal(MODEL_PREVIEW_FRAMING.targetOccupancy, 0.8);
  assert.deepEqual(
    [MODEL_PREVIEW_FRAMING.minOccupancy, MODEL_PREVIEW_FRAMING.maxOccupancy],
    [0.76, 0.84],
  );
});

for (const [label, bounds] of Object.entries(BOXES)) {
  test(`${label} 模型按 AABB 八角点计算出有限且约 80% 的构图`, () => {
    const fit = fitModelPreviewCamera(bounds, 4 / 3);
    assert.ok(Number.isFinite(fit.distance));
    assert.ok(fit.distance > 0);
    const projection = projectModelPreviewBounds(bounds, fit, 4 / 3);
    assert.ok(Number.isFinite(projection.maxOccupancy));
    assert.ok(
      projection.maxOccupancy >= MODEL_PREVIEW_FRAMING.minOccupancy
        && projection.maxOccupancy <= MODEL_PREVIEW_FRAMING.maxOccupancy,
      `${label} occupancy=${projection.maxOccupancy}`,
    );
  });
}

test("退化包围盒也不会把 NaN 或 Infinity 传入渲染器", () => {
  const fit = fitModelPreviewCamera({ min: [0, 0, 0], max: [0, 0, 0] }, 4 / 3);
  assert.ok(Number.isFinite(fit.distance));
  assert.ok(fit.distance > 0);
});

test("取景优先按实际顶点投影，避免薄圆模型被 AABB 过度留白", () => {
  const points = [
    [-0.35, 0, 0],
    [0.35, 0, 0],
    [0, 0.18, -0.18],
    [0, 0.18, 0.18],
  ];
  const bounds = { min: [-0.5, 0, -0.5], max: [0.5, 0.3, 0.5] };
  const conservativeFit = fitModelPreviewCamera(bounds, 4 / 3);
  const tightFit = fitModelPreviewCamera(bounds, 4 / 3, points);
  const projection = projectModelPreviewPoints(points, tightFit, 4 / 3);

  assert.ok(tightFit.distance < conservativeFit.distance);
  assert.ok(
    projection.maxOccupancy >= MODEL_PREVIEW_FRAMING.minOccupancy
      && projection.maxOccupancy <= MODEL_PREVIEW_FRAMING.maxOccupancy,
    `occupancy=${projection.maxOccupancy}`,
  );
});

test("实际顶点的透视投影会回正到画面中心，避免模型偏向边缘", () => {
  const points = [
    [-0.2, 0, 0],
    [0.8, 0, 0],
    [0.3, 1, 0],
    [0.3, 0, 0.2],
  ];
  const bounds = { min: [-0.2, 0, 0], max: [0.8, 1, 0.2] };
  const fit = fitModelPreviewCamera(bounds, 898 / 544, points);
  const projection = projectModelPreviewPoints(points, fit, 898 / 544);

  assert.ok(Math.abs(projection.centerX) < 1e-5, `centerX=${projection.centerX}`);
  assert.ok(Math.abs(projection.centerY) < 1e-5, `centerY=${projection.centerY}`);
  assert.ok(
    projection.maxOccupancy >= MODEL_PREVIEW_FRAMING.minOccupancy
      && projection.maxOccupancy <= MODEL_PREVIEW_FRAMING.maxOccupancy,
    `occupancy=${projection.maxOccupancy}`,
  );
});

test("初始拟合优先使用页面 CSS 画布比例，而不是默认绘图缓冲比例", () => {
  assert.equal(
    getModelPreviewAspectRatio({ clientWidth: 898, clientHeight: 544, width: 300, height: 150 }),
    898 / 544,
  );
  assert.equal(
    getModelPreviewAspectRatio({ clientWidth: 0, clientHeight: 0, width: 300, height: 150 }),
    2,
  );
});

test("取景合同变化时缩略图缓存使用新版本", () => {
  assert.match(THUMBNAIL_SOURCE, /model-library:thumbnails:v26/);
  assert.match(THUMBNAIL_SOURCE, /instantiateRenderEntity\?\.\(\{ castShadows: true \}\)/);
  assert.doesNotMatch(THUMBNAIL_SOURCE, /toneMapping\s*=\s*pc\.TONEMAP_ACES/);
  assert.doesNotMatch(THUMBNAIL_SOURCE, /model-library:thumbnails:v25/);
  assert.doesNotMatch(THUMBNAIL_SOURCE, /model-library:thumbnails:v22/);
  assert.doesNotMatch(THUMBNAIL_SOURCE, /model-library:thumbnails:v21/);
  assert.doesNotMatch(THUMBNAIL_SOURCE, /model-library:thumbnails:v20/);
});
