import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  parseJsonlManifest,
  selectExpansionCandidates,
} from "./modelLibraryExpansionCandidates.mjs";
import {
  buildImportAssetKey,
  buildImportSourceFingerprint,
  MODEL_LIBRARY_IMPORT_HISTORY_PATH,
  normalizeImportPackagePath,
  readImportHistory,
} from "./modelLibraryImportHistory.mjs";
import {
  CINE57_FOREGROUND_ADMISSION,
  CINE57_MODEL_LIBRARY_POLICY,
} from "./modelLibraryPolicy.mjs";
import { evaluateModelCandidate } from "./modelLibraryImportAdmission.mjs";
import { validatePreviewAuditEntry } from "./model-library-preview-audit.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
export const MODEL_LIBRARY_STAGED_IMPORT_VERSION = 1;

function packagePathForRow(row) {
  return row?.packagePath ?? row?.package ?? "";
}

function meshNameForRow(row) {
  const packagePath = String(packagePathForRow(row)).replaceAll("\\", "/");
  return String(row?.meshName ?? path.posix.basename(packagePath));
}

function buildPlanRecord(row, decision, defaultStatus) {
  const packagePath = packagePathForRow(row);
  const meshName = meshNameForRow(row);
  let assetKey = null;
  try {
    assetKey = buildImportAssetKey({ packagePath, meshName });
  } catch {
    // The candidate classifier still owns malformed-source rejection; a plan
    // should remain printable even when a row cannot produce a stable key.
  }
  return {
    assetKey,
    packagePath: assetKey ? normalizeImportPackagePath(packagePath) : packagePath,
    meshName,
    sourceFingerprint: buildImportSourceFingerprint(row),
    status: defaultStatus,
    reason: decision.reason ?? null,
    row,
  };
}

/** Build a side-effect-free import plan before any export, conversion, or preview work. */
export function buildImportPreflight({
  rows = [],
  selectedMeshNames,
  policy = CINE57_MODEL_LIBRARY_POLICY,
  importHistory,
  generatedAt = new Date().toISOString(),
} = {}) {
  const manifestRows = Array.isArray(rows) ? rows : [];
  const resolvedImportHistory = importHistory === undefined
    ? (fs.existsSync(MODEL_LIBRARY_IMPORT_HISTORY_PATH)
      ? readImportHistory(MODEL_LIBRARY_IMPORT_HISTORY_PATH)
      : null)
    : importHistory;
  const selected = selectedMeshNames instanceof Set
    ? selectedMeshNames
    : new Set(manifestRows.map(meshNameForRow).filter(Boolean));
  const selection = selectExpansionCandidates({
    rows: manifestRows,
    selectedMeshNames: selected,
    policy,
    importHistory: resolvedImportHistory,
  });
  const candidates = manifestRows
    .filter((row) => selection.candidates.includes(row))
    .map((row) => buildPlanRecord(row, { reason: null }, "candidate"));
  const rejected = selection.rejected.map((item) => buildPlanRecord(
    item.row,
    item,
    item.reason === "previously-rejected" ? "skipped" : "rejected",
  ));
  return {
    version: MODEL_LIBRARY_STAGED_IMPORT_VERSION,
    source: "Cine57",
    generatedAt,
    candidates,
    rejected,
    counts: {
      input: manifestRows.length,
      candidates: candidates.length,
      rejected: rejected.filter((item) => item.status === "rejected").length,
      skipped: rejected.filter((item) => item.status === "skipped").length,
    },
  };
}

/**
 * Validate every staged candidate using the same admission result that the
 * publication layer will use. No file is copied or replaced by this function.
 */
export function validateStagedImportReport({
  report,
  policy = CINE57_FOREGROUND_ADMISSION,
  screenshotArtifactsRoot,
} = {}) {
  const entries = Array.isArray(report?.entries) ? report.entries : [];
  const decisions = entries.map((candidate) => {
    const entry = candidate.entry ?? candidate.catalogEntry ?? candidate;
    const expectedAssetSha256 = candidate.assetSha256 ?? candidate.preview?.assetSha256;
    const admission = evaluateModelCandidate({
      entry,
      inspection: candidate.inspection,
      preview: candidate.preview,
      textureErrors: candidate.textureErrors,
      expectedAssetSha256,
      policy,
    });
    let errors = [];
    if (admission.accepted && screenshotArtifactsRoot) {
      errors = validatePreviewAuditEntry(candidate.preview, {
        expectedAssetSha256,
        screenshotArtifactsRoot,
      });
    }
    return {
      id: entry?.id ?? candidate.id ?? null,
      assetKey: candidate.assetKey ?? null,
      accepted: admission.accepted && errors.length === 0,
      admission,
      errors,
    };
  });
  const failures = decisions.filter((decision) => !decision.accepted);
  return {
    version: MODEL_LIBRARY_STAGED_IMPORT_VERSION,
    source: "Cine57",
    publishable: entries.length > 0 && failures.length === 0,
    entries: decisions,
    failures,
  };
}

export function assertStagedImportReady(options = {}) {
  const result = validateStagedImportReport(options);
  if (!result.publishable) {
    const details = result.failures.map((failure) => {
      const reason = failure.admission?.reasonCode ?? "preview-artifact-invalid";
      const summary = failure.admission?.summary ?? failure.errors?.[0] ?? "候选未通过发布门禁";
      return `- ${failure.id ?? failure.assetKey ?? "<unknown>"} [${reason}]: ${summary}`;
    });
    throw new Error(`Staged model import is not publishable:\n${details.join("\n")}`);
  }
  return result;
}

export function readManifestFile(filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  if (path.extname(filePath).toLowerCase() === ".jsonl") return parseJsonlManifest(text);
  const parsed = JSON.parse(text);
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === "object") return [parsed];
  throw new Error(`Manifest must contain an object array: ${filePath}`);
}

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

async function main() {
  const manifestPath = argumentValue("--manifest");
  if (process.argv.includes("--preflight")) {
    if (!manifestPath) throw new Error("--preflight requires --manifest <path>");
    const historyOverride = argumentValue("--history");
    const history = historyOverride
      ? readImportHistory(historyOverride)
      : undefined;
    const plan = buildImportPreflight({ rows: readManifestFile(manifestPath), importHistory: history });
    const outputPath = argumentValue("--output");
    if (outputPath) fs.writeFileSync(outputPath, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
    console.log(JSON.stringify(plan, null, 2));
    return;
  }

  if (process.argv.includes("--check-staged")) {
    const reportPath = argumentValue("--report");
    if (!reportPath) throw new Error("--check-staged requires --report <path>");
    const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
    const result = assertStagedImportReady({
      report,
      screenshotArtifactsRoot: argumentValue("--artifacts-root") ?? path.dirname(reportPath),
    });
    console.log(`staged model import ready: ${result.entries.length} candidates`);
    return;
  }

  throw new Error(
    `Usage: node --experimental-strip-types ${path.relative(process.cwd(), path.join(SCRIPT_DIR, "modelLibraryImportWorkflow.mjs"))} `
      + "--preflight --manifest <path> [--history <path>] [--output <path>] | "
      + "--check-staged --report <path> [--artifacts-root <path>]",
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
