import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  appendImportHistoryEvent,
  createImportHistoryDocument,
} from "./modelLibraryImportHistory.mjs";
import {
  buildImportPreflight,
  validateStagedImportReport,
} from "./modelLibraryImportWorkflow.mjs";

const ROW = { package: "/Game/Props/SM_Debris_Pile_02a", fbx: "debris.fbx" };
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

test("preflight 先标记历史拒绝，避免把模型送进转换队列", () => {
  const history = appendImportHistoryEvent({
    history: createImportHistoryDocument(),
    row: ROW,
    status: "rejected",
    failureStage: "semantic",
    reasonCode: "ground-scatter",
    summary: "碎屑不作为前景资产",
    evidence: "foreground-curation-2026-09-03",
  });
  const plan = buildImportPreflight({ rows: [ROW], importHistory: history });
  assert.equal(plan.candidates.length, 0);
  assert.equal(plan.rejected.length, 1);
  assert.equal(plan.rejected[0].status, "skipped");
  assert.equal(plan.rejected[0].reason, "previously-rejected");
});

test("staged report 必须有真实方形截图文件才允许发布", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "model-import-workflow-"));
  const screenshotRelative = "artifacts/model-preview-audit/desk.jpg";
  const screenshotPath = path.join(tempRoot, screenshotRelative);
  fs.mkdirSync(path.dirname(screenshotPath), { recursive: true });
  fs.writeFileSync(screenshotPath, Buffer.from("captured-preview"));
  const validPreview = {
    ...PREVIEW,
    screenshotSha256: "".padStart(64, "0"),
  };
  const crypto = await import("node:crypto");
  validPreview.screenshotSha256 = crypto.createHash("sha256").update(fs.readFileSync(screenshotPath)).digest("hex");
  const report = {
    entries: [{
      entry: { id: "desk", fileName: "SM_Desk.glb" },
      inspection: { maxDimensionMeters: 1 },
      preview: validPreview,
      assetSha256: validPreview.assetSha256,
      textureErrors: [],
    }],
  };
  assert.equal(validateStagedImportReport({ report, screenshotArtifactsRoot: tempRoot }).publishable, true);
  fs.writeFileSync(screenshotPath, Buffer.from("changed-preview"));
  const failed = validateStagedImportReport({ report, screenshotArtifactsRoot: tempRoot });
  assert.equal(failed.publishable, false);
  assert.match(failed.failures[0].errors[0], /hash/);
});
