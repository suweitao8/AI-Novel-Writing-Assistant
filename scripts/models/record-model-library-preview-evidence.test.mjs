import assert from "node:assert/strict";
import test from "node:test";

import { buildPreviewReviews } from "./record-model-library-preview-evidence.mjs";

const BASE_COLOR = "/models/cine57/tex/demo.png";
const ENTRY = {
  id: "demo",
  fileUrl: "/models/cine57/demo.glb",
  materials: { MI_Demo: { baseColor: BASE_COLOR } },
};
const REVIEW = {
  id: "demo",
  meshName: "SM_Demo_LOD0",
  fileName: "demo.glb",
  name: "示例",
  category: "日用小物",
  visualDescription: "标准缩略图中可见示例",
  reviewStatus: "approved",
  reviewEvidence: "legacy",
};

test("详情页审核证据绑定资源 hash 和透明材质状态", () => {
  const document = buildPreviewReviews({
    library: [ENTRY],
    reviewDocument: { version: 1, entries: [REVIEW] },
    browserAudit: {
      version: 1,
      auditedAt: "2026-09-03T12:00:00.000Z",
      entries: [{ href: "/models/demo", ready: true, screenshotCaptured: true }],
    },
    assetSha256ById: new Map([["demo", "a".repeat(64)]]),
    importAuditByTexture: new Map([[BASE_COLOR, { preserveAlpha: true }]]),
  });

  assert.equal(document.source, "Cine57 detail-page 3D previews");
  assert.equal(document.entries[0].reviewEvidence, "model-preview-audit-2026-09-03");
  assert.equal(document.entries[0].visualDescription, "详情预览中可见示例");
  assert.deepEqual(document.entries[0].preview, {
    previewPath: "/models/demo",
    assetSha256: "a".repeat(64),
    renderer: "model-detail-v1",
    renderedAt: "2026-09-03T12:00:00.000Z",
    textureStatus: "alpha-preserved",
    browserAudit: "model-library-preview-browser-audit.json",
    screenshotCaptured: true,
  });
});

test("未完成的详情页审计不能生成审核清单", () => {
  assert.throws(
    () => buildPreviewReviews({
      library: [ENTRY],
      reviewDocument: { version: 1, entries: [REVIEW] },
      browserAudit: {
        version: 1,
        auditedAt: "2026-09-03T12:00:00.000Z",
        entries: [{ href: "/models/demo", ready: false, screenshotCaptured: false }],
      },
      assetSha256ById: new Map([["demo", "a".repeat(64)]]),
      importAuditByTexture: {},
    }),
    /not ready/,
  );
});
