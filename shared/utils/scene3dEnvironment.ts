import type {
  StoryScene3DEnvironment,
  StoryScene3DEnvironmentInput,
  StoryScene3dEnvironmentAnalysis,
  StoryScene3dEnvironmentVisionEstimate,
} from "@ai-novel/shared/types/comicDrama";
import {
  STORY_SCENE_3D_DEFAULT_PANORAMA_HORIZON_V,
  STORY_SCENE_3D_DEFAULT_PROJECTION_CENTER_HEIGHT_RATIO,
  STORY_SCENE_3D_ENVIRONMENT_LIMITS,
} from "@ai-novel/shared/types/comicDrama";
import type { StoryAssetSceneType } from "@ai-novel/shared/types/novelReferenceExtraction";

export { STORY_SCENE_3D_ENVIRONMENT_LIMITS };

export interface StoryScene3dImageFingerprintInput {
  artifactId?: string | null;
  generatedAt?: string | null;
  url?: string | null;
}

/** 状态图制品的稳定身份；URL、生成时间和制品 id 任一变化都视为新图。 */
export function buildStoryScene3dImageFingerprint(
  image: StoryScene3dImageFingerprintInput | null | undefined,
): string {
  return [image?.artifactId ?? "", image?.generatedAt ?? "", image?.url ?? ""].join("|");
}

/** 只有带身份信息且来源仍是当前状态图的估算才可复用。 */
export function isStoryScene3dEnvironmentAnalysisCurrent(
  analysis: StoryScene3dEnvironmentAnalysis | null | undefined,
  image: StoryScene3dImageFingerprintInput | null | undefined,
): boolean {
  if (!analysis || (analysis.source !== "vision" && analysis.source !== "fallback")) {
    return false;
  }
  const currentFingerprint = buildStoryScene3dImageFingerprint(image);
  const hasImageIdentity = Boolean(
    image?.artifactId?.trim()
    || image?.generatedAt?.trim()
    || image?.url?.trim(),
  );
  return hasImageIdentity && currentFingerprint === buildStoryScene3dImageFingerprint({
    artifactId: analysis.sourceImageArtifactId,
    generatedAt: analysis.sourceImageGeneratedAt,
    url: analysis.sourceImageUrl,
  });
}

/** 自动分析闸门：没有手动覆盖且图片没有对应分析时才发起视觉请求。 */
export function shouldAutoAnalyzeStoryScene3dEnvironment(
  environment: Pick<StoryScene3DEnvironment, "analysis" | "customized"> | null | undefined,
  image: StoryScene3dImageFingerprintInput | null | undefined,
): boolean {
  return Boolean(image?.url?.trim())
    && environment?.customized !== true
    && !isStoryScene3dEnvironmentAnalysisCurrent(environment?.analysis, image);
}

/**
 * 投射中心高度的用户参数是“相对半球直径的百分比”（5%–20%），
 * 世界高度恒为 domeRadius × ratio 并在此处派生；这样拖动直径时投射中心
 * 保持同一比例，整体等比缩放。
 */
export const DEFAULT_STORY_SCENE_3D_ENVIRONMENT: StoryScene3DEnvironment = {
  // 视觉模型无法可靠判断绝对尺度时使用中性组合：直径 15、中心高度 2 米。
  projectionCenterHeight: 2,
  projectionCenterHeightRatio: STORY_SCENE_3D_DEFAULT_PROJECTION_CENTER_HEIGHT_RATIO,
  domeRadius: 15,
  panoramaHorizonV: STORY_SCENE_3D_DEFAULT_PANORAMA_HORIZON_V,
  yawDeg: 0,
  intensity: 1,
};

