import assert from "node:assert/strict";
import test from "node:test";

import { buildModelLibraryImportHistory } from "./generate-model-library-import-history.mjs";
import {
  buildImportSourceFingerprint,
  validateImportHistoryDocument,
} from "./modelLibraryImportHistory.mjs";

const ROWS = [
  {
    package: "/Game/Props/SM_Desk",
    objectPath: "/Game/Props/SM_Desk.SM_Desk",
    fbx: "desk.fbx",
    fbxSha256: "a".repeat(64),
  },
  {
    package: "/Game/Props/SM_Debris",
    objectPath: "/Game/Props/SM_Debris.SM_Debris",
    fbx: "debris.fbx",
    fbxSha256: "b".repeat(64),
  },
];

test("manifest 来源标记不会污染跨运行的源指纹", () => {
  const enriched = { ...ROWS[0] };
  Object.defineProperty(enriched, "__manifestName", { value: "_manifest.json", enumerable: false });
  assert.equal(buildImportSourceFingerprint(enriched), buildImportSourceFingerprint(ROWS[0]));
});

test("历史台账生成器同时记录通过和拒绝结论", () => {
  const history = buildModelLibraryImportHistory({
    rows: ROWS,
    catalog: [{ id: "desk", category: "家具", fileName: "SM_Desk.glb" }],
    policy: {
      newAssets: [
        { id: "desk", meshName: "SM_Desk", package: "/Game/Props/SM_Desk" },
        { id: "debris", meshName: "SM_Debris", package: "/Game/Props/SM_Debris" },
      ],
      foregroundAdmission: {
        rejectedAssets: [{
          id: "debris",
          meshName: "SM_Debris",
          fileName: "SM_Debris.glb",
          reasonCode: "ground-scatter",
          failureStage: "semantic",
          reason: "地面散布物不作为前景资产",
          evidence: "test-review",
        }],
      },
    },
    visualReviews: {
      entries: [{
        id: "desk",
        reviewStatus: "approved",
        reviewEvidence: "test-preview",
        preview: { screenshotPath: "desk.jpg", screenshotSha256: "c".repeat(64) },
      }],
    },
    reviewedAt: "2026-09-03T00:00:00.000Z",
  });

  assert.equal(history.entries.length, 2);
  assert.equal(history.entries.filter((entry) => entry.status === "approved").length, 1);
  assert.equal(history.entries.filter((entry) => entry.status === "rejected").length, 1);
  assert.deepEqual(validateImportHistoryDocument(history), []);
  assert.equal(history.entries.find((entry) => entry.status === "rejected").skipUntilSourceChange, true);

  const rerun = buildModelLibraryImportHistory({
    rows: ROWS,
    catalog: [{ id: "desk", category: "家具", fileName: "SM_Desk.glb" }],
    policy: {
      newAssets: [
        { id: "desk", meshName: "SM_Desk", package: "/Game/Props/SM_Desk" },
        { id: "debris", meshName: "SM_Debris", package: "/Game/Props/SM_Debris" },
      ],
      foregroundAdmission: {
        rejectedAssets: [{
          id: "debris",
          meshName: "SM_Debris",
          fileName: "SM_Debris.glb",
          reasonCode: "ground-scatter",
          failureStage: "semantic",
          reason: "地面散布物不作为前景资产",
          evidence: "test-review",
        }],
      },
    },
    visualReviews: {
      entries: [{
        id: "desk",
        reviewStatus: "approved",
        reviewEvidence: "test-preview",
        preview: { screenshotPath: "desk.jpg", screenshotSha256: "c".repeat(64) },
      }],
    },
    reviewedAt: "2026-09-03T00:00:00.000Z",
    existingHistory: history,
  });
  assert.equal(rerun.entries.every((entry) => entry.events.length === 1), true);
});
