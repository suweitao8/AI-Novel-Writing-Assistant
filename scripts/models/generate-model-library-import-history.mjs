import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { MODEL_LIBRARY } from "../../client/src/config/modelLibrary.ts";
import {
  CINE57_MODEL_LIBRARY_POLICY,
  getNewAssetById,
} from "./modelLibraryPolicy.mjs";
import {
  appendImportHistoryEvent,
  buildImportAssetKey,
  buildImportSourceFingerprint,
  createImportHistoryDocument,
  findImportHistoryRecord,
  MODEL_LIBRARY_IMPORT_HISTORY_PATH,
  readImportHistory,
  writeImportHistory,
} from "./modelLibraryImportHistory.mjs";
import { readManifestFile } from "./modelLibraryImportWorkflow.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const VISUAL_REVIEW_PATH = path.join(SCRIPT_DIR, "model-library-visual-review.json");

function packageBasename(packagePath) {
  return path.posix.basename(String(packagePath ?? "").replaceAll("\\", "/"));
}

function sourceManifestName(filePath) {
  return path.basename(filePath);
}

function loadRows(manifestPaths) {
  const rows = [];
  for (const manifestPath of manifestPaths) {
    for (const row of readManifestFile(manifestPath)) {
      const enrichedRow = { ...row };
      Object.defineProperty(enrichedRow, "__manifestName", {
        value: sourceManifestName(manifestPath),
        enumerable: false,
      });
      rows.push(enrichedRow);
    }
  }
  return rows;
}

function indexRows(rows) {
  const byPackage = new Map();
  const byBasename = new Map();
  for (const row of rows) {
    const packagePath = String(row.package ?? "").replaceAll("\\", "/");
    if (!packagePath) continue;
    byPackage.set(packagePath, row);
    const basename = packageBasename(packagePath);
    const matches = byBasename.get(basename) ?? [];
    matches.push(row);
    byBasename.set(basename, matches);
  }
  return { byPackage, byBasename };
}

function sourceRowForEntry(entry, policyAsset, indexes) {
  const policyPackage = String(policyAsset?.package ?? "").replaceAll("\\", "/");
  const expectedBasename = path.basename(entry.fileName, path.extname(entry.fileName));
  const exact = indexes.byPackage.get(policyPackage);
  if (exact) return exact;
  const matches = indexes.byBasename.get(expectedBasename) ?? [];
  if (matches.length === 1) return matches[0];
  if (matches.length === 0) {
    throw new Error(`No Cine57 manifest row found for ${entry.id} (${entry.fileName})`);
  }
  throw new Error(
    `Ambiguous Cine57 manifest rows for ${entry.id} (${entry.fileName}); add an exact package mapping to model-library-selection.json`,
  );
}

function reviewedAtFromArg(value) {
  const reviewedAt = value ?? "2026-09-03T00:00:00.000Z";
  if (Number.isNaN(Date.parse(reviewedAt))) throw new Error(`Invalid --reviewed-at timestamp: ${reviewedAt}`);
  return reviewedAt;
}

function buildApprovedEvidence(entry, visualReview, row) {
  return {
    visualReview: visualReview?.reviewEvidence ?? "model-library-visual-review",
    previewPath: visualReview?.preview?.screenshotPath ?? null,
    previewSha256: visualReview?.preview?.screenshotSha256 ?? null,
    assetSha256: visualReview?.preview?.assetSha256 ?? null,
    sourceManifest: row.__manifestName,
    catalogId: entry.id,
  };
}

function appendIfConclusionChanged(history, payload) {
  const assetKey = buildImportAssetKey({
    packagePath: payload.packagePath,
    meshName: payload.meshName,
  });
  const current = findImportHistoryRecord(history, assetKey);
  if (current
    && current.sourceFingerprint === payload.sourceFingerprint
    && current.status === payload.status
    && current.failureStage === payload.failureStage
    && current.reasonCode === payload.reasonCode
    && current.summary === payload.summary
    && JSON.stringify(current.evidence) === JSON.stringify(payload.evidence)
    && current.skipUntilSourceChange === payload.skipUntilSourceChange) {
    return history;
  }
  return appendImportHistoryEvent({ history, ...payload });
}

