import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "../..");
const DEFAULT_AUDIT_PATH = path.join(SCRIPT_DIR, "model-library-preview-browser-audit.json");
const DEFAULT_REVIEW_PATH = path.join(SCRIPT_DIR, "model-library-visual-review.json");
const MODEL_LIBRARY_PATH = path.join(REPO_ROOT, "client/src/config/modelLibrary.ts");

export const MODEL_LIBRARY_PREVIEW_AUDIT_PATH = DEFAULT_AUDIT_PATH;
export const MODEL_LIBRARY_PREVIEW_AUDIT_SOURCE = "built-in-browser-iab";
export const MODEL_LIBRARY_PREVIEW_RENDERER = "model-detail-v1";
const APPROVED_TEXTURE_STATUSES = new Set(["alpha-preserved", "opaque-verified"]);
const SCREENSHOT_PATH_PATTERN = /^artifacts[\\/]model-preview-audit[\\/][^\\/]+\.(?:png|jpe?g)$/i;

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isSha256(value) {
  return /^[a-f0-9]{64}$/i.test(String(value ?? ""));
}

function getExpectedHash(assetSha256ById, id) {
  if (assetSha256ById instanceof Map) return assetSha256ById.get(id);
  return assetSha256ById?.[id];
}

function validateDate(value, label, errors) {
  if (!isNonEmptyString(value) || Number.isNaN(Date.parse(value))) {
    errors.push(`${label} must be an ISO timestamp`);
  }
}

function validateScreenshotArtifact(entry, screenshotArtifactsRoot, errors) {
  if (!screenshotArtifactsRoot) return;
  const id = entry?.id ?? "<missing id>";
  const relativePath = String(entry?.screenshotPath ?? "").replaceAll("\\", "/");
  const root = path.resolve(screenshotArtifactsRoot);
  const filePath = path.resolve(root, relativePath);
  if (filePath !== root && !filePath.startsWith(`${root}${path.sep}`)) {
    errors.push(`${id} screenshot evidence path is outside the staged artifact root`);
    return;
  }
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    errors.push(`${id} screenshot artifact is missing: ${relativePath}`);
    return;
  }
  const actualHash = createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
  if (actualHash !== entry.screenshotSha256) {
    errors.push(`${id} screenshot artifact hash does not match screenshotSha256`);
  }
}

