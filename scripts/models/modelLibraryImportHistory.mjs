import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
export const MODEL_LIBRARY_IMPORT_HISTORY_PATH = path.join(SCRIPT_DIR, "model-library-import-history.json");
export const MODEL_LIBRARY_IMPORT_HISTORY_VERSION = 1;
export const MODEL_LIBRARY_IMPORT_HISTORY_SOURCE = "Cine57";
export const IMPORT_HISTORY_RECHECK_POLICY = "source-change-or-manual-reopen";

const ALLOWED_STATUSES = new Set(["approved", "rejected", "skipped"]);
const ALLOWED_FAILURE_STAGES = new Set([
  "semantic",
  "geometry",
  "texture",
  "conversion",
  "preview",
  "publication",
]);
const VOLATILE_SOURCE_KEYS = new Set([
  "generatedAt",
  "importedAt",
  "reviewedAt",
  "previewedAt",
  "runId",
  "status",
  "decision",
  "sourceFingerprint",
  "history",
]);

function normalizeSlashes(value) {
  return String(value ?? "")
    .trim()
    .replaceAll("\\", "/")
    .replace(/\/{2,}/g, "/");
}

export function normalizeImportPackagePath(packagePath) {
  const normalized = normalizeSlashes(packagePath);
  if (!normalized) throw new Error("import history package path is required");
  return normalized.startsWith("/") ? normalized : `/${normalized}`;
}

function meshNameFromPackage(packagePath) {
  return path.posix.basename(normalizeImportPackagePath(packagePath));
}

function resolveAssetFields({ row, packagePath, meshName } = {}) {
  const resolvedPackagePath = normalizeImportPackagePath(
    packagePath ?? row?.packagePath ?? row?.package,
  );
  const resolvedMeshName = String(meshName ?? row?.meshName ?? meshNameFromPackage(resolvedPackagePath)).trim();
  if (!resolvedMeshName) throw new Error("import history mesh name is required");
  return { packagePath: resolvedPackagePath, meshName: resolvedMeshName };
}

export function buildImportAssetKey({ row, packagePath, meshName } = {}) {
  const fields = resolveAssetFields({ row, packagePath, meshName });
  return `${fields.packagePath}#${fields.meshName}`;
}

function canonicalize(value, key = "") {
  if (Array.isArray(value)) return value.map((item) => canonicalize(item));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .filter((field) => field !== key && !VOLATILE_SOURCE_KEYS.has(field))
      .sort()
      .map((field) => [field, canonicalize(value[field], field)]),
  );
}

/** Build a stable hash from source-manifest fields, ignoring run metadata. */
export function buildImportSourceFingerprint(row = {}) {
  const canonical = JSON.stringify(canonicalize(row));
  return createHash("sha256").update(canonical).digest("hex");
}

function isSha256(value) {
  return /^[a-f0-9]{64}$/i.test(String(value ?? ""));
}

function isIsoDate(value) {
  return typeof value === "string" && value.trim().length > 0 && !Number.isNaN(Date.parse(value));
}

function hasEvidence(value) {
  if (typeof value === "string") return value.trim().length > 0;
  return value !== null && value !== undefined;
}

function validateEvent(event, label, errors) {
  if (!event || typeof event !== "object") {
    errors.push(`${label} must be an object`);
    return;
  }
  if (!ALLOWED_STATUSES.has(event.status)) errors.push(`${label} status is invalid: ${event.status}`);
  if (event.failureStage !== null && event.failureStage !== undefined && !ALLOWED_FAILURE_STAGES.has(event.failureStage)) {
    errors.push(`${label} failureStage is invalid: ${event.failureStage}`);
  }
  if (!isSha256(event.sourceFingerprint)) errors.push(`${label} sourceFingerprint must be a SHA-256 digest`);
  if (!isIsoDate(event.reviewedAt)) errors.push(`${label} reviewedAt must be an ISO timestamp`);
  if (!hasEvidence(event.summary)) errors.push(`${label} summary is missing`);
}

