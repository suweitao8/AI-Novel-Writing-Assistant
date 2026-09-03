import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { getUnsupportedNameReason, readGlb } from "./glbSanitizer.mjs";
import {
  CINE57_ALLOWED_MODEL_IDS,
  CINE57_CATEGORY_ORDER,
  CINE57_FOREGROUND_ADMISSION,
  CINE57_MODEL_LIBRARY_CONTRACT,
  CINE57_MAX_FOOD_CONTAINER_ENTRIES,
  CINE57_MINIMUM_MODEL_COUNT,
  CINE57_QUARANTINED_ASSETS,
  CINE57_QUARANTINED_MODEL_FILE_NAMES,
  CINE57_QUARANTINED_MODEL_IDS,
  CINE57_REJECTED_FOREGROUND_MODEL_FILE_NAMES,
  CINE57_REJECTED_FOREGROUND_MODEL_IDS,
  CINE57_REMOVED_MODEL_IDS,
  CINE57_REQUIRED_CATEGORIES,
  isFoodContainerModel,
} from "./modelLibraryPolicy.mjs";
import {
  MODEL_LIBRARY_IMPORT_AUDIT_PATH,
  validateModelLibraryImportAudit,
} from "./modelLibraryImportAudit.mjs";
import {
  MODEL_LIBRARY_PREVIEW_AUDIT_PATH,
  validatePreviewAuditDocument,
} from "./model-library-preview-audit.mjs";
import { listCatalogTexturePaths, validateModelTextureContract } from "./modelLibraryTextureAudit.mjs";
import { validateModelVisualReview } from "./modelLibraryVisualReview.mjs";
import { evaluateModelCandidate } from "./modelLibraryImportAdmission.mjs";
import {
  MODEL_LIBRARY_IMPORT_HISTORY_PATH,
  validateImportHistoryDocument,
} from "./modelLibraryImportHistory.mjs";

export const MIN_FOREGROUND_MODEL_DIMENSION_METERS = CINE57_FOREGROUND_ADMISSION.minimumDimensionMeters;
export const MAX_FOREGROUND_MODEL_DIMENSION_METERS = CINE57_FOREGROUND_ADMISSION.maximumDimensionMeters;
const CINE57_MODEL_URL_PREFIX = "/models/cine57/";
const MODEL_LIBRARY_VISUAL_REVIEW_PATH = path.join(
  path.dirname(MODEL_LIBRARY_IMPORT_AUDIT_PATH),
  "model-library-visual-review.json",
);

const MODEL_USAGE_SUPPORT_SURFACES = new Set([
  "ground",
  "wall",
  "ceiling",
  "horizontal-surface",
  "handheld",
  "free",
]);
const MODEL_USAGE_PLACEMENT_MODES = new Set([
  "grounded",
  "wall-mounted",
  "ceiling-hung",
  "surface-placed",
  "handheld",
  "free",
]);
const MODEL_USAGE_ANCHORS = new Set(["base", "back", "top", "support-center", "center"]);
const MODEL_USAGE_ORIENTATIONS = new Set([
  "upright",
  "horizontal",
  "wall-facing",
  "downward",
  "directional",
  "free",
]);
const MODEL_USAGE_SURFACE_BY_PLACEMENT = {
  grounded: "ground",
  "wall-mounted": "wall",
  "ceiling-hung": "ceiling",
  "surface-placed": "horizontal-surface",
  handheld: "handheld",
  free: "free",
};

const POSITION_COMPONENT_TYPE = 5126;
const IDENTITY_MATRIX = Object.freeze([
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, 0,
  0, 0, 0, 1,
]);

function multiplyMatrices(a, b) {
  const output = new Array(16).fill(0);
  for (let column = 0; column < 4; column += 1) {
    for (let row = 0; row < 4; row += 1) {
      for (let k = 0; k < 4; k += 1) {
        output[column * 4 + row] += a[k * 4 + row] * b[column * 4 + k];
      }
    }
  }
  return output;
}

