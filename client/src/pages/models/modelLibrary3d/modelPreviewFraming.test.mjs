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
const MODEL_EDITOR_SOURCE = fs.readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "ModelEditorPage.tsx"),
  "utf8",
);
const MODEL_LIBRARY_SOURCE = fs.readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "ModelLibraryPage.tsx"),
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
  assert.match(THUMBNAIL_SOURCE, /model-library:thumbnails:v28/);
  assert.match(THUMBNAIL_SOURCE, /instantiateRenderEntity\?\.\(\{ castShadows: true \}\)/);
  assert.doesNotMatch(THUMBNAIL_SOURCE, /toneMapping\s*=\s*pc\.TONEMAP_ACES/);
  assert.doesNotMatch(THUMBNAIL_SOURCE, /model-library:thumbnails:v25/);
  assert.doesNotMatch(THUMBNAIL_SOURCE, /model-library:thumbnails:v24/);
  assert.doesNotMatch(THUMBNAIL_SOURCE, /model-library:thumbnails:v22/);
  assert.doesNotMatch(THUMBNAIL_SOURCE, /model-library:thumbnails:v21/);
  assert.doesNotMatch(THUMBNAIL_SOURCE, /model-library:thumbnails:v20/);
});

test("模型查看器在 StrictMode 清理窗口后再创建 WebGL 应用", () => {
  const effectStartIndex = MODEL_EDITOR_SOURCE.indexOf("useEffect(() =>");
  const createViewerIndex = MODEL_EDITOR_SOURCE.indexOf("createModelViewer(", effectStartIndex);
  const startFunctionIndex = MODEL_EDITOR_SOURCE.indexOf("const start = async", effectStartIndex);
  const cancellationGateIndex = MODEL_EDITOR_SOURCE.indexOf("await Promise.resolve();", effectStartIndex);

  assert.ok(effectStartIndex >= 0, "模型页必须有查看器初始化 effect");
  assert.ok(startFunctionIndex >= 0, "模型页必须通过可取消的启动流程创建查看器");
  assert.ok(
    cancellationGateIndex >= 0 &&
      cancellationGateIndex < createViewerIndex,
    "创建 WebGL 应用前必须先跨过 StrictMode 的同步清理窗口",
  );
});

test("模型缩略图初始化失败也会释放隐藏画布和 WebGL 应用", () => {
  assert.match(
    THUMBNAIL_SOURCE,
    /const destroy = \(\) => \{[\s\S]*?pc\.AppBase\.cancelTick\(app\)[\s\S]*?app\.destroy\(\)[\s\S]*?offscreenCanvasMount\(\)/,
  );
  assert.match(
    THUMBNAIL_SOURCE,
    /if \(!studioEnvironment\.hasVisibleBackdrop\)[\s\S]*?throw new Error\("HDRI 场景环境加载失败。"\)/,
  );
});

test("模型缩略图工作室初始化失败后允许后续请求重试", () => {
  const initializationAwaitIndex = THUMBNAIL_SOURCE.indexOf("active = await studioPromise;");
  const retryResetIndex = THUMBNAIL_SOURCE.indexOf("studioPromise = null", initializationAwaitIndex);

  assert.ok(
    initializationAwaitIndex >= 0 && retryResetIndex > initializationAwaitIndex,
    "模型缩略图工作室失败后必须清空已拒绝的 Promise",
  );
});

test("离开模型库时可立即销毁仍在初始化的 HDRI 缩略图应用", () => {
  assert.match(THUMBNAIL_SOURCE, /export async function disposeThumbnailStudio/);
  assert.match(THUMBNAIL_SOURCE, /let pendingStudioDestroy: \(\(\) => void\) \| null = null/);
  assert.match(THUMBNAIL_SOURCE, /pendingStudioDestroy\?\.\(\)/);
  assert.match(THUMBNAIL_SOURCE, /pendingStudioDestroy = destroy/);
  assert.match(THUMBNAIL_SOURCE, /let processingPromise: Promise<void> \| null = null/);
  assert.match(THUMBNAIL_SOURCE, /const queueToWait = processingPromise/);
  assert.match(MODEL_EDITOR_SOURCE, /await disposeThumbnailStudio\(\)/);
  const disposeIndex = MODEL_EDITOR_SOURCE.indexOf("await disposeThumbnailStudio()");
  const createViewerIndex = MODEL_EDITOR_SOURCE.indexOf("createModelViewer(");
  assert.ok(disposeIndex >= 0 && createViewerIndex > disposeIndex);
});

test("离开模型库列表时释放缩略图 HDRI 工作室", () => {
  assert.match(
    MODEL_LIBRARY_SOURCE,
    /useEffect\(\(\) => \{\s*return \(\) => \{\s*void disposeThumbnailStudio\(\);/,
  );
});

test("模型卡片缩略图只保留模型、HDRI 和投影阴影，不绘制编辑器网格", () => {
  assert.doesNotMatch(THUMBNAIL_SOURCE, /buildBlocking3dGroundGridLines/);
  assert.doesNotMatch(THUMBNAIL_SOURCE, /drawBlocking3dGroundGrid/);
  assert.match(THUMBNAIL_SOURCE, /lightingProfile:\s*["']model-preview["']/);
  assert.match(THUMBNAIL_SOURCE, /castShadows: true/);
});
