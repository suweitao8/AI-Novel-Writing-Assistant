import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_MAX_FOREGROUND_MODEL_DIMENSION_METERS,
  DEFAULT_MIN_FOREGROUND_MODEL_DIMENSION_METERS,
  evaluateModelCandidate,
} from "./modelLibraryImportAdmission.mjs";

const PREVIEW = {
  id: "desk",
  route: "/models/desk",
  screenshotPath: "artifacts/model-preview-audit/desk.jpg",
  screenshotSha256: "b".repeat(64),
  assetSha256: "a".repeat(64),
  renderer: "model-detail-v1",
  renderedAt: "2026-09-03T00:00:00.000Z",
  canvas: { width: 1280, height: 720 },
  screenshotDimensions: { width: 544, height: 544 },
  geometryReady: true,
  textureStatus: "opaque-verified",
  consoleErrors: [],
  failedRequests: [],
  screenshotCaptured: true,
  reviewStatus: "approved",
};

function evaluate(maxDimensionMeters, overrides = {}) {
  return evaluateModelCandidate({
    entry: { id: "desk", fileName: "SM_Desk.glb" },
    inspection: { maxDimensionMeters },
    preview: PREVIEW,
    ...overrides,
  });
}

test("前景尺寸门禁只接受 0.1 到 5 米的世界空间最大轴", () => {
  assert.equal(DEFAULT_MIN_FOREGROUND_MODEL_DIMENSION_METERS, 0.1);
  assert.equal(DEFAULT_MAX_FOREGROUND_MODEL_DIMENSION_METERS, 5);
  assert.equal(evaluate(0.1).accepted, true);
  assert.equal(evaluate(5).accepted, true);
  assert.equal(evaluate(0.099).reasonCode, "too-small");
  assert.equal(evaluate(5.001).reasonCode, "too-large");
});

test("显式策展拒绝优先于几何和预览结果", () => {
  const result = evaluate(1, {
    entry: { id: "debris", fileName: "SM_Debris.glb" },
    policy: {
      rejectedAssets: [{
        id: "debris",
        reasonCode: "ground-scatter",
        failureStage: "semantic",
        reason: "碎屑不作为前景资产",
      }],
    },
  });
  assert.deepEqual(result, {
    accepted: false,
    failureStage: "semantic",
    reasonCode: "ground-scatter",
    summary: "碎屑不作为前景资产",
  });
});

test("没有详情预览、非方形截图、请求失败或材质错误时不得发布", () => {
  assert.equal(evaluate(1, { preview: null }).reasonCode, "missing-preview");
  assert.equal(evaluate(1, {
    preview: { ...PREVIEW, screenshotDimensions: { width: 544, height: 512 } },
  }).reasonCode, "non-square-preview");
  assert.equal(evaluate(1, {
    preview: { ...PREVIEW, failedRequests: ["/models/cine57/missing.glb"] },
  }).reasonCode, "preview-failed");
  assert.equal(evaluate(1, {
    textureErrors: ["MI_Desk baseColor is missing"],
  }).reasonCode, "texture-invalid");
});

test("预览资源指纹变化后旧截图不能再次准入", () => {
  const result = evaluate(1, {
    expectedAssetSha256: "c".repeat(64),
  });
  assert.equal(result.failureStage, "preview");
assert.equal(result.reasonCode, "stale-preview");
});