function nodeLocalMatrix(node) {
  if (Array.isArray(node.matrix) && node.matrix.length === 16) return node.matrix.slice();

  const [x, y, z, w] = node.rotation ?? [0, 0, 0, 1];
  const [sx, sy, sz] = node.scale ?? [1, 1, 1];
  const [tx, ty, tz] = node.translation ?? [0, 0, 0];
  const x2 = x + x;
  const y2 = y + y;
  const z2 = z + z;
  const xx = x * x2;
  const xy = x * y2;
  const xz = x * z2;
  const yy = y * y2;
  const yz = y * z2;
  const zz = z * z2;
  const wx = w * x2;
  const wy = w * y2;
  const wz = w * z2;

  return [
    (1 - (yy + zz)) * sx, (xy + wz) * sx, (xz - wy) * sx, 0,
    (xy - wz) * sy, (1 - (xx + zz)) * sy, (yz + wx) * sy, 0,
    (xz + wy) * sz, (yz - wx) * sz, (1 - (xx + yy)) * sz, 0,
    tx, ty, tz, 1,
  ];
}

function transformPoint(matrix, point) {
  return [
    matrix[0] * point[0] + matrix[4] * point[1] + matrix[8] * point[2] + matrix[12],
    matrix[1] * point[0] + matrix[5] * point[1] + matrix[9] * point[2] + matrix[13],
    matrix[2] * point[0] + matrix[6] * point[1] + matrix[10] * point[2] + matrix[14],
  ];
}

function makeEmptyBounds() {
  return {
    min: [Infinity, Infinity, Infinity],
    max: [-Infinity, -Infinity, -Infinity],
  };
}

function includePoint(bounds, point) {
  for (let axis = 0; axis < 3; axis += 1) {
    bounds.min[axis] = Math.min(bounds.min[axis], point[axis]);
    bounds.max[axis] = Math.max(bounds.max[axis], point[axis]);
  }
}

function includeBounds(bounds, localBounds, matrix) {
  const [minX, minY, minZ] = localBounds.min;
  const [maxX, maxY, maxZ] = localBounds.max;
  for (const x of [minX, maxX]) {
    for (const y of [minY, maxY]) {
      for (const z of [minZ, maxZ]) includePoint(bounds, transformPoint(matrix, [x, y, z]));
    }
  }
}

function accessorBounds(accessorIndex, json, bin) {
  const accessor = json.accessors?.[accessorIndex];
  if (!accessor) throw new Error(`POSITION accessor ${accessorIndex} is missing`);
  if (Array.isArray(accessor.min) && Array.isArray(accessor.max)) {
    return { min: accessor.min.slice(0, 3), max: accessor.max.slice(0, 3) };
  }

  const view = json.bufferViews?.[accessor.bufferView];
  if (!view || !bin) throw new Error(`POSITION accessor ${accessorIndex} has no readable buffer view`);
  if (accessor.componentType !== POSITION_COMPONENT_TYPE || accessor.type !== "VEC3") {
    throw new Error(`POSITION accessor ${accessorIndex} must be FLOAT VEC3 when min/max are absent`);
  }
  const count = Number(accessor.count ?? 0);
  const stride = Number(view.byteStride ?? 12);
  const start = Number(view.byteOffset ?? 0) + Number(accessor.byteOffset ?? 0);
  const data = new DataView(bin.buffer, bin.byteOffset, bin.byteLength);
  const bounds = makeEmptyBounds();
  for (let index = 0; index < count; index += 1) {
    const offset = start + index * stride;
    includePoint(bounds, [
      data.getFloat32(offset, true),
      data.getFloat32(offset + 4, true),
      data.getFloat32(offset + 8, true),
    ]);
  }
  return bounds;
}

function computeWorldMatrices(nodes) {
  const matrices = new Array(nodes.length);
  const visiting = new Set();

  const visit = (index, parent) => {
    if (matrices[index]) return;
    if (visiting.has(index)) throw new Error(`GLB node cycle detected at ${index}`);
    visiting.add(index);
    matrices[index] = multiplyMatrices(parent, nodeLocalMatrix(nodes[index] ?? {}));
    for (const child of nodes[index]?.children ?? []) {
      if (Number.isInteger(child) && child >= 0 && child < nodes.length) visit(child, matrices[index]);
    }
    visiting.delete(index);
  };

  for (let index = 0; index < nodes.length; index += 1) {
    if (!matrices[index]) visit(index, IDENTITY_MATRIX);
  }
  return matrices;
}