const LEGACY_DEFAULT_STORY_SCENE_3D_ENVIRONMENTS: readonly StoryScene3DEnvironment[] = [
  legacyDefault(2, 10, 0.2),
  legacyDefault(2, 15, 2 / 15),
  legacyDefault(2, 20, 0.1),
  legacyDefault(1, 8, 0.125),
  legacyDefault(1.7, 10, 0.17),
  legacyDefault(1, 20, 0.05),
  // 历任室内默认值：无 customized 标记的存量记录按未定制处理，回落到当前默认。
  legacyDefault(0.8, 5, 0.16),
  legacyDefault(0.5, 5, 0.1),
];

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function finiteOr(value: unknown, fallback: number): number {
  if (value === null || value === undefined || value === "") return fallback;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

const VISION_CONFIDENCE_THRESHOLD = 0.45;

function optionalTrimmed(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

function normalizeAnalysis(value: unknown): StoryScene3dEnvironmentAnalysis | undefined {
  if (!value || typeof value !== "object") return undefined;
  const source = value as Record<string, unknown>;
  const analysisSource = source.source === "vision" || source.source === "fallback"
    ? source.source
    : null;
  if (!analysisSource) return undefined;
  return {
    source: analysisSource,
    fallbackUsed: source.fallbackUsed === true,
    confidence: clamp(finiteOr(source.confidence, 0), 0, 1),
    evidence: optionalTrimmed(source.evidence, 240),
    sourceImageArtifactId: optionalTrimmed(source.sourceImageArtifactId, 160),
    sourceImageGeneratedAt: optionalTrimmed(source.sourceImageGeneratedAt, 80),
    sourceImageUrl: optionalTrimmed(source.sourceImageUrl, 1000),
    analyzedAt: optionalTrimmed(source.analyzedAt, 80),
  };
}

/** 高度按直径 × 占比派生并保留两位小数，避免浮点误差在往返中累积。 */
function deriveHeight(domeRadius: number, ratio: number): number {
  return Math.round(domeRadius * ratio * 100) / 100;
}

/** 构造与旧绝对高度快照等价的“历史默认”条目，供未定制回落判断使用。 */
function legacyDefault(height: number, domeRadius: number, ratio: number): StoryScene3DEnvironment {
  return {
    projectionCenterHeight: height,
    // 与 normalize 的推导精度一致（万分比圆整），保证未定制比较逐字段相等。
    projectionCenterHeightRatio: Math.round(clamp(ratio,
      STORY_SCENE_3D_ENVIRONMENT_LIMITS.projectionCenterHeightRatio.min,
      STORY_SCENE_3D_ENVIRONMENT_LIMITS.projectionCenterHeightRatio.max) * 10000) / 10000,
    domeRadius,
    panoramaHorizonV: STORY_SCENE_3D_DEFAULT_PANORAMA_HORIZON_V,
    yawDeg: 0,
    intensity: 1,
  };
}

export function normalizeStorySceneType(value: unknown): StoryAssetSceneType | null {
  return value === "interior" || value === "exterior" || value === "nature"
    ? value
    : null;
}

/** 状态类型是当前资产的权威值，场景级类型只为旧数据提供兼容回退。 */
export function resolveStorySceneType(
  sceneType: unknown,
  defaultStateType?: unknown,
): StoryAssetSceneType {
  return normalizeStorySceneType(defaultStateType)
    ?? normalizeStorySceneType(sceneType)
    ?? "exterior";
}

export function getDefaultStoryScene3dEnvironment(_sceneType?: unknown): StoryScene3DEnvironment {
  return { ...DEFAULT_STORY_SCENE_3D_ENVIRONMENT };
}

export function normalizeStoryScene3dEnvironment(input: Partial<StoryScene3DEnvironment> | Record<string, unknown> | null | undefined): StoryScene3DEnvironment {
  const source = input as Record<string, unknown> | null | undefined;
  const rawDomeRadius = finiteOr(source?.domeRadius, DEFAULT_STORY_SCENE_3D_ENVIRONMENT.domeRadius);
  const domeRadius = clamp(
    rawDomeRadius,
    STORY_SCENE_3D_ENVIRONMENT_LIMITS.domeRadius.min,
    STORY_SCENE_3D_ENVIRONMENT_LIMITS.domeRadius.max,
  );
  // 占比是权威调节参数；缺失时按存量高度与原始直径推导（clamp 进合同范围），
  // 高度随后一律由 裁剪后直径 × 占比 派生，保证拖动直径时投射中心等比跟随。
  const derivedFromStoredHeight = rawDomeRadius > 0
    && typeof source?.projectionCenterHeight === "number"
    && Number.isFinite(source.projectionCenterHeight)
    ? source.projectionCenterHeight / rawDomeRadius
    : Number.NaN;
  const ratioSource = finiteOr(
    source?.projectionCenterHeightRatio,
    Number.isFinite(derivedFromStoredHeight)
      ? derivedFromStoredHeight
      : DEFAULT_STORY_SCENE_3D_ENVIRONMENT.projectionCenterHeightRatio,
  );
  const clampedRatio = clamp(
    ratioSource,
    STORY_SCENE_3D_ENVIRONMENT_LIMITS.projectionCenterHeightRatio.min,
    STORY_SCENE_3D_ENVIRONMENT_LIMITS.projectionCenterHeightRatio.max,
  );
  const ratio = !Number.isFinite(derivedFromStoredHeight) && source?.projectionCenterHeightRatio === undefined
    ? clampedRatio
    : Math.round(clampedRatio * 10000) / 10000;
  const analysis = normalizeAnalysis(source?.analysis);
  return {
    projectionCenterHeight: clamp(
      deriveHeight(domeRadius, ratio),
      STORY_SCENE_3D_ENVIRONMENT_LIMITS.projectionCenterHeight.min,
      STORY_SCENE_3D_ENVIRONMENT_LIMITS.projectionCenterHeight.max,
    ),
    projectionCenterHeightRatio: ratio,
    domeRadius,
    panoramaHorizonV: clamp(
      finiteOr(source?.panoramaHorizonV, DEFAULT_STORY_SCENE_3D_ENVIRONMENT.panoramaHorizonV),
      STORY_SCENE_3D_ENVIRONMENT_LIMITS.panoramaHorizonV.min,
      STORY_SCENE_3D_ENVIRONMENT_LIMITS.panoramaHorizonV.max,
    ),
    yawDeg: 0,
    intensity: 1,
    ...(analysis ? { analysis } : {}),
  };
}

/**
 * 将视觉模型对全景图的粗估转换为可渲染的 3D 环境。
 * 图片缺少绝对尺度时不伪造精确值，低置信度结果直接使用中性兜底。
 */
export function normalizeVisionStoryScene3dEnvironment(
  input: StoryScene3dEnvironmentVisionEstimate | null | undefined,
): { environment: StoryScene3DEnvironment; analysis: StoryScene3dEnvironmentAnalysis } {
  const source = input ?? {};
  const confidence = clamp(finiteOr(source.confidence, 0), 0, 1);
  const diameter = Number(source.domeDiameterMeters);
  const height = Number(source.projectionCenterHeightMeters);
  const hasDiameter = Number.isFinite(diameter) && diameter > 0;
  const hasHeight = Number.isFinite(height) && height > 0;
  const canUseVision = confidence >= VISION_CONFIDENCE_THRESHOLD && hasDiameter;
  const analyzedAt = optionalTrimmed(source.analyzedAt, 80);
  const imageMeta = {
    sourceImageArtifactId: optionalTrimmed(source.sourceImageArtifactId, 160),
    sourceImageGeneratedAt: optionalTrimmed(source.sourceImageGeneratedAt, 80),
    sourceImageUrl: optionalTrimmed(source.sourceImageUrl, 1000),
  };
  if (!canUseVision) {
    return {
      environment: getDefaultStoryScene3dEnvironment(),
      analysis: {
        source: "fallback",
        fallbackUsed: true,
        confidence,
        evidence: optionalTrimmed(source.evidence, 240),
        ...imageMeta,
        analyzedAt,
      },
    };
  }

  const normalizedDiameter = clamp(
    diameter,
    STORY_SCENE_3D_ENVIRONMENT_LIMITS.domeRadius.min,
    STORY_SCENE_3D_ENVIRONMENT_LIMITS.domeRadius.max,
  );
  const ratio = hasHeight
    ? height / normalizedDiameter
    : DEFAULT_STORY_SCENE_3D_ENVIRONMENT.projectionCenterHeightRatio;
  const environment = normalizeStoryScene3dEnvironment({
    domeRadius: normalizedDiameter,
    projectionCenterHeightRatio: ratio,
    panoramaHorizonV: source.panoramaHorizonV,
  });
  return {
    environment,
    analysis: {
      source: "vision",
      fallbackUsed: false,
      confidence,
      evidence: optionalTrimmed(source.evidence, 240),
      ...imageMeta,
      analyzedAt,
    },
  };
}

export function parseStoryScene3dEnvironment(raw: string | null | undefined): StoryScene3DEnvironment {
  if (!raw?.trim()) {
    return DEFAULT_STORY_SCENE_3D_ENVIRONMENT;
  }
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return normalizeStoryScene3dEnvironment(parsed);
  } catch {
    return DEFAULT_STORY_SCENE_3D_ENVIRONMENT;
  }
}

export function serializeStoryScene3dEnvironment(
  input: StoryScene3DEnvironmentInput | Partial<StoryScene3DEnvironment> | Record<string, unknown> | null | undefined,
  options: { customized?: boolean } = {},
): string {
  const normalized = normalizeStoryScene3dEnvironment(input);
  return JSON.stringify({
    projectionCenterHeight: normalized.projectionCenterHeight,
    projectionCenterHeightRatio: normalized.projectionCenterHeightRatio,
    domeRadius: normalized.domeRadius,
    panoramaHorizonV: normalized.panoramaHorizonV,
    yawDeg: normalized.yawDeg,
    intensity: normalized.intensity,
    ...(normalized.analysis ? { analysis: normalized.analysis } : {}),
    customized: options.customized ?? input != null,
  });
}

function isUncustomizedDefaultEnvironment(input: StoryScene3DEnvironment): boolean {
  return LEGACY_DEFAULT_STORY_SCENE_3D_ENVIRONMENTS.some((candidate) => (
    input.projectionCenterHeight === candidate.projectionCenterHeight
    && input.projectionCenterHeightRatio === candidate.projectionCenterHeightRatio
    && input.domeRadius === candidate.domeRadius
    && input.panoramaHorizonV === candidate.panoramaHorizonV
    && input.yawDeg === candidate.yawDeg
    && input.intensity === candidate.intensity
  ));
}

export function resolveStoryScene3dEnvironment(
  sceneType: unknown,
  raw: string | null | undefined,
  defaultStateType?: unknown,
): StoryScene3DEnvironment {
  void sceneType;
  void defaultStateType;
  const defaultEnvironment = getDefaultStoryScene3dEnvironment();
  if (!raw?.trim()) {
    return { ...defaultEnvironment, customized: false };
  }
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown> & { customized?: unknown };
    const normalized = normalizeStoryScene3dEnvironment(parsed);
    if (normalized.analysis?.source === "vision" || normalized.analysis?.source === "fallback") {
      return { ...normalized, customized: false };
    }
    const customized = parsed.customized === true
      || (parsed.customized === undefined && !isUncustomizedDefaultEnvironment(normalized));
    return customized ? { ...normalized, customized: true } : { ...defaultEnvironment, customized: false };
  } catch {
    return { ...defaultEnvironment, customized: false };
  }
}
