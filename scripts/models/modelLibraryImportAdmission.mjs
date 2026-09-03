import { validatePreviewAuditEntry } from "./model-library-preview-audit.mjs";

export const DEFAULT_MIN_FOREGROUND_MODEL_DIMENSION_METERS = 0.1;
export const DEFAULT_MAX_FOREGROUND_MODEL_DIMENSION_METERS = 5;

function reject(failureStage, reasonCode, summary) {
  return {
    accepted: false,
    failureStage,
    reasonCode,
    summary,
  };
}

function accepted() {
  return {
    accepted: true,
    failureStage: null,
    reasonCode: null,
    summary: null,
  };
}

function getAdmissionPolicy(policy) {
  return policy?.foregroundAdmission && typeof policy.foregroundAdmission === "object"
    ? policy.foregroundAdmission
    : policy ?? {};
}

function findRejectedAsset(policy, entry, inspection) {
  const rejectedAssets = Array.isArray(policy.rejectedAssets) ? policy.rejectedAssets : [];
  const meshNames = new Set([
    entry?.meshName,
    ...(Array.isArray(inspection?.meshNames) ? inspection.meshNames : []),
  ].filter(Boolean).map((name) => String(name)));
  return rejectedAssets.find((asset) => (
    (asset?.id && asset.id === entry?.id)
    || (asset?.meshName && meshNames.has(String(asset.meshName)))
  )) ?? null;
}

function previewFailureCode(previewErrors, preview) {
  if (previewErrors.some((error) => error.includes("screenshot must be square"))) return "non-square-preview";
  if (previewErrors.some((error) => error.includes("failed resource requests") || error.includes("console errors"))) {
    return "preview-failed";
  }
  if (previewErrors.some((error) => error.includes("geometry"))) return "preview-not-ready";
  if (previewErrors.some((error) => error.includes("screenshot"))) return "screenshot-invalid";
  if (preview?.reviewStatus !== "approved") return "preview-not-approved";
  return "preview-invalid";
}

/**
 * Evaluate a staged model before publication. Geometry must be measured in world
 * space and preview must be a real detail-page audit record.
 */
export function evaluateModelCandidate({
  entry = {},
  inspection,
  preview,
  textureErrors = [],
  expectedAssetSha256,
  policy = {},
} = {}) {
  const admissionPolicy = getAdmissionPolicy(policy);
  const disposition = findRejectedAsset(admissionPolicy, entry, inspection);
  if (disposition) {
    return reject(
      disposition.failureStage ?? "semantic",
      disposition.reasonCode ?? "curation-rejected",
      disposition.reason ?? disposition.summary ?? "模型未通过前景资产策展",
    );
  }

  const minimum = Number(
    admissionPolicy.minimumDimensionMeters ?? DEFAULT_MIN_FOREGROUND_MODEL_DIMENSION_METERS,
  );
  const maximum = Number(
    admissionPolicy.maximumDimensionMeters ?? DEFAULT_MAX_FOREGROUND_MODEL_DIMENSION_METERS,
  );
  const maxDimension = Number(inspection?.maxDimensionMeters);
  if (!Number.isFinite(maxDimension)) return reject("geometry", "geometry-invalid", "无法读取模型世界空间尺寸");
  if (maxDimension < minimum - 1e-6) {
    return reject("geometry", "too-small", `模型最大尺寸 ${maxDimension.toFixed(3)} 米，小于前景可见下限 ${minimum} 米`);
  }
  if (maxDimension > maximum + 1e-6) {
    return reject("geometry", "too-large", `模型最大尺寸 ${maxDimension.toFixed(3)} 米，超过前景上限 ${maximum} 米`);
  }

  if (Array.isArray(textureErrors) && textureErrors.length > 0) {
    return reject("texture", "texture-invalid", `模型材质检查失败：${textureErrors[0]}`);
  }
  if (!preview || typeof preview !== "object") return reject("preview", "missing-preview", "缺少真实模型详情页预览");
  if (
    expectedAssetSha256
    && preview.assetSha256 !== expectedAssetSha256
  ) {
    return reject("preview", "stale-preview", "详情页预览对应的模型资源指纹已过期");
  }
  if (
    preview.screenshotDimensions?.width !== preview.screenshotDimensions?.height
    || !Number.isInteger(preview.screenshotDimensions?.width)
    || preview.screenshotDimensions.width <= 0
  ) {
    return reject("preview", "non-square-preview", "模型详情页预览截图必须是方形");
  }
  if ((preview.consoleErrors?.length ?? 0) > 0 || (preview.failedRequests?.length ?? 0) > 0) {
    return reject("preview", "preview-failed", "模型详情页预览存在资源请求或控制台错误");
  }
  const previewErrors = validatePreviewAuditEntry(preview, { expectedAssetSha256 });
  if (previewErrors.length > 0) {
    const reasonCode = previewFailureCode(previewErrors, preview);
    return reject("preview", reasonCode, `模型详情页预览未通过：${previewErrors[0]}`);
  }
  return accepted();
}
