import fs from "fs/promises";
import {
  storyScene3DEnvironmentMatches,
  type StoryScene3DEnvironment,
  type StoryScene3DMarkerSet,
} from "@ai-novel/shared/types/comicDrama";
import { buildStoryScene3dImageFingerprint } from "@ai-novel/shared/utils/scene3dEnvironment";
import type { StoryAssetState } from "@ai-novel/shared/types/novelReferenceExtraction";
import { prisma } from "../../../../db/prisma";
import { AppError } from "../../../../middleware/errorHandler";
import { runStructuredPrompt } from "../../../../prompting/core/promptRunner";
import {
  sceneState3dMarkersPrompt,
  type SceneState3dMarkersOutput,
} from "../../../../prompting/prompts/drama/sceneState3dMarkers.prompts";
import type { DramaLLMOptions } from "../../../../services/drama/DramaStrategyService";
import { supportsVisionInput } from "../../../../llm/capabilities";
import { getVisionModelProvider } from "../../../../llm/modelCategories";
import { PROVIDERS } from "../../../../llm/providers";
import { isBuiltinLLMProvider } from "@ai-novel/shared/types/llm";
import { storyAssetStateImageService } from "./StoryAssetStateImageService";
import {
  normalizeSceneStates,
  parseStates,
  updateStoryAssetStateJsonWithCas,
} from "./StorySettingsStatePolicy";
import {
  normalizeStoryScene3dEnvironment,
  resolveStoryScene3dEnvironment,
} from "./StoryScene3dEnvironment";
import { storySettingsService } from "./StorySettingsService";
import { normalizeStoryScene3dMarkerSet } from "./StoryScene3dMarkers";
import { mergeStoryScene3dMarkerSets } from "@ai-novel/shared/utils/scene3dMarkers";
import { STORY_SCENE_3D_MARKER_FALLBACK_WALL_RADIUS_RATIO } from "@ai-novel/shared/utils/scene3dProjection";
import { prepareStoryScene3dVisionImage } from "./StoryScene3dVisionImage";

const MAX_ANALYZE_IMAGE_BYTES = 8 * 1024 * 1024;
const ALLOWED_IMAGE_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

export interface StoryScene3dMarkerImageMeta {
  artifactId?: string | null;
  generatedAt?: string | null;
}

export function buildStoryScene3dMarkerSet(
  output: SceneState3dMarkersOutput,
  environment: StoryScene3DEnvironment,
  imageMeta: StoryScene3dMarkerImageMeta,
): StoryScene3DMarkerSet {
  const normalizedEnvironment = normalizeStoryScene3dEnvironment(environment);
  const normalized = normalizeStoryScene3dMarkerSet({
    schemaVersion: 1,
    status: "ready",
    markers: output.markers,
    sourceEnvironment: {
      projectionCenterHeight: normalizedEnvironment.projectionCenterHeight,
      projectionCenterHeightRatio: normalizedEnvironment.projectionCenterHeightRatio,
      radiusMeters: normalizedEnvironment.radiusMeters,
      panoramaHorizonV: normalizedEnvironment.panoramaHorizonV,
    },
    analysisNote: output.analysisNote,
    sourceImageArtifactId: imageMeta.artifactId,
    sourceImageGeneratedAt: imageMeta.generatedAt,
    analyzedAt: new Date().toISOString(),
  }, {
    maxRadius: normalizedEnvironment.radiusMeters * STORY_SCENE_3D_MARKER_FALLBACK_WALL_RADIUS_RATIO,
    environment: normalizedEnvironment,
  });

  return normalized ?? {
    schemaVersion: 1,
    status: "ready",
    sourceEnvironment: {
      projectionCenterHeight: normalizedEnvironment.projectionCenterHeight,
      projectionCenterHeightRatio: normalizedEnvironment.projectionCenterHeightRatio,
      radiusMeters: normalizedEnvironment.radiusMeters,
      panoramaHorizonV: normalizedEnvironment.panoramaHorizonV,
    },
    markers: [],
    analyzedAt: new Date().toISOString(),
  };
}