/** Validate one browser-produced detail-page preview record. */
export function validatePreviewAuditEntry(entry, { expectedAssetSha256, screenshotArtifactsRoot } = {}) {
  const errors = [];
  if (!entry || typeof entry !== "object") return ["preview audit entry is not an object"];
  const id = isNonEmptyString(entry.id) ? entry.id : "<missing id>";
  if (!isNonEmptyString(entry.id)) errors.push("preview audit id is missing");
  if (entry.route !== `/models/${entry.id}`) errors.push(`${id} preview route must be /models/<id>`);
  if (!isNonEmptyString(entry.screenshotPath) || !SCREENSHOT_PATH_PATTERN.test(entry.screenshotPath)) {
    errors.push(`${id} screenshot evidence path is missing or synthetic`);
  }
  if (!isSha256(entry.screenshotSha256)) errors.push(`${id} screenshot hash must be a SHA-256 digest`);
  if (!isSha256(entry.assetSha256)) errors.push(`${id} preview asset hash must be a SHA-256 digest`);
  if (isSha256(expectedAssetSha256) && entry.assetSha256 !== expectedAssetSha256) {
    errors.push(`${id} preview asset hash does not match the current published asset`);
  }
  if (entry.renderer !== MODEL_LIBRARY_PREVIEW_RENDERER) {
    errors.push(`${id} preview renderer must be ${MODEL_LIBRARY_PREVIEW_RENDERER}`);
  }
  validateDate(entry.renderedAt, `${id} renderedAt`, errors);
  if (!entry.canvas || typeof entry.canvas !== "object") {
    errors.push(`${id} preview canvas evidence is missing`);
  } else {
    for (const dimension of ["width", "height"]) {
      if (!Number.isInteger(entry.canvas[dimension]) || entry.canvas[dimension] <= 0) {
        errors.push(`${id} preview canvas ${dimension} must be positive`);
      }
    }
  }
  if (entry.geometryReady !== true) errors.push(`${id} preview geometry is not ready`);
  if (entry.screenshotCaptured !== true) errors.push(`${id} screenshot was not captured`);
  if (!entry.screenshotDimensions || typeof entry.screenshotDimensions !== "object") {
    errors.push(`${id} screenshot dimensions are missing`);
  } else {
    for (const dimension of ["width", "height"]) {
      if (!Number.isInteger(entry.screenshotDimensions[dimension]) || entry.screenshotDimensions[dimension] <= 0) {
        errors.push(`${id} screenshot ${dimension} must be positive`);
      }
    }
    if (entry.screenshotDimensions.width !== entry.screenshotDimensions.height) {
      errors.push(`${id} screenshot must be square`);
    }
  }
  if (!APPROVED_TEXTURE_STATUSES.has(entry.textureStatus)) {
    errors.push(`${id} preview texture status is not verified: ${entry.textureStatus}`);
  }
  if (!Array.isArray(entry.consoleErrors)) errors.push(`${id} preview consoleErrors must be an array`);
  else if (entry.consoleErrors.length > 0) errors.push(`${id} preview has console errors`);
  if (!Array.isArray(entry.failedRequests)) errors.push(`${id} preview failedRequests must be an array`);
  else if (entry.failedRequests.length > 0) errors.push(`${id} preview has failed resource requests`);
  if (entry.reviewStatus !== "approved") errors.push(`${id} preview review is not approved: ${entry.reviewStatus}`);
  validateScreenshotArtifact(entry, screenshotArtifactsRoot, errors);
  return errors;
}

function publishedStaticEntries(library) {
  return Array.isArray(library)
    ? library.filter((entry) => typeof entry?.fileUrl === "string" && entry.fileUrl.startsWith("/models/cine57/"))
    : [];
}

/** Validate browser evidence coverage and current asset hashes for a catalog. */
export function validatePreviewAuditDocument({
  auditDocument,
  library,
  assetSha256ById,
  screenshotArtifactsRoot,
} = {}) {
  const errors = [];
  if (!auditDocument || typeof auditDocument !== "object") return ["model library preview audit document is missing"];
  if (auditDocument.version !== 1) errors.push(`model library preview audit version is unsupported: ${auditDocument.version}`);
  if (auditDocument.source !== MODEL_LIBRARY_PREVIEW_AUDIT_SOURCE) {
    errors.push(`model library preview audit source must be ${MODEL_LIBRARY_PREVIEW_AUDIT_SOURCE}`);
  }
  validateDate(auditDocument.auditedAt, "model library preview audit auditedAt", errors);
  if (!Array.isArray(auditDocument.entries)) return [...errors, "model library preview audit entries must be an array"];

  const byId = new Map();
  for (const entry of auditDocument.entries) {
    const id = entry?.id ?? "<missing id>";
    if (byId.has(id)) errors.push(`duplicate model preview audit id: ${id}`);
    byId.set(id, entry);
    errors.push(...validatePreviewAuditEntry(entry, {
      expectedAssetSha256: getExpectedHash(assetSha256ById, id),
      screenshotArtifactsRoot,
    }));
  }

  if (Array.isArray(library)) {
    const publishedEntries = publishedStaticEntries(library);
    for (const entry of publishedEntries) {
      if (!byId.has(entry.id)) errors.push(`${entry.id} is missing a browser preview audit`);
    }
    const publishedIds = new Set(publishedEntries.map((entry) => entry.id));
    for (const id of byId.keys()) {
      if (!publishedIds.has(id)) errors.push(`preview audit id is not in published catalog: ${id}`);
    }
  }
  return errors;
}