function collectReferenceErrors(json) {
  const nodes = Array.isArray(json.nodes) ? json.nodes : [];
  const meshes = Array.isArray(json.meshes) ? json.meshes : [];
  const errors = [];
  nodes.forEach((node, nodeIndex) => {
    if (node.mesh !== undefined && (!Number.isInteger(node.mesh) || !meshes[node.mesh])) {
      errors.push(`node ${nodeIndex} references missing mesh ${node.mesh}`);
    }
    for (const child of node.children ?? []) {
      if (!Number.isInteger(child) || child < 0 || child >= nodes.length) {
        errors.push(`node ${nodeIndex} references missing child ${child}`);
      }
    }
  });
  for (const [sceneIndex, scene] of (json.scenes ?? []).entries()) {
    for (const node of scene.nodes ?? []) {
      if (!Number.isInteger(node) || node < 0 || node >= nodes.length) {
        errors.push(`scene ${sceneIndex} references missing root node ${node}`);
      }
    }
  }
  for (const [skinIndex, skin] of (json.skins ?? []).entries()) {
    for (const node of skin.joints ?? []) {
      if (!Number.isInteger(node) || node < 0 || node >= nodes.length) {
        errors.push(`skin ${skinIndex} references missing joint ${node}`);
      }
    }
    if (skin.skeleton !== undefined && (!Number.isInteger(skin.skeleton) || skin.skeleton < 0 || skin.skeleton >= nodes.length)) {
      errors.push(`skin ${skinIndex} references missing skeleton ${skin.skeleton}`);
    }
  }
  for (const [animationIndex, animation] of (json.animations ?? []).entries()) {
    for (const [channelIndex, channel] of (animation.channels ?? []).entries()) {
      const node = channel.target?.node;
      if (node !== undefined && (!Number.isInteger(node) || node < 0 || node >= nodes.length)) {
        errors.push(`animation ${animationIndex} channel ${channelIndex} references missing node ${node}`);
      }
    }
  }
  return errors;
}

function dimensionsFromBounds(bounds) {
  if (!bounds) return [0, 0, 0];
  return bounds.max.map((value, axis) => value - bounds.min[axis]);
}

function readEmbeddedImageBytes(image, json, bin) {
  if (typeof image?.uri === "string" && image.uri.startsWith("data:")) {
    const comma = image.uri.indexOf(",");
    if (comma > 0) {
      const metadata = image.uri.slice(5, comma);
      const payload = image.uri.slice(comma + 1);
      try {
        return {
          embedded: true,
          mimeType: metadata.split(";")[0] || image.mimeType || null,
          bytes: /;base64$/i.test(metadata)
            ? Buffer.from(payload, "base64")
            : Buffer.from(decodeURIComponent(payload), "utf8"),
        };
      } catch {
        return {
          embedded: true,
          mimeType: metadata.split(";")[0] || image.mimeType || null,
          bytes: null,
        };
      }
    }
  }

  if (Number.isInteger(image?.bufferView)) {
    const view = json.bufferViews?.[image.bufferView];
    const start = Number(view?.byteOffset ?? 0);
    const length = Number(view?.byteLength ?? 0);
    return {
      embedded: true,
      mimeType: image.mimeType ?? null,
      bytes: view && bin && start >= 0 && length >= 0 ? bin.subarray(start, start + length) : null,
    };
  }

  return {
    embedded: false,
    mimeType: image?.mimeType ?? null,
    bytes: null,
  };
}

function readImageDimensions(bytes) {
  if (!bytes || bytes.length < 24) return { width: null, height: null };
  if (bytes.readUInt32BE(0) !== 0x89504e47 || bytes.readUInt32BE(4) !== 0x0d0a1a0a) {
    return { width: null, height: null };
  }
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
  };
}

function inspectBaseColorTexture(material, json, bin) {
  const textureIndex = material?.pbrMetallicRoughness?.baseColorTexture?.index;
  if (!Number.isInteger(textureIndex)) return null;
  const imageIndex = json.textures?.[textureIndex]?.source;
  const image = Number.isInteger(imageIndex) ? json.images?.[imageIndex] : null;
  const embedded = readEmbeddedImageBytes(image, json, bin);
  const dimensions = readImageDimensions(embedded.bytes);
  return {
    embedded: embedded.embedded,
    mimeType: embedded.mimeType,
    ...dimensions,
  };
}

