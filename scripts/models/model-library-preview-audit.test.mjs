import assert from "node:assert/strict";
import test from "node:test";

import {
  mergePreviewAuditIntoVisualReviews,
  validatePreviewAuditDocument,
  validatePreviewAuditEntry,
} from "./model-library-preview-audit.mjs";

const VALID_ENTRY = {
  id: "grass-02-a-1",
  route: "/models/grass-02-a-1",
  screenshotPath: "artifacts/model-preview-audit/grass-02-a-1.jpg",
  screenshotSha256: "c".repeat(64),
  assetSha256: "a".repeat(64),
  renderer: "model-detail-v1",
  renderedAt: "2026-09-03T00:00:00.000Z",
  canvas: { width: 1280, height: 720 },
  screenshotDimensions: { width: 544, height: 544 },
  geometryReady: true,
  textureStatus: "alpha-preserved",
  consoleErrors: [],
  failedRequests: [],
  screenshotCaptured: true,
  reviewStatus: "approved",
};

test("真实模型预览记录必须具备可复核的截图、几何和请求证据", () => {
  assert.deepEqual(validatePreviewAuditEntry(VALID_ENTRY), []);
  assert.ok(validatePreviewAuditEntry({ ...VALID_ENTRY, geometryReady: false }).some((error) => error.includes("geometry")));
  assert.ok(validatePreviewAuditEntry({ ...VALID_ENTRY, assetSha256: "pending-browser-preview" }).some((error) => error.includes("hash")));
  assert.ok(validatePreviewAuditEntry({ ...VALID_ENTRY, failedRequests: ["/models/cine57/missing.glb"] }).length > 0);
  assert.ok(validatePreviewAuditEntry({ ...VALID_ENTRY, screenshotPath: "synthetic-thumbnail-label" }).some((error) => error.includes("screenshot")));
  assert.ok(validatePreviewAuditEntry({ ...VALID_ENTRY, screenshotDimensions: { width: 544, height: 512 } }).some((error) => error.includes("square")));
});

test("预览审计文档必须覆盖目录且绑定当前资源指纹", () => {
  const library = [{ id: VALID_ENTRY.id, fileUrl: `/models/cine57/${VALID_ENTRY.id}.glb` }];
  const auditDocument = {
    version: 1,
    source: "built-in-browser-iab",
    auditedAt: VALID_ENTRY.renderedAt,
    entries: [VALID_ENTRY],
  };
  assert.deepEqual(
    validatePreviewAuditDocument({
      auditDocument,
      library,
      assetSha256ById: new Map([[VALID_ENTRY.id, VALID_ENTRY.assetSha256]]),
    }),
    [],
  );
  assert.ok(validatePreviewAuditDocument({
    auditDocument: { ...auditDocument, entries: [] },
    library,
    assetSha256ById: new Map([[VALID_ENTRY.id, VALID_ENTRY.assetSha256]]),
  }).some((error) => error.includes("missing")));
});

test("只有通过的浏览器记录才能合并进语义复核文档", () => {
  const reviewDocument = {
    version: 1,
    reviewedAt: "2026-08-31",
    source: "model-library",
    entries: [{
      id: VALID_ENTRY.id,
      meshName: "SM_grass_02_A_1_LOD0",
      fileName: "grass-02-a-1.glb",
      name: "草丛 B",
      category: "草",
      visualDescription: "标准缩略图中可见草丛 B",
      reviewStatus: "approved",
      reviewEvidence: "standard-thumbnail-audit-2026-08-31",
    }],
  };
  const merged = mergePreviewAuditIntoVisualReviews({
    reviewDocument,
    auditDocument: {
      version: 1,
      source: "built-in-browser-iab",
      auditedAt: VALID_ENTRY.renderedAt,
      entries: [VALID_ENTRY],
    },
    assetSha256ById: new Map([[VALID_ENTRY.id, VALID_ENTRY.assetSha256]]),
  });
  assert.match(merged.entries[0].reviewEvidence, /^model-preview-audit-/);
  assert.equal(merged.entries[0].preview.screenshotPath, VALID_ENTRY.screenshotPath);
  assert.equal(merged.entries[0].preview.assetSha256, VALID_ENTRY.assetSha256);
  assert.deepEqual(merged.entries[0].preview.screenshotDimensions, VALID_ENTRY.screenshotDimensions);
  assert.match(merged.entries[0].visualDescription, /模型详情页预览/);
});
