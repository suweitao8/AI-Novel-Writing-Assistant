const TEXTURE_FIELDS = Object.freeze(["baseColor", "opacity", "normal", "rma"]);
const TRANSPARENT_ALPHA_MODES = new Set(["BLEND", "MASK"]);

function normalizeMaterialName(value) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function hasOpacityMapping(material) {
  return (typeof material?.opacity === "string" && material.opacity.trim().length > 0)
    || (Number.isFinite(material?.opacityValue) && material.opacityValue < 0.98);
}

function hasIndependentOpacityMapping(material) {
  if (Number.isFinite(material?.opacityValue) && material.opacityValue < 0.98) return true;
  return typeof material?.opacity === "string"
    && material.opacity.trim().length > 0
    && material.opacity !== material.baseColor;
}

function getImportAuditRecord(importAuditByTexture, texturePath) {
  if (importAuditByTexture instanceof Map) return importAuditByTexture.get(texturePath);
  return importAuditByTexture?.[texturePath];
}

/**
 * Validate the catalog-to-GLB texture contract without touching the filesystem.
 * The caller supplies the set of texture URLs that actually exist on disk.
 */
export function validateModelTextureContract({
  entry,
  glbMaterials = [],
  availableTexturePaths,
  importAuditByTexture,
} = {}) {
  const errors = [];
  const materials = entry?.materials && typeof entry.materials === "object" ? entry.materials : {};
  const materialByName = new Map(
    Object.entries(materials).map(([name, material]) => [normalizeMaterialName(name), material]),
  );

  for (const [materialName, material] of Object.entries(materials)) {
    for (const field of TEXTURE_FIELDS) {
      const texturePath = material?.[field];
      if (typeof texturePath !== "string" || texturePath.trim().length === 0) continue;
      if (availableTexturePaths && !availableTexturePaths.has(texturePath)) {
        errors.push(`${entry.id} ${materialName} ${field} texture is missing: ${texturePath}`);
      }
    }

    if (typeof material?.baseColor === "string" && importAuditByTexture) {
      const audit = getImportAuditRecord(importAuditByTexture, material.baseColor);
      if (!audit || typeof audit !== "object") {
        errors.push(`${entry.id} ${materialName} baseColor is missing import alpha audit: ${material.baseColor}`);
      } else if (typeof audit.preserveAlpha !== "boolean") {
        errors.push(`${entry.id} ${materialName} import alpha audit must declare preserveAlpha: ${material.baseColor}`);
      } else if (audit.preserveAlpha && /\.(?:jpg|jpeg)$/i.test(material.baseColor)
        && !hasIndependentOpacityMapping(material)) {
        errors.push(
          `${entry.id} ${materialName} source alpha requires PNG baseColor or independent opacity mapping: ${material.baseColor}`,
        );
      }
    }

    // A PNG base-color is an explicit signal that the texture may carry cutout
    // pixels. Requiring its opacity mapping prevents a later renderer from
    // treating the hidden atlas background as opaque geometry.
    if (typeof material?.baseColor === "string"
      && /\.png$/i.test(material.baseColor)
      && !hasOpacityMapping(material)) {
      errors.push(`${entry.id} ${materialName} PNG baseColor must declare opacity mapping: ${material.baseColor}`);
    }
  }

  for (const glbMaterial of Array.isArray(glbMaterials) ? glbMaterials : []) {
    const glbMaterialName = glbMaterial.name || "<unnamed>";
    const catalogMaterial = materialByName.get(normalizeMaterialName(glbMaterialName));

    if (glbMaterial?.hasBaseColorTexture && !catalogMaterial) {
      const texture = glbMaterial.baseColorTexture;
      if (texture?.embedded && texture.width === 1 && texture.height === 1) {
        errors.push(
          `${entry.id} ${glbMaterialName} uses an unresolved embedded 1x1 baseColor placeholder; `
            + "add a catalog material override or quarantine the asset",
        );
      } else {
        errors.push(`${entry.id} GLB baseColor material is missing catalog mapping: ${glbMaterialName}`);
      }
    }

    if (!TRANSPARENT_ALPHA_MODES.has(glbMaterial?.alphaMode)) continue;
    if (!catalogMaterial) {
      errors.push(`${entry.id} transparent GLB material is missing catalog mapping: ${glbMaterialName}`);
      continue;
    }
    if (!hasOpacityMapping(catalogMaterial)) {
      errors.push(`${entry.id} transparent material requires opacity mapping or scalar: ${glbMaterialName}`);
    }
  }

  return errors;
}

export function listCatalogTexturePaths(entry) {
  const paths = new Set();
  const materials = entry?.materials && typeof entry.materials === "object" ? entry.materials : {};
  for (const material of Object.values(materials)) {
    for (const field of TEXTURE_FIELDS) {
      const texturePath = material?.[field];
      if (typeof texturePath === "string" && texturePath.trim().length > 0) paths.add(texturePath);
    }
  }
  return paths;
}
