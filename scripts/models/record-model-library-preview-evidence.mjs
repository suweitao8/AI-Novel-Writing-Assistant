import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { MODEL_LIBRARY } from "../../client/src/config/modelLibrary.ts";
import { computeModelAssetSha256 } from "./modelLibraryQuality.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const MODELS_DIR = path.join(REPO_ROOT, "client/public/models/cine57");
const REVIEW_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), "model-library-visual-review.json");
const IMPORT_AUDIT_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), "model-library-import-audit.json");
const BROWSER_AUDIT_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), "model-library-preview-browser-audit.json");
const EVIDENCE_PREFIX = "model-preview-audit-";

function getAuditRecord(importAuditByTexture, textureUrl) {
  if (importAuditByTexture instanceof Map) return importAuditByTexture.get(textureUrl);
  return importAuditByTexture?.[textureUrl];
}

export function getPreviewTextureStatus(entry, importAuditByTexture) {
  const materials = entry?.materials && typeof entry.materials === "object" ? Object.values(entry.materials) : [];
  return materials.some((material) => {
    const baseColor = material?.baseColor;
    return typeof baseColor === "string" && getAuditRecord(importAuditByTexture, baseColor)?.preserveAlpha === true;
  })
    ? "alpha-preserved"
    : "opaque";
}

function getEvidenceDate(browserAudit) {
  const auditedAt = typeof browserAudit?.auditedAt === "string" ? browserAudit.auditedAt : "";
  const date = auditedAt.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Browser preview audit must declare an ISO audit date");
  return date;
}

function assertBrowserPreviewAudit(library, browserAudit) {
  if (browserAudit?.version !== 1 || !Array.isArray(browserAudit.entries)) {
    throw new Error("Browser preview audit must use version 1 with an entries array");
  }
  const staticEntries = library.filter((entry) => entry?.fileUrl?.startsWith("/models/"));
  const auditByHref = new Map(browserAudit.entries.map((entry) => [entry?.href, entry]));
  if (auditByHref.size !== staticEntries.length) {
    throw new Error(
      "Browser preview audit covers " + auditByHref.size + " routes; expected " + staticEntries.length,
    );
  }
  for (const entry of staticEntries) {
    const href = "/models/" + entry.id;
    const audit = auditByHref.get(href);
    if (!audit?.ready || !audit.screenshotCaptured) {
      throw new Error("Browser preview audit is not ready for " + entry.id);
    }
  }
  return auditByHref;
}

export function buildPreviewReviews({
  library,
  reviewDocument,
  browserAudit,
  assetSha256ById,
  importAuditByTexture,
}) {
  const staticEntries = (Array.isArray(library) ? library : []).filter((entry) => entry?.fileUrl?.startsWith("/models/"));
  const auditByHref = assertBrowserPreviewAudit(staticEntries, browserAudit);
  const reviewEntries = Array.isArray(reviewDocument?.entries) ? reviewDocument.entries : [];
  const reviewById = new Map(reviewEntries.map((entry) => [entry?.id, entry]));
  const evidenceDate = getEvidenceDate(browserAudit);

  const entries = staticEntries.map((entry) => {
    const review = reviewById.get(entry.id);
    if (!review) throw new Error("Visual review is missing for " + entry.id);
    const audit = auditByHref.get("/models/" + entry.id);
    const assetSha256 = assetSha256ById?.get(entry.id);
    if (!/^[a-f0-9]{64}$/i.test(assetSha256 ?? "")) {
      throw new Error("Published asset hash is missing for " + entry.id);
    }
    return {
      ...review,
      visualDescription: String(review.visualDescription ?? "").replaceAll("标准缩略图中可见", "详情预览中可见"),
      reviewEvidence: EVIDENCE_PREFIX + evidenceDate,
      preview: {
        previewPath: "/models/" + entry.id,
        assetSha256,
        renderer: "model-detail-v1",
        renderedAt: browserAudit.auditedAt,
        textureStatus: getPreviewTextureStatus(entry, importAuditByTexture),
        browserAudit: "model-library-preview-browser-audit.json",
        screenshotCaptured: Boolean(audit.screenshotCaptured),
      },
    };
  });

  return {
    ...reviewDocument,
    source: "Cine57 detail-page 3D previews",
    reviewedAt: evidenceDate,
    entries,
  };
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function main() {
  const library = MODEL_LIBRARY.filter((entry) => entry.fileUrl.startsWith("/models/"));
  const reviewDocument = readJson(REVIEW_PATH);
  const browserAudit = readJson(BROWSER_AUDIT_PATH);
  const importAuditDocument = readJson(IMPORT_AUDIT_PATH);
  if (importAuditDocument?.version !== 1 || !importAuditDocument.textures) {
    throw new Error("Invalid model import audit: " + IMPORT_AUDIT_PATH);
  }

  const assetSha256ById = new Map();
  for (const entry of library) {
    const filePath = path.join(MODELS_DIR, entry.fileName);
    if (!fs.existsSync(filePath)) throw new Error("Published model is missing: " + entry.fileName);
    assetSha256ById.set(entry.id, computeModelAssetSha256(entry, filePath, MODELS_DIR));
  }

  const nextReviewDocument = buildPreviewReviews({
    library,
    reviewDocument,
    browserAudit,
    assetSha256ById,
    importAuditByTexture: importAuditDocument.textures,
  });
  fs.writeFileSync(REVIEW_PATH, JSON.stringify(nextReviewDocument, null, 1) + "\n", "utf8");
  console.log("recorded detail preview evidence: " + nextReviewDocument.entries.length + " entries");
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === path.resolve(fileURLToPath(import.meta.url))) main();
