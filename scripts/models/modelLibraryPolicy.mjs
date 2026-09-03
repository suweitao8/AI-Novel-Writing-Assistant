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
const foregroundAdmission = policy.foregroundAdmission ?? {};
const foregroundRejectedAssets = Array.isArray(foregroundAdmission.rejectedAssets)
  ? foregroundAdmission.rejectedAssets
  : [];
const foregroundRejectedIds = new Set(foregroundRejectedAssets.map((asset) => asset.id));
const allowedIds = [
  ...policy.keepExistingIds.filter((id) => !foregroundRejectedIds.has(id)),
  ...newAssetIds.filter((id) => !foregroundRejectedIds.has(id)),
];
const quarantinedAssets = Array.isArray(policy.quarantinedAssets) ? policy.quarantinedAssets : [];
const quarantinedIds = quarantinedAssets.map((asset) => asset.id);
const quarantinedFileNames = quarantinedAssets.map((asset) => asset.fileName);
assertUnique(policy.keepExistingIds, "keepExistingIds");
assertUnique(newAssetIds, "newAssets.id");
assertUnique(allowedIds, "allowed model ids");
assertUnique(policy.removedModelIds, "removedModelIds");
assertUnique(quarantinedIds, "quarantinedAssets.id");
assertUnique(quarantinedFileNames, "quarantinedAssets.fileName");
assertUnique(foregroundRejectedAssets.map((asset) => asset.id), "foregroundAdmission.rejectedAssets.id");
assertUnique(foregroundRejectedAssets.map((asset) => asset.meshName), "foregroundAdmission.rejectedAssets.meshName");
assertUnique(foregroundRejectedAssets.map((asset) => asset.fileName), "foregroundAdmission.rejectedAssets.fileName");

const candidateIds = new Set([...policy.keepExistingIds, ...newAssetIds]);
for (const asset of foregroundRejectedAssets) {
  if (!asset || typeof asset !== "object") throw new Error("foreground rejected asset must be an object");
  if (
    typeof asset.id !== "string"
    || typeof asset.meshName !== "string"
    || typeof asset.fileName !== "string"
  ) {
    throw new Error("foreground rejected assets must declare id, meshName and fileName");
  }
  if (!candidateIds.has(asset.id)) throw new Error(`foreground rejected asset is unknown: ${asset.id}`);
  if (!newAssetIds.includes(asset.id) && !policy.keepExistingIds.includes(asset.id)) {
    throw new Error(`foreground rejected asset is not a known candidate: ${asset.id}`);
  }
  if (typeof asset.reasonCode !== "string" || asset.reasonCode.trim().length === 0) {
    throw new Error(`foreground rejected asset ${asset.id} must declare a reasonCode`);
  }
  if (typeof asset.failureStage !== "string" || asset.failureStage.trim().length === 0) {
    throw new Error(`foreground rejected asset ${asset.id} must declare a failureStage`);
  }
  if (typeof asset.reason !== "string" || asset.reason.trim().length === 0) {
    throw new Error(`foreground rejected asset ${asset.id} must declare a reason`);
  }
  if (typeof asset.evidence !== "string" || asset.evidence.trim().length === 0) {
    throw new Error(`foreground rejected asset ${asset.id} must declare evidence`);
  }
  if (allowedIds.includes(asset.id)) throw new Error(`foreground rejected asset is still publishable: ${asset.id}`);
}

const minimumDimensionMeters = Number(foregroundAdmission.minimumDimensionMeters);
const maximumDimensionMeters = Number(foregroundAdmission.maximumDimensionMeters);
if (!Number.isFinite(minimumDimensionMeters) || minimumDimensionMeters <= 0) {
  throw new Error("foreground admission minimum dimension must be positive");
}
if (!Number.isFinite(maximumDimensionMeters) || maximumDimensionMeters <= minimumDimensionMeters) {
  throw new Error("foreground admission maximum dimension must exceed minimum dimension");
}

