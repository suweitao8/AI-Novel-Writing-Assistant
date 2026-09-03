import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REVIEW_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), "model-library-visual-review.json");
const reviewDocument = JSON.parse(fs.readFileSync(REVIEW_PATH, "utf8"));

export const MODEL_VISUAL_REVIEW_VERSION = Number(reviewDocument.version ?? 0);
export const MODEL_VISUAL_REVIEWS = Object.freeze(
  (Array.isArray(reviewDocument.entries) ? reviewDocument.entries : []).map((entry) => Object.freeze({ ...entry })),
);

const REQUIRED_FIELDS = Object.freeze([
  "id",
  "meshName",
  "fileName",
  "name",
  "category",
  "visualDescription",
  "reviewStatus",
  "reviewEvidence",
]);
const PREVIEW_REQUIRED_EVIDENCE_PREFIX = "model-preview-audit-";
const PREVIEW_FIELDS = Object.freeze([
  "previewPath",
  "assetSha256",
  "renderer",
  "renderedAt",
  "textureStatus",
]);
const PREVIEW_BROWSER_AUDIT_FILE = "model-library-preview-browser-audit.json";

export function getVisualReviewById(id) {
  return MODEL_VISUAL_REVIEWS.find((entry) => entry.id === id) ?? null;
}

export function getVisualReviewByMeshName(meshName) {
  return MODEL_VISUAL_REVIEWS.find((entry) => entry.meshName === meshName) ?? null;
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function hasMeshName(meshNames, expected) {
  if (meshNames instanceof Set) return meshNames.has(expected);
  if (Array.isArray(meshNames)) return meshNames.includes(expected);
  return true;
}

function validatePreviewEvidence(review, errors, assetSha256ById, browserPreviewAuditById) {
  const preview = review.preview;
  const evidence = typeof review.reviewEvidence === "string" ? review.reviewEvidence : "";
  if (!evidence.startsWith(PREVIEW_REQUIRED_EVIDENCE_PREFIX)) {
    errors.push(`${review.id} visual review must use actual 3D preview evidence`);
  }
  if (!preview || typeof preview !== "object") {
    errors.push(`${review.id} visual review is missing actual 3D preview evidence`);
    return;
  }
  if (preview.browserAudit !== PREVIEW_BROWSER_AUDIT_FILE) {
    errors.push(review.id + " preview must reference the browser audit manifest");
  }
  if (preview.screenshotCaptured !== true) {
    errors.push(review.id + " preview must declare a captured detail screenshot");
  }
  for (const field of PREVIEW_FIELDS) {
    if (!isNonEmptyString(preview[field])) errors.push(`${review.id} preview field is missing: ${field}`);
  }
  if (preview.previewPath !== `/models/${review.id}`) {
    errors.push(`${review.id} previewPath must point to its model detail route`);
  }
  if (!/^[a-f0-9]{64}$/i.test(preview.assetSha256 ?? "")) {
    errors.push(`${review.id} preview assetSha256 must be a SHA-256 digest`);
  }
  const actualHash = assetSha256ById?.get(review.id);
  if (browserPreviewAuditById) {
    const browserPreview = browserPreviewAuditById.get(review.id);
    if (!browserPreview?.ready || browserPreview.screenshotCaptured !== true) {
      errors.push(review.id + " visual review has no completed browser preview audit");
    }
  }
  if (actualHash && preview.assetSha256 !== actualHash) {
    errors.push(`${review.id} preview assetSha256 does not match the published GLB and textures`);
  }
}

/**
 * Validate the screenshot-backed semantic layer against a generated catalog.
 * `meshNamesById` is optional so this validator remains pure and reusable in unit tests;
 * the model-library quality gate supplies the names read from each GLB.
 */
export function validateModelVisualReview({
  library = [],
  reviews = MODEL_VISUAL_REVIEWS,
  meshNamesById,
  assetSha256ById,
  browserPreviewAuditById,
} = {}) {
  const errors = [];
  // 视觉复核覆盖模型库的所有静态前景资产，避免把动画资源误当成
  // 静态模型审核；任何非 Cine57 静态条目会由模型库质量门禁拒绝。
  const entries = Array.isArray(library)
    ? library.filter((entry) => typeof entry?.fileUrl === "string" && entry.fileUrl.startsWith("/models/"))
    : [];
  const reviewEntries = Array.isArray(reviews) ? reviews : [];
  const catalogById = new Map(entries.map((entry) => [entry.id, entry]));
  const reviewById = new Map();

  for (const review of reviewEntries) {
    const label = review?.id ?? "<missing id>";
    if (!review || typeof review !== "object") {
      errors.push("visual review entry is not an object");
      continue;
    }
    for (const field of REQUIRED_FIELDS) {
      if (!isNonEmptyString(review[field])) errors.push(`${label} visual review field is missing: ${field}`);
    }
    if (reviewById.has(review.id)) errors.push(`duplicate visual review id: ${review.id}`);
    reviewById.set(review.id, review);
    if (review.reviewStatus !== "approved") {
      errors.push(`${label} visual review is not approved: ${review.reviewStatus}`);
    }
    if (!catalogById.has(review.id)) errors.push(`visual review id is not in catalog: ${review.id}`);
    validatePreviewEvidence(review, errors, assetSha256ById, browserPreviewAuditById);
  }

  for (const entry of entries) {
    const review = reviewById.get(entry.id);
    if (!review) {
      errors.push(`${entry.id} is missing an approved visual review`);
      continue;
    }
    for (const field of ["fileName", "name", "category"]) {
      if (review[field] !== entry[field]) {
        errors.push(`${entry.id} visual review ${field} does not match catalog`);
      }
    }
    const meshNames = meshNamesById?.get(entry.id);
    if (meshNames !== undefined && !hasMeshName(meshNames, review.meshName)) {
      errors.push(`${entry.id} visual review meshName does not match GLB: ${review.meshName}`);
    }
  }

  return errors;
}

export const MODEL_VISUAL_REVIEW_SOURCE = reviewDocument.source ?? "";
export const MODEL_VISUAL_REVIEW_DATE = reviewDocument.reviewedAt ?? "";