/** Build a durable first-pass ledger for every current and explicitly rejected Cine57 asset. */
export function buildModelLibraryImportHistory({
  rows,
  catalog = MODEL_LIBRARY,
  policy = CINE57_MODEL_LIBRARY_POLICY,
  visualReviews = JSON.parse(fs.readFileSync(VISUAL_REVIEW_PATH, "utf8")),
  reviewedAt = "2026-09-03T00:00:00.000Z",
  existingHistory = null,
} = {}) {
  const normalizedReviewedAt = reviewedAtFromArg(reviewedAt);
  const indexes = indexRows(rows);
  const visualReviewById = new Map((visualReviews.entries ?? []).map((review) => [review.id, review]));
  const policyAssetById = new Map(policy.newAssets.map((asset) => [asset.id, asset]));
  let history = existingHistory ?? createImportHistoryDocument({ generatedAt: normalizedReviewedAt });

  const staticEntries = catalog.filter((entry) => entry.category !== "角色");
  for (const entry of staticEntries) {
    const policyAsset = policyAssetById.get(entry.id);
    const row = sourceRowForEntry(entry, policyAsset, indexes);
    const visualReview = visualReviewById.get(entry.id);
    if (visualReview?.reviewStatus !== "approved") {
      throw new Error(`Current catalog entry lacks an approved visual review: ${entry.id}`);
    }
    history = appendIfConclusionChanged(history, {
      row,
      packagePath: row.package,
      meshName: policyAsset?.meshName ?? packageBasename(row.package),
      sourceFingerprint: buildImportSourceFingerprint(row),
      status: "approved",
      failureStage: null,
      reasonCode: null,
      summary: "已通过几何尺寸、材质、方形详情预览与视觉审核门禁",
      evidence: buildApprovedEvidence(entry, visualReview, row),
      reviewedAt: normalizedReviewedAt,
      skipUntilSourceChange: false,
    });
  }

  for (const rejected of policy.foregroundAdmission?.rejectedAssets ?? []) {
    const entry = catalog.find((candidate) => candidate.id === rejected.id) ?? {
      id: rejected.id,
      fileName: rejected.fileName,
    };
    const policyAsset = policyAssetById.get(rejected.id);
    const row = sourceRowForEntry(entry, policyAsset, indexes);
    history = appendIfConclusionChanged(history, {
      row,
      packagePath: row.package,
      meshName: rejected.meshName,
      sourceFingerprint: buildImportSourceFingerprint(row),
      status: "rejected",
      failureStage: rejected.failureStage,
      reasonCode: rejected.reasonCode,
      summary: rejected.reason,
      evidence: {
        review: rejected.evidence,
        sourceManifest: row.__manifestName,
        catalogId: rejected.id,
      },
      reviewedAt: normalizedReviewedAt,
      skipUntilSourceChange: true,
    });
  }

  history.entries.sort((left, right) => left.assetKey.localeCompare(right.assetKey));
  return history;
}

function argumentValues(name) {
  const values = [];
  for (let index = 0; index < process.argv.length; index += 1) {
    if (process.argv[index] === name && process.argv[index + 1]) values.push(process.argv[index + 1]);
  }
  return values;
}

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

function main() {
  const manifestPaths = argumentValues("--manifest");
  if (manifestPaths.length === 0) {
    throw new Error("Provide at least one --manifest <path>; source manifests are intentionally explicit");
  }
  const outputPath = argumentValue("--output") ?? MODEL_LIBRARY_IMPORT_HISTORY_PATH;
  const existingHistory = fs.existsSync(outputPath) ? readImportHistory(outputPath) : null;
  const history = buildModelLibraryImportHistory({
    rows: loadRows(manifestPaths),
    reviewedAt: argumentValue("--reviewed-at") ?? undefined,
    existingHistory,
  });
  writeImportHistory(history, outputPath);
  console.log(`model library import history written: ${history.entries.length} entries -> ${outputPath}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
