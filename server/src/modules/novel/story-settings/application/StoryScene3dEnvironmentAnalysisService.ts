import fs from "fs/promises";
import type {
  StoryScene3DEnvironment,
  StoryScene3dEnvironmentVisionEstimate,
} from "@ai-novel/shared/types/comicDrama";
import {
  buildStoryScene3dImageFingerprint,
  isStoryScene3dEnvironmentAnalysisCurrent,
  normalizeStoryScene3dEnvironment,
  normalizeVisionStoryScene3dEnvironment,
  resolveStoryScene3dEnvironment,
  serializeStoryScene3dEnvironment,
} from "@ai-novel/shared/utils/scene3dEnvironment";
import type { StoryAssetState } from "@ai-novel/shared/types/novelReferenceExtraction";
import { prisma } from "../../../../db/prisma";
import { AppError } from "../../../../middleware/errorHandler";
import { supportsVisionInput } from "../../../../llm/capabilities";
import { getVisionModelProvider } from "../../../../llm/modelCategories";
import { PROVIDERS } from "../../../../llm/providers";
import { isBuiltinLLMProvider } from "@ai-novel/shared/types/llm";
import { runStructuredPrompt } from "../../../../prompting/core/promptRunner";
import {
  sceneState3dEnvironmentPrompt,
  type SceneState3dEnvironmentOutput,
} from "../../../../prompting/prompts/drama/sceneState3dEnvironment.prompts";
import type { DramaLLMOptions } from "../../../../services/drama/DramaStrategyService";
import { storyAssetStateImageService } from "./StoryAssetStateImageService";
import {
  normalizeSceneStates,
  parseStates,
} from "./StorySettingsStatePolicy";
import { storySettingsService } from "./StorySettingsService";
import { prepareStoryScene3dVisionImage } from "./StoryScene3dVisionImage";

export { buildStoryScene3dImageFingerprint, isStoryScene3dEnvironmentAnalysisCurrent };

const MAX_ANALYZE_IMAGE_BYTES = 8 * 1024 * 1024;
const ALLOWED_IMAGE_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

function assertAnalysisImage(
  image: StoryAssetState["image"],
): asserts image is NonNullable<StoryAssetState["image"]> & { url: string } {
  if (!image?.url?.trim()) {
    throw new AppError("当前场景状态没有可读取的图片，请先生成状态图。", 409);
  }
}

function withAnalysis(
  environment: StoryScene3DEnvironment,
  analysis: ReturnType<typeof normalizeVisionStoryScene3dEnvironment>["analysis"],
): StoryScene3DEnvironment {
  return normalizeStoryScene3dEnvironment({ ...environment, analysis });
}

function imageMetadata(state: StoryAssetState): StoryScene3dEnvironmentVisionEstimate {
  return {
    sourceImageArtifactId: state.image?.artifactId ?? null,
    sourceImageGeneratedAt: state.image?.generatedAt ?? null,
    sourceImageUrl: state.image?.url ?? null,
  };
}

function visionOutputWithImageMetadata(
  output: SceneState3dEnvironmentOutput,
  state: StoryAssetState,
): StoryScene3dEnvironmentVisionEstimate {
  return {
    ...output,
    ...imageMetadata(state),
    analyzedAt: new Date().toISOString(),
  };
}