for (const asset of quarantinedAssets) {
  if (typeof asset.id !== "string" || typeof asset.fileName !== "string") {
    throw new Error("quarantinedAssets entries must declare id and fileName");
  }
  if (allowedIds.includes(asset.id)) {
    throw new Error(`quarantined asset is still in the published allowlist: ${asset.id}`);
  }
  if (policy.removedModelIds.includes(asset.id)) {
    throw new Error(`quarantined asset cannot also be a removed model: ${asset.id}`);
  }
  if (typeof asset.reason !== "string" || asset.reason.trim().length === 0) {
    throw new Error(`quarantined asset ${asset.id} must declare a reason`);
  }
  if (typeof asset.evidence !== "string" || asset.evidence.trim().length === 0) {
    throw new Error(`quarantined asset ${asset.id} must declare evidence`);
  }
}

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
export function assertCine57ModelLibraryContract(contract) {
  if (
    !contract
    || typeof contract !== "object"
    || contract.source !== "Cine57"
    || contract.artDirection !== "realistic"
    || contract.era !== "modern"
    || contract.visualReviewRequired !== true
  ) {
    throw new Error("model library contract must explicitly declare Cine57 modern realistic visual review contract");
  }
  return {
    source: contract.source,
    artDirection: contract.artDirection,
    era: contract.era,
    visualReviewRequired: contract.visualReviewRequired,
  };
}
export const CINE57_MODEL_LIBRARY_CONTRACT = Object.freeze(
  assertCine57ModelLibraryContract(policy.libraryContract),
);
export const CINE57_CATEGORY_ORDER = Object.freeze([...policy.categoryOrder]);
export const CINE57_REQUIRED_CATEGORIES = Object.freeze([...policy.requiredCategories]);
export const CINE57_ALLOWED_MODEL_IDS = Object.freeze(allowedIds);
export const CINE57_REMOVED_MODEL_IDS = Object.freeze([...policy.removedModelIds]);
export const CINE57_QUARANTINED_ASSETS = Object.freeze(
  quarantinedAssets.map((asset) => Object.freeze({ ...asset })),
);
export const CINE57_QUARANTINED_MODEL_IDS = Object.freeze([...quarantinedIds]);
export const CINE57_QUARANTINED_MODEL_FILE_NAMES = Object.freeze([...quarantinedFileNames]);
export const CINE57_FOREGROUND_ADMISSION = Object.freeze({
  minimumDimensionMeters,
  maximumDimensionMeters,
  rejectedAssets: Object.freeze(foregroundRejectedAssets.map((asset) => Object.freeze({ ...asset }))),
});
export const CINE57_REJECTED_FOREGROUND_MODEL_IDS = Object.freeze(
  foregroundRejectedAssets.map((asset) => asset.id),
);
export const CINE57_REJECTED_FOREGROUND_MODEL_FILE_NAMES = Object.freeze(
  foregroundRejectedAssets.map((asset) => asset.fileName),
);
export const CINE57_MINIMUM_MODEL_COUNT = Number(policy.minimumEntryCount);
export const CINE57_MAX_FOOD_CONTAINER_ENTRIES = Number(policy.maxFoodContainerEntries);
export const CINE57_MINIMUM_NEW_ASSET_COUNT = Number(policy.modernExpansion?.minimumNewAssetCount ?? 0);
export const CINE57_MAXIMUM_NEW_ASSET_COUNT = Number(policy.modernExpansion?.maximumNewAssetCount ?? Number.POSITIVE_INFINITY);
export const CINE57_MINIMUM_NEW_ASSETS_BY_CATEGORY = Object.freeze({
  ...(policy.modernExpansion?.minimumNewAssetsByCategory ?? {}),
});

const rejectedExpansionMeshPatterns = Object.freeze(
  (policy.modernExpansion?.rejectedMeshNamePatterns ?? []).map((pattern) => new RegExp(pattern, "i")),
);

export function isRejectedExpansionMeshName(meshName) {
  return rejectedExpansionMeshPatterns.some((pattern) => pattern.test(String(meshName ?? "")));
}

export function getForegroundAdmissionDisposition({ id, meshName } = {}) {
  return foregroundRejectedAssets.find((asset) => (
    (id && asset.id === id) || (meshName && asset.meshName === meshName)
  )) ?? null;
}

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

export function getCatalogMaterialOverride(id) {
  return policy.materialOverrides?.[id] ?? null;
}

export function getNewAssetById(id) {
  return policy.newAssets.find((asset) => asset.id === id) ?? null;
}

export function getNewAssetByMeshName(meshName) {
  return policy.newAssets.find((asset) => asset.meshName === meshName) ?? null;
}