/** Inspect names and world-space geometry bounds without loading a renderer. */
export function inspectGlb(buffer) {
  const { json, binChunk } = readGlb(buffer);
  const nodes = Array.isArray(json.nodes) ? json.nodes : [];
  const meshes = Array.isArray(json.meshes) ? json.meshes : [];
  const materials = Array.isArray(json.materials) ? json.materials : [];
  const worldMatrices = computeWorldMatrices(nodes);
  const bounds = makeEmptyBounds();
  let hasGeometry = false;

  nodes.forEach((node, nodeIndex) => {
    if (!Number.isInteger(node.mesh) || !meshes[node.mesh]) return;
    const mesh = meshes[node.mesh];
    for (const primitive of mesh.primitives ?? []) {
      const positionIndex = primitive.attributes?.POSITION;
      if (positionIndex === undefined) continue;
      const localBounds = accessorBounds(positionIndex, json, binChunk?.data ?? null);
      includeBounds(bounds, localBounds, worldMatrices[nodeIndex] ?? IDENTITY_MATRIX);
      hasGeometry = true;
    }
  });

  const dimensions = hasGeometry ? dimensionsFromBounds(bounds) : [0, 0, 0];
  const unsupportedNames = [
    ...nodes.map((node) => String(node.name ?? "")).filter((name) => getUnsupportedNameReason(name)),
    ...meshes.map((mesh) => String(mesh.name ?? "")).filter((name) => getUnsupportedNameReason(name)),
  ];

  return {
    nodeNames: nodes.map((node) => String(node.name ?? "")),
    meshNames: meshes.map((mesh) => String(mesh.name ?? "")),
    materials: materials.map((material) => {
      const baseColorTexture = inspectBaseColorTexture(material, json, binChunk?.data ?? null);
      return {
        name: String(material.name ?? ""),
        alphaMode: material.alphaMode ?? "OPAQUE",
        alphaCutoff: material.alphaCutoff,
        hasBaseColorTexture: baseColorTexture !== null,
        baseColorTexture,
      };
    }),
    unsupportedNames,
    referenceErrors: collectReferenceErrors(json),
    bounds: hasGeometry ? { min: bounds.min, max: bounds.max } : null,
    dimensions,
    maxDimensionMeters: Math.max(...dimensions),
  };
}

function resolveCatalogTexturePath(textureUrl, modelsDir) {
  if (typeof textureUrl !== "string" || !textureUrl.startsWith(CINE57_MODEL_URL_PREFIX)) return null;
  const relativePath = textureUrl.slice(CINE57_MODEL_URL_PREFIX.length);
  if (!relativePath) return null;
  const root = path.resolve(modelsDir);
  const resolved = path.resolve(root, relativePath);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) return null;
  return resolved;
}

function getAvailableTexturePaths(entry, modelsDir) {
  const available = new Set();
  for (const textureUrl of listCatalogTexturePaths(entry)) {
    const resolved = resolveCatalogTexturePath(textureUrl, modelsDir);
    if (resolved && fs.existsSync(resolved)) available.add(textureUrl);
  }
  return available;
}

export function computeModelAssetSha256(entry, filePath, modelsDir) {
  const hash = createHash("sha256");
  hash.update(entry.fileName);
  hash.update("\0");
  hash.update(fs.readFileSync(filePath));
  const textureUrls = [...listCatalogTexturePaths(entry)].sort();
  for (const textureUrl of textureUrls) {
    hash.update("\0");
    hash.update(textureUrl);
    const texturePath = resolveCatalogTexturePath(textureUrl, modelsDir);
    if (texturePath && fs.existsSync(texturePath)) hash.update(fs.readFileSync(texturePath));
  }
  return hash.digest("hex");
}

function addError(errors, message) {
  errors.push(message);
}