function assertAnalysisImage(image: StoryAssetState["image"]): asserts image is NonNullable<StoryAssetState["image"]> & { url: string } {
  if (!image?.url?.trim()) {
    throw new AppError("当前场景状态没有可读取的图片，请先生成状态图。", 409);
  }
}

export class StoryScene3dMarkerService {
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
    const environment = resolveStoryScene3dEnvironment(
      initialRow.sceneType,
      initialRow.scene3dEnvironmentJson,
      initialBaseStates[0]?.sceneType,
    );
    const initialStates = normalizeSceneStates(initialBaseStates, {
      ...initialRow,
      scene3dEnvironment: environment,
    });
    const initialState = initialStates.find((state) => state.id === stateId);
    if (!initialState) {
      throw new AppError("未找到场景状态。", 404);
    }
    assertAnalysisImage(initialState.image);

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

    // 送图理解固定走视觉槽（Codex 订阅）；显式传入的 provider 仍然优先。
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
      asset: sceneState3dMarkersPrompt,
      promptInput: {
        sceneName: initialRow.name,
        stateLabel: initialState.label,
        sceneType: initialState.sceneType ?? initialRow.sceneType,
        environmentJson: JSON.stringify(environment),
        imageBase64: analysisImage.imageBase64,
        mimeType: analysisImage.mimeType,
      },
      options: {
        provider: effectiveProvider,
        model: options.model,
        temperature: options.temperature ?? 0.2,
        novelId,
        entrypoint: "story-settings.scene-state.3d-markers",
        itemKey: `${sceneId}:${stateId}`,
      },
    });

    const markerSet = buildStoryScene3dMarkerSet(result.output, environment, {
      artifactId: initialState.image.artifactId,
      generatedAt: initialState.image.generatedAt,
    });
    let liveEnvironmentRaw = initialRow.scene3dEnvironmentJson;
    let liveEnvironment = environment;

    await updateStoryAssetStateJsonWithCas({
      stateId,
      fallbackStates: initialStates,
      read: async () => {
        const row = await prisma.novelScene.findFirst({
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
        if (!row) {
          throw new AppError("没有找到这个场景。", 404);
        }
        const liveBaseStates = normalizeSceneStates(parseStates(row.statesJson), row);
        liveEnvironmentRaw = row.scene3dEnvironmentJson;
        liveEnvironment = resolveStoryScene3dEnvironment(
          row.sceneType,
          row.scene3dEnvironmentJson,
          liveBaseStates[0]?.sceneType,
        );
        const liveStates = normalizeSceneStates(liveBaseStates, {
          ...row,
          scene3dEnvironment: liveEnvironment,
        });
        return {
          raw: row.statesJson,
          fallbackStates: liveStates,
          normalize: (states: StoryAssetState[]) => normalizeSceneStates(states, {
            ...row,
            scene3dEnvironment: liveEnvironment,
          }),
        };
      },
      write: async (expectedRaw, nextRaw) => {
        const writeResult = await prisma.novelScene.updateMany({
          where: {
            id: sceneId,
            novelId,
            statesJson: expectedRaw,
            scene3dEnvironmentJson: liveEnvironmentRaw,
          },
          data: { statesJson: nextRaw },
        });
        return writeResult.count === 1;
      },
      patch: (state) => {
        if (buildStoryScene3dImageFingerprint(state.image) !== imageFingerprint) {
          throw new AppError("场景图片已更新，请重新识别空间标记。", 409);
        }
        if (!storyScene3DEnvironmentMatches(liveEnvironment, environment)) {
          throw new AppError("场景投射参数已改变，请重新识别空间标记。", 409);
        }
        // 全景图只做背景后，前景家具主要靠手动摆放：重新识别整体替换 AI 标记，
        // 但必须原样保留用户手动放置的前景道具标记。
        return { ...state, scene3dMarkers: mergeStoryScene3dMarkerSets(markerSet, state.scene3dMarkers) };
      },
    });

    return storySettingsService.getScene(novelId, sceneId);
  }
}

export const storyScene3dMarkerService = new StoryScene3dMarkerService();
