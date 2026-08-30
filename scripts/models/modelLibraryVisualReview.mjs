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

/**
 * Validate the screenshot-backed semantic layer against a generated catalog.
 * `meshNamesById` is optional so this validator remains pure and reusable in unit tests;
 * the model-library quality gate supplies the names read from each GLB.
 */
export function validateModelVisualReview({ library = [], reviews = MODEL_VISUAL_REVIEWS, meshNamesById } = {}) {
  const errors = [];
  // 角色预览条目复用动画库 GLB，并由专用外观控制器负责语义；本门禁只覆盖
  // Cine57 静态道具，避免把动画资源误当成静态模型审核。
  const entries = Array.isArray(library) ? library.filter((entry) => !entry?.previewAppearance) : [];
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