function validateModelUsage(entry, errors) {
  const usage = entry.usage;
  if (!usage || typeof usage !== "object") {
    addError(errors, `${entry.id} is missing model usage instructions`);
    return;
  }
  if (!MODEL_USAGE_SUPPORT_SURFACES.has(usage.supportSurface)) {
    addError(errors, `${entry.id} uses unknown model usage support surface: ${usage.supportSurface}`);
  }
  if (!MODEL_USAGE_PLACEMENT_MODES.has(usage.placementMode)) {
    addError(errors, `${entry.id} uses unknown model usage placement mode: ${usage.placementMode}`);
  }
  if (!MODEL_USAGE_ANCHORS.has(usage.anchor)) {
    addError(errors, `${entry.id} uses unknown model usage anchor: ${usage.anchor}`);
  }
  if (!MODEL_USAGE_ORIENTATIONS.has(usage.orientation)) {
    addError(errors, `${entry.id} uses unknown model usage orientation: ${usage.orientation}`);
  }
  if (typeof usage.requiresFacingDirection !== "boolean") {
    addError(errors, `${entry.id} model usage direction flag must be boolean`);
  }
  if (typeof usage.instruction !== "string" || usage.instruction.trim().length === 0) {
    addError(errors, `${entry.id} model usage instruction must be non-empty text`);
  }
  if (usage.placementMode === "wall-mounted"
    && (usage.supportSurface !== "wall" || usage.anchor !== "back" || usage.orientation !== "wall-facing")) {
    addError(errors, `${entry.id} wall-mounted usage must use wall/back/wall-facing semantics`);
  }
  if (usage.placementMode === "ceiling-hung"
    && (usage.supportSurface !== "ceiling" || usage.anchor !== "top" || usage.orientation !== "downward")) {
    addError(errors, `${entry.id} ceiling-hung usage must use ceiling/top/downward semantics`);
  }
  const expectedSurface = MODEL_USAGE_SURFACE_BY_PLACEMENT[usage.placementMode];
  if (expectedSurface && usage.supportSurface !== expectedSurface) {
    addError(errors, `${entry.id} model usage surface does not match placement mode`);
  }
  if (usage.orientation === "directional" && usage.requiresFacingDirection !== true) {
    addError(errors, `${entry.id} directional usage must require a facing direction`);
  }
}

function isStaticModelEntry(entry) {
  return typeof entry?.fileUrl === "string" && entry.fileUrl.startsWith("/models/");
}

function isCine57StaticModelEntry(entry) {
  return isStaticModelEntry(entry) && entry.fileUrl.startsWith("/models/cine57/");
}