/** Validate the committed model import history without changing it. */
export function validateImportHistoryDocument(history) {
  const errors = [];
  if (!history || typeof history !== "object" || Array.isArray(history)) {
    return ["model library import history document must be an object"];
  }
  if (history.version !== MODEL_LIBRARY_IMPORT_HISTORY_VERSION) {
    errors.push(`model library import history version is unsupported: ${history.version}`);
  }
  if (history.source !== MODEL_LIBRARY_IMPORT_HISTORY_SOURCE) {
    errors.push(`model library import history source must be ${MODEL_LIBRARY_IMPORT_HISTORY_SOURCE}`);
  }
  if (!Array.isArray(history.entries)) return [...errors, "model library import history entries must be an array"];

  const keys = new Set();
  for (const [index, entry] of history.entries.entries()) {
    const label = entry?.assetKey ?? `history entry ${index + 1}`;
    if (!entry || typeof entry !== "object") {
      errors.push(`${label} must be an object`);
      continue;
    }
    if (keys.has(entry.assetKey)) errors.push(`duplicate import history assetKey: ${entry.assetKey}`);
    keys.add(entry.assetKey);
    if (!/^\/.+#[^#]+$/.test(String(entry.assetKey ?? ""))) errors.push(`${label} assetKey is invalid`);
    if (!String(entry.packagePath ?? "").startsWith("/")) errors.push(`${label} packagePath is invalid`);
    if (typeof entry.meshName !== "string" || entry.meshName.trim().length === 0) errors.push(`${label} meshName is missing`);
    if (buildImportAssetKey({ packagePath: entry.packagePath, meshName: entry.meshName }) !== entry.assetKey) {
      errors.push(`${label} assetKey does not match packagePath and meshName`);
    }
    if (!ALLOWED_STATUSES.has(entry.status)) errors.push(`${label} status is invalid: ${entry.status}`);
    if (!isSha256(entry.sourceFingerprint)) errors.push(`${label} sourceFingerprint must be a SHA-256 digest`);
    if (!isIsoDate(entry.reviewedAt)) errors.push(`${label} reviewedAt must be an ISO timestamp`);
    if (!hasEvidence(entry.summary)) errors.push(`${label} summary is missing`);
    if (entry.status === "rejected" && (!ALLOWED_FAILURE_STAGES.has(entry.failureStage) || !entry.reasonCode)) {
      errors.push(`${label} rejected entry must declare failureStage and reasonCode`);
    }
    if (typeof entry.skipUntilSourceChange !== "boolean") {
      errors.push(`${label} skipUntilSourceChange must be boolean`);
    }
    if (!Array.isArray(entry.events) || entry.events.length === 0) {
      errors.push(`${label} events must contain at least one event`);
    } else {
      entry.events.forEach((event, eventIndex) => validateEvent(event, `${label} event ${eventIndex + 1}`, errors));
    }
  }
  return errors;
}

export function createImportHistoryDocument({ generatedAt = new Date().toISOString(), entries = [] } = {}) {
  return {
    version: MODEL_LIBRARY_IMPORT_HISTORY_VERSION,
    source: MODEL_LIBRARY_IMPORT_HISTORY_SOURCE,
    recheckPolicy: IMPORT_HISTORY_RECHECK_POLICY,
    generatedAt,
    entries: [...entries],
  };
}

export function findImportHistoryRecord(history, assetKey) {
  if (!history || !Array.isArray(history.entries)) return null;
  return history.entries.find((entry) => entry.assetKey === assetKey) ?? null;
}

/** Append one immutable processing event while keeping the latest decision indexed by asset key. */
export function appendImportHistoryEvent({
  history,
  row,
  packagePath,
  meshName,
  sourceFingerprint,
  status,
  failureStage = null,
  reasonCode = null,
  summary,
  evidence,
  reviewedAt = new Date().toISOString(),
  skipUntilSourceChange = status === "rejected",
} = {}) {
  if (!ALLOWED_STATUSES.has(status)) throw new Error(`invalid import history status: ${status}`);
  const fields = resolveAssetFields({ row, packagePath, meshName });
  const assetKey = buildImportAssetKey(fields);
  const fingerprint = sourceFingerprint ?? buildImportSourceFingerprint(row ?? fields);
  if (!isSha256(fingerprint)) throw new Error(`invalid source fingerprint for ${assetKey}`);
  if (!isIsoDate(reviewedAt)) throw new Error(`invalid review timestamp for ${assetKey}`);
  if (!hasEvidence(summary)) throw new Error(`import history summary is required for ${assetKey}`);
  if (failureStage !== null && !ALLOWED_FAILURE_STAGES.has(failureStage)) {
    throw new Error(`invalid import history failure stage: ${failureStage}`);
  }

  const current = history && typeof history === "object"
    ? history
    : createImportHistoryDocument();
  const oldEntries = Array.isArray(current.entries) ? current.entries : [];
  const oldRecord = findImportHistoryRecord(current, assetKey);
  const event = {
    status,
    sourceFingerprint: fingerprint,
    failureStage,
    reasonCode,
    summary,
    evidence: evidence ?? null,
    reviewedAt,
  };
  const nextRecord = {
    assetKey,
    packagePath: fields.packagePath,
    meshName: fields.meshName,
    sourceFingerprint: fingerprint,
    status,
    failureStage,
    reasonCode,
    summary,
    evidence: evidence ?? null,
    reviewedAt,
    skipUntilSourceChange: Boolean(skipUntilSourceChange),
    events: [...(oldRecord?.events ?? []), event],
  };
  const entries = oldRecord
    ? oldEntries.map((entry) => (entry.assetKey === assetKey ? nextRecord : entry))
    : [...oldEntries, nextRecord];
  return {
    ...createImportHistoryDocument({
      generatedAt: current.generatedAt ?? new Date().toISOString(),
      entries,
    }),
    updatedAt: reviewedAt,
  };
}

/** Decide whether a candidate can be skipped before any conversion or preview work starts. */
export function shouldSkipImportCandidate({ row, history } = {}) {
  const fields = resolveAssetFields({ row });
  const assetKey = buildImportAssetKey(fields);
  const sourceFingerprint = buildImportSourceFingerprint(row ?? fields);
  const record = findImportHistoryRecord(history, assetKey);
  if (!record) {
    return { skip: false, reason: "unseen", assetKey, sourceFingerprint, record: null };
  }
  if (
    record.status === "rejected"
    && record.skipUntilSourceChange === true
    && record.sourceFingerprint === sourceFingerprint
  ) {
    return { skip: true, reason: "previously-rejected", assetKey, sourceFingerprint, record };
  }
  if (record.status === "rejected" && record.sourceFingerprint !== sourceFingerprint) {
    return { skip: false, reason: "source-changed", assetKey, sourceFingerprint, record };
  }
  return { skip: false, reason: "recheck-required", assetKey, sourceFingerprint, record };
}

export function readImportHistory(filePath = MODEL_LIBRARY_IMPORT_HISTORY_PATH) {
  const history = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const errors = validateImportHistoryDocument(history);
  if (errors.length > 0) throw new Error(`Invalid model import history:\n${errors.map((error) => `- ${error}`).join("\n")}`);
  return history;
}

export function writeImportHistory(history, filePath = MODEL_LIBRARY_IMPORT_HISTORY_PATH) {
  const errors = validateImportHistoryDocument(history);
  if (errors.length > 0) throw new Error(`Invalid model import history:\n${errors.map((error) => `- ${error}`).join("\n")}`);
  fs.writeFileSync(filePath, `${JSON.stringify(history, null, 2)}\n`, "utf8");
}