/** Merge approved browser records into the generated semantic review document. */
export function mergePreviewAuditIntoVisualReviews({ reviewDocument, auditDocument, assetSha256ById } = {}) {
  const errors = validatePreviewAuditDocument({ auditDocument, assetSha256ById });
  if (errors.length > 0) throw new Error(`Cannot merge model preview audit:\n${errors.map((error) => `- ${error}`).join("\n")}`);
  if (!reviewDocument || typeof reviewDocument !== "object" || !Array.isArray(reviewDocument.entries)) {
    throw new Error("Visual review document must contain an entries array");
  }

  const auditById = new Map(auditDocument.entries.map((entry) => [entry.id, entry]));
  const reviewedAt = new Date(auditDocument.auditedAt).toISOString().slice(0, 10);
  const entries = reviewDocument.entries.map((review) => {
    const audit = auditById.get(review.id);
    if (!audit) throw new Error(`Visual review is missing browser preview audit: ${review.id}`);
    const description = String(review.visualDescription ?? "")
      .replaceAll("标准缩略图中", "模型详情页预览中")
      .replaceAll("标准三维预览中", "模型详情页预览中");
    return {
      ...review,
      visualDescription: description,
      reviewStatus: "approved",
      reviewEvidence: `model-preview-audit-${reviewedAt}`,
      preview: {
        ...(review.preview ?? {}),
        previewPath: audit.route,
        assetSha256: audit.assetSha256,
        renderer: audit.renderer,
        renderedAt: audit.renderedAt,
        textureStatus: audit.textureStatus,
        screenshotPath: audit.screenshotPath,
        screenshotSha256: audit.screenshotSha256,
        screenshotDimensions: audit.screenshotDimensions,
      },
    };
  });
  return {
    ...reviewDocument,
    reviewedAt,
    entries,
  };
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

async function mergeReviewFromDisk(auditPath) {
  const [{ MODEL_LIBRARY }, { computeModelAssetSha256 }] = await Promise.all([
    import(`${pathToFileURL(MODEL_LIBRARY_PATH).href}?preview-audit=${Date.now()}`),
    import(`./modelLibraryQuality.mjs?preview-audit=${Date.now()}`),
  ]);
  const modelsDir = path.join(REPO_ROOT, "client/public/models/cine57");
  const assetSha256ById = new Map();
  for (const entry of MODEL_LIBRARY.filter((candidate) => candidate.fileUrl.startsWith("/models/cine57/"))) {
    assetSha256ById.set(entry.id, computeModelAssetSha256(entry, path.join(modelsDir, entry.fileName), modelsDir));
  }
  const auditDocument = readJson(auditPath);
  const errors = validatePreviewAuditDocument({ auditDocument, library: MODEL_LIBRARY, assetSha256ById });
  if (errors.length > 0) throw new Error(`Model preview audit failed:\n${errors.map((error) => `- ${error}`).join("\n")}`);
  const reviewDocument = readJson(DEFAULT_REVIEW_PATH);
  const merged = mergePreviewAuditIntoVisualReviews({ reviewDocument, auditDocument, assetSha256ById });
  fs.writeFileSync(DEFAULT_REVIEW_PATH, `${JSON.stringify(merged, null, 2)}\n`, "utf8");
  console.log(`merged browser preview audit into ${merged.entries.length} visual reviews`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const auditPath = process.argv.includes("--audit")
    ? process.argv[process.argv.indexOf("--audit") + 1]
    : DEFAULT_AUDIT_PATH;
  if (!process.argv.includes("--merge-review")) {
    console.error("Usage: node --experimental-strip-types scripts/models/model-library-preview-audit.mjs --merge-review [--audit <path>]");
    process.exitCode = 1;
  } else {
    mergeReviewFromDisk(auditPath).catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
  }
}