export class StoryScene3dEnvironmentAnalysisService {
  async analyzeSceneState(
    novelId: string,
    sceneId: string,
    stateId: string,
    options: DramaLLMOptions = {},
  ) {
    const initialRow = await prisma.novelScene.findFirst({
      where: { id: sceneId, novelId },
      select: {
        id: true,
        name: true,
        sceneType: true,
        summary: true,
        environmentPrompt: true,
        timeOfDay: true,
        weather: true,
        statesJson: true,
        scene3dEnvironmentJson: true,
      },
    });
    if (!initialRow) {
      throw new AppError("没有找到这个场景。", 404);
    }

    const initialBaseStates = normalizeSceneStates(parseStates(initialRow.statesJson), initialRow);
    const initialEnvironment = resolveStoryScene3dEnvironment(
      initialRow.sceneType,
      initialRow.scene3dEnvironmentJson,
      initialBaseStates[0]?.sceneType,
    );
    const initialStates = normalizeSceneStates(initialBaseStates, {
      ...initialRow,
      scene3dEnvironment: initialEnvironment,
    });
    const initialState = initialStates.find((state) => state.id === stateId);
    if (!initialState) {
      throw new AppError("未找到场景状态。", 404);
    }

    // 用户明确保存的投影参数拥有最高优先级，自动分析只负责补齐默认环境。
    if (initialEnvironment.customized === true) {
      return storySettingsService.getScene(novelId, sceneId);
    }

    assertAnalysisImage(initialState.image);
    if (isStoryScene3dEnvironmentAnalysisCurrent(initialEnvironment.analysis, initialState.image)) {
      return storySettingsService.getScene(novelId, sceneId);
    }

    const sourceImage = await storyAssetStateImageService.resolveStateImagePath(
      novelId,
      "scene",
      sceneId,
      stateId,
    );
    if (!sourceImage) {
      throw new AppError("当前场景状态的图片文件不可读取，请重新生成状态图。", 409);
    }
    if (!ALLOWED_IMAGE_MIME_TYPES.has(sourceImage.mimeType)) {
      throw new AppError("场景状态图格式不受支持，请使用 PNG、JPEG 或 WebP。", 400);
    }

    const imageBuffer = await fs.readFile(sourceImage.filePath);
    if (imageBuffer.byteLength > MAX_ANALYZE_IMAGE_BYTES) {
      throw new AppError("场景状态图过大，请压缩到 8MB 以内。", 400);
    }

    const effectiveProvider = options.provider ?? getVisionModelProvider();
    if (!supportsVisionInput(effectiveProvider)) {
      const providerName = isBuiltinLLMProvider(effectiveProvider)
        ? PROVIDERS[effectiveProvider].name
        : effectiveProvider;
      throw new AppError(
        `当前模型通道（${providerName}）不支持图片输入，空间识别需要视觉通道。`,
        409,
      );
    }

    const analysisImage = await prepareStoryScene3dVisionImage(imageBuffer, sourceImage.mimeType);
    const imageFingerprint = buildStoryScene3dImageFingerprint(initialState.image);
    const result = await runStructuredPrompt({
      asset: sceneState3dEnvironmentPrompt,
      promptInput: {
        sceneName: initialRow.name,
        stateLabel: initialState.label,
        imageBase64: analysisImage.imageBase64,
        mimeType: analysisImage.mimeType,
      },
      options: {
        provider: effectiveProvider,
        model: options.model,
        temperature: options.temperature ?? 0.2,
        novelId,
        entrypoint: "story-settings.scene-state.3d-environment",
        itemKey: `${sceneId}:${stateId}`,
      },
    });

    const visionResult = normalizeVisionStoryScene3dEnvironment(
      visionOutputWithImageMetadata(result.output, initialState),
    );
    const analyzedEnvironment = withAnalysis(visionResult.environment, visionResult.analysis);
    const nextEnvironmentJson = serializeStoryScene3dEnvironment(
      analyzedEnvironment,
      { customized: false },
    );

    const liveRow = await prisma.novelScene.findFirst({
      where: { id: sceneId, novelId },
      select: {
        statesJson: true,
        name: true,
        summary: true,
        environmentPrompt: true,
        sceneType: true,
        timeOfDay: true,
        weather: true,
        scene3dEnvironmentJson: true,
      },
    });
    if (!liveRow) {
      throw new AppError("没有找到这个场景。", 404);
    }
    const liveBaseStates = normalizeSceneStates(parseStates(liveRow.statesJson), liveRow);
    const liveEnvironment = resolveStoryScene3dEnvironment(
      liveRow.sceneType,
      liveRow.scene3dEnvironmentJson,
      liveBaseStates[0]?.sceneType,
    );
    const liveStates = normalizeSceneStates(liveBaseStates, {
      ...liveRow,
      scene3dEnvironment: liveEnvironment,
    });
    const liveState = liveStates.find((state) => state.id === stateId);
    if (!liveState) {
      throw new AppError("场景状态已被删除，请刷新后重试。", 409);
    }
    assertAnalysisImage(liveState.image);
    if (buildStoryScene3dImageFingerprint(liveState.image) !== imageFingerprint) {
      throw new AppError("场景图片已更新，请重新分析 3D 环境。", 409);
    }
    if (liveEnvironment.customized === true) {
      return storySettingsService.getScene(novelId, sceneId);
    }
    if (isStoryScene3dEnvironmentAnalysisCurrent(liveEnvironment.analysis, liveState.image)) {
      return storySettingsService.getScene(novelId, sceneId);
    }

    const writeResult = await prisma.novelScene.updateMany({
      where: {
        id: sceneId,
        novelId,
        scene3dEnvironmentJson: liveRow.scene3dEnvironmentJson,
      },
      data: { scene3dEnvironmentJson: nextEnvironmentJson },
    });
    if (writeResult.count !== 1) {
      const latest = await storySettingsService.getScene(novelId, sceneId);
      if (latest.scene3dEnvironment.customized === true) {
        return latest;
      }
      throw new AppError("场景投射参数已更新，请刷新后重试。", 409);
    }

    return storySettingsService.getScene(novelId, sceneId);
  }
}

export const storyScene3dEnvironmentAnalysisService = new StoryScene3dEnvironmentAnalysisService();
