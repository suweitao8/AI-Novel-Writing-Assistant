import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { getVisualReviewById } from "./modelLibraryVisualReview.mjs";

const POLICY_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), "model-library-selection.json");
const policy = JSON.parse(fs.readFileSync(POLICY_PATH, "utf8"));

function assertUnique(values, label) {
  const unique = new Set(values);
  if (unique.size !== values.length) throw new Error(`${label} contains duplicate values`);
}

const newAssetIds = policy.newAssets.map((asset) => asset.id);
const allowedIds = [...policy.keepExistingIds, ...newAssetIds];
assertUnique(policy.keepExistingIds, "keepExistingIds");
assertUnique(newAssetIds, "newAssets.id");
assertUnique(allowedIds, "allowed model ids");
assertUnique(policy.removedModelIds, "removedModelIds");

const allowedCategories = new Set(policy.categoryOrder);
for (const asset of policy.newAssets) {
  if (!allowedCategories.has(asset.category)) {
    throw new Error(`new asset ${asset.id} uses unknown category ${asset.category}`);
  }
}
for (const override of Object.values(policy.catalogOverrides)) {
  if (!allowedCategories.has(override.category)) {
    throw new Error(`catalog override uses unknown category ${override.category}`);
  }
}

export const CINE57_MODEL_LIBRARY_POLICY = Object.freeze(policy);
export const CINE57_CATEGORY_ORDER = Object.freeze([...policy.categoryOrder]);
export const CINE57_REQUIRED_CATEGORIES = Object.freeze([...policy.requiredCategories]);
export const CINE57_ALLOWED_MODEL_IDS = Object.freeze(allowedIds);
export const CINE57_REMOVED_MODEL_IDS = Object.freeze([...policy.removedModelIds]);
export const CINE57_MINIMUM_MODEL_COUNT = Number(policy.minimumEntryCount);
export const CINE57_MAX_FOOD_CONTAINER_ENTRIES = Number(policy.maxFoodContainerEntries);

const FOOD_CONTAINER_PATTERN = /(?:food-shipment|food-crate|(?:^|-)box(?:-|\\d|$))/i;

export function isFoodContainerModel(entry) {
  return FOOD_CONTAINER_PATTERN.test(`${entry.id} ${entry.fileName}`);
}

export function getCatalogOverride(id) {
  const visualReview = getVisualReviewById(id);
  if (visualReview) {
    return { name: visualReview.name, category: visualReview.category };
  }
  return policy.catalogOverrides[id] ?? null;
}

export function getNewAssetById(id) {
  return policy.newAssets.find((asset) => asset.id === id) ?? null;
}

export function getNewAssetByMeshName(meshName) {
  return policy.newAssets.find((asset) => asset.meshName === meshName) ?? null;
}