/** Return every static model-library content violation; an empty array means valid. */
export function validateModelLibrary({
  library,
  modelsDir,
  importAuditPath = MODEL_LIBRARY_IMPORT_AUDIT_PATH,
  previewAuditPath = MODEL_LIBRARY_PREVIEW_AUDIT_PATH,
  importHistoryPath = MODEL_LIBRARY_IMPORT_HISTORY_PATH,
} = {}) {
  const errors = [];
  const entries = Array.isArray(library) ? library : [];
  const staticEntries = entries.filter(isStaticModelEntry);
  const cine57StaticEntries = staticEntries.filter(isCine57StaticModelEntry);
  const removedIds = new Set(CINE57_REMOVED_MODEL_IDS);
  const quarantinedIds = new Set(CINE57_QUARANTINED_MODEL_IDS);
  const quarantinedFileNames = new Set(CINE57_QUARANTINED_MODEL_FILE_NAMES);
  const rejectedForegroundFileNames = new Set(CINE57_REJECTED_FOREGROUND_MODEL_FILE_NAMES);
  const allowedIds = new Set(CINE57_ALLOWED_MODEL_IDS);
  const allowedCategories = new Set(CINE57_CATEGORY_ORDER);
  const requiredCategories = new Set(CINE57_REQUIRED_CATEGORIES);
  const ids = new Set();
  const fileNames = new Set();
  const meshNamesById = new Map();
  const assetSha256ById = new Map();
  const staticFileNames = new Set();
  let importAuditDocument = null;
  try {
    importAuditDocument = JSON.parse(fs.readFileSync(importAuditPath, "utf8"));
  } catch (error) {
    addError(
      errors,
      `model library import audit could not be loaded: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const importAuditByTexture = importAuditDocument?.textures ?? {};
  let previewAuditDocument = null;
  try {
    previewAuditDocument = JSON.parse(fs.readFileSync(previewAuditPath, "utf8"));
  } catch (error) {
    addError(
      errors,
      `model library preview audit could not be loaded: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  let visualReviewDocument = null;
  try {
    visualReviewDocument = JSON.parse(fs.readFileSync(MODEL_LIBRARY_VISUAL_REVIEW_PATH, "utf8"));
  } catch (error) {
    addError(
      errors,
      `model library visual review could not be loaded: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  let importHistoryDocument = null;
  try {
    importHistoryDocument = JSON.parse(fs.readFileSync(importHistoryPath, "utf8"));
    errors.push(...validateImportHistoryDocument(importHistoryDocument)
      .map((error) => `model library import history: ${error}`));
  } catch (error) {
    addError(
      errors,
      `model library import history could not be loaded: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  errors.push(...validateModelLibraryImportAudit({
    library: entries,
    audit: importAuditDocument,
    modelsDir,
  }));
  const previewAuditById = new Map(
    (Array.isArray(previewAuditDocument?.entries) ? previewAuditDocument.entries : [])
      .map((entry) => [entry.id, entry]),
  );

  if (cine57StaticEntries.length < CINE57_MINIMUM_MODEL_COUNT) {
    addError(errors, `expected at least ${CINE57_MINIMUM_MODEL_COUNT} Cine57 entries, found ${cine57StaticEntries.length}`);
  }

  for (const entry of entries) {
    if (ids.has(entry.id)) addError(errors, `duplicate model id: ${entry.id}`);
    ids.add(entry.id);
    if (fileNames.has(entry.fileName)) addError(errors, `duplicate model file: ${entry.fileName}`);
    fileNames.add(entry.fileName);

    if (typeof entry.fileUrl !== "string" || typeof entry.fileName !== "string") {
      addError(errors, `${entry.id} must declare a fileUrl and fileName`);
      continue;
    }
    validateModelUsage(entry, errors);
    if (!isStaticModelEntry(entry)) continue;

    if (entry.source !== CINE57_MODEL_LIBRARY_CONTRACT.source) {
      addError(errors, `${entry.id} must use ${CINE57_MODEL_LIBRARY_CONTRACT.source} as its model source`);
    }
    if (!isCine57StaticModelEntry(entry)) {
      addError(errors, `${entry.id} must use /models/cine57/ as its static model path`);
      continue;
    }
    if (!allowedIds.has(entry.id)) addError(errors, `model id is not in the curated allowlist: ${entry.id}`);
    if (removedIds.has(entry.id)) addError(errors, `removed model id is still published: ${entry.id}`);
    if (quarantinedIds.has(entry.id)) addError(errors, `quarantined model id is still published: ${entry.id}`);
    if (!allowedCategories.has(entry.category)) {
      addError(errors, `${entry.id} uses unknown model category: ${entry.category}`);
    }
    staticFileNames.add(entry.fileName);
    if (!entry.fileUrl.endsWith(`/models/cine57/${entry.fileName}`)) {
      addError(errors, `${entry.id} fileUrl does not match fileName`);
    }

    const filePath = path.join(modelsDir, entry.fileName);
    if (!fs.existsSync(filePath)) {
      addError(errors, `${entry.id} is missing ${entry.fileName}`);
      continue;
    }
    try {
      const inspection = inspectGlb(fs.readFileSync(filePath));
      meshNamesById.set(entry.id, new Set(inspection.meshNames.filter(Boolean)));
      assetSha256ById.set(entry.id, computeModelAssetSha256(entry, filePath, modelsDir));
      const actualSizeKb = Math.round(fs.statSync(filePath).size / 1024);
      if (entry.sizeKb !== actualSizeKb) {
        addError(errors, `${entry.id} sizeKb is ${entry.sizeKb}, actual file size is ${actualSizeKb}`);
      }
      if (inspection.unsupportedNames.length > 0) {
        addError(errors, `${entry.id} contains unsupported GLB names: ${inspection.unsupportedNames.join(", ")}`);
      }
      if (inspection.referenceErrors.length > 0) {
        addError(errors, `${entry.id} contains dangling GLB references: ${inspection.referenceErrors.join(", ")}`);
      }
      const textureErrors = validateModelTextureContract({
        entry,
        glbMaterials: inspection.materials,
        availableTexturePaths: getAvailableTexturePaths(entry, modelsDir),
        importAuditByTexture,
      });
      errors.push(...textureErrors);
      const admission = evaluateModelCandidate({
        entry,
        inspection,
        preview: previewAuditById.get(entry.id),
        textureErrors,
        expectedAssetSha256: assetSha256ById.get(entry.id),
        policy: CINE57_FOREGROUND_ADMISSION,
      });
      if (!admission.accepted) {
        addError(
          errors,
          `${entry.id} admission rejected [${admission.reasonCode}]: ${admission.summary}`,
        );
      }
      if (inspection.maxDimensionMeters > MAX_FOREGROUND_MODEL_DIMENSION_METERS + 1e-6) {
        addError(
          errors,
          `${entry.id} is ${inspection.maxDimensionMeters.toFixed(3)}m wide; `
            + `foreground limit is ${MAX_FOREGROUND_MODEL_DIMENSION_METERS}m`,
        );
      }
    } catch (error) {
      addError(errors, `${entry.id} GLB inspection failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  errors.push(...validateModelVisualReview({
    library: entries,
    reviews: visualReviewDocument?.entries,
    meshNamesById,
    assetSha256ById,
  }));
  errors.push(...validatePreviewAuditDocument({
    auditDocument: previewAuditDocument,
    library: entries,
    assetSha256ById,
  }));

  const historyByCatalogId = new Map();
  for (const record of importHistoryDocument?.entries ?? []) {
    const catalogId = typeof record.evidence === "object" && record.evidence !== null
      ? record.evidence.catalogId
      : null;
    if (typeof catalogId !== "string" || catalogId.length === 0) continue;
    if (historyByCatalogId.has(catalogId)) {
      addError(errors, `model library import history has duplicate catalogId: ${catalogId}`);
    }
    historyByCatalogId.set(catalogId, record);
  }
  const expectedHistoryIds = new Set([
    ...CINE57_ALLOWED_MODEL_IDS,
    ...CINE57_REJECTED_FOREGROUND_MODEL_IDS,
  ]);
  for (const expectedId of expectedHistoryIds) {
    const record = historyByCatalogId.get(expectedId);
    if (!record) {
      addError(errors, `model library import history is missing catalogId: ${expectedId}`);
      continue;
    }
    const shouldBeRejected = CINE57_REJECTED_FOREGROUND_MODEL_IDS.includes(expectedId);
    const expectedStatus = shouldBeRejected ? "rejected" : "approved";
    if (record.status !== expectedStatus) {
      addError(
        errors,
        `model library import history status mismatch for ${expectedId}: expected ${expectedStatus}, found ${record.status}`,
      );
    }
  }

  for (const requiredCategory of requiredCategories) {
    if (!cine57StaticEntries.some((entry) => entry.category === requiredCategory)) {
      addError(errors, `required model category is empty: ${requiredCategory}`);
    }
  }

  for (const allowedId of allowedIds) {
    if (!ids.has(allowedId)) addError(errors, `curated model is missing from catalog: ${allowedId}`);
  }

  const foodContainerEntries = cine57StaticEntries.filter(isFoodContainerModel);
  if (foodContainerEntries.length > CINE57_MAX_FOOD_CONTAINER_ENTRIES) {
    addError(
      errors,
      `food/box model family allows at most ${CINE57_MAX_FOOD_CONTAINER_ENTRIES} entries, found ${foodContainerEntries.length}`,
    );
  }

  if (fs.existsSync(modelsDir)) {
    for (const fileName of fs.readdirSync(modelsDir).filter((file) => file.endsWith(".glb"))) {
      if (!staticFileNames.has(fileName) && !quarantinedFileNames.has(fileName)) {
        if (rejectedForegroundFileNames.has(fileName)) continue;
        addError(errors, `orphan GLB is not in catalog: ${fileName}`);
      }
    }
    for (const asset of CINE57_QUARANTINED_ASSETS) {
      const filePath = path.join(modelsDir, asset.fileName);
      if (!fs.existsSync(filePath)) {
        addError(errors, `quarantined asset is missing ${asset.fileName}`);
      }
      if (staticFileNames.has(asset.fileName)) {
        addError(errors, `quarantined asset is also published: ${asset.fileName}`);
      }
    }
  } else {
    addError(errors, `model directory is missing: ${modelsDir}`);
  }

  return errors;
}
