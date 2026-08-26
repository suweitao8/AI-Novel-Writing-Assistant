import fs from "fs/promises";
import type { StoryScene3DEnvironment, StoryScene3DMarkerSet } from "@ai-novel/shared/types/comicDrama";
import type { StoryAssetState } from "@ai-novel/shared/types/novelReferenceExtraction";
import { prisma } from "../../../../db/prisma";
import { AppError } from "../../../../middleware/errorHandler";
import { runStructuredPrompt } from "../../../../prompting/core/promptRunner";
import {
  sceneState3dMarkersPrompt,
  type SceneState3dMarkersOutput,
} from "../../../../prompting/prompts/drama/sceneState3dMarkers.prompts";
import type { DramaLLMOptions } from "../../../../services/drama/DramaStrategyService";
import { storyAssetStateImageService } from "./StoryAssetStateImageService";
import {
  normalizeSceneStates,
  parseStates,
  updateStoryAssetStateJsonWithCas,
} from "./StorySettingsStatePolicy";
import { resolveStoryScene3dEnvironment } from "./StoryScene3dEnvironment";
import { storySettingsService } from "./StorySettingsService";
import { normalizeStoryScene3dMarkerSet } from "./StoryScene3dMarkers";

const MAX_ANALYZE_IMAGE_BYTES = 8 * 1024 * 1024;
const ALLOWED_IMAGE_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

export interface StoryScene3dMarkerImageMeta {
  artifactId?: string | null;
  generatedAt?: string | null;
}

function stateImageFingerprint(state: StoryAssetState | undefined): string {
  const image = state?.image;
  return [image?.artifactId ?? "", image?.generatedAt ?? "", image?.url ?? ""].join("|");
}

export function buildStoryScene3dMarkerSet(
  output: SceneState3dMarkersOutput,
  environment: StoryScene3DEnvironment,
  imageMeta: StoryScene3dMarkerImageMeta,
): StoryScene3DMarkerSet {
  const normalized = normalizeStoryScene3dMarkerSet({
    schemaVersion: 1,
    status: "ready",
    markers: output.markers,
    analysisNote: output.analysisNote,
    sourceImageArtifactId: imageMeta.artifactId,
    sourceImageGeneratedAt: imageMeta.generatedAt,
    analyzedAt: new Date().toISOString(),
  }, { maxRadius: environment.domeRadius * 0.45 });

  return normalized ?? {
    schemaVersion: 1,
    status: "ready",
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

    const initialStates = normalizeSceneStates(parseStates(initialRow.statesJson), initialRow);
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

    const environment = resolveStoryScene3dEnvironment(
      initialRow.sceneType,
      initialRow.scene3dEnvironmentJson,
      initialStates[0]?.sceneType,
    );
    const imageFingerprint = stateImageFingerprint(initialState);
    const result = await runStructuredPrompt({
      asset: sceneState3dMarkersPrompt,
      promptInput: {
        sceneName: initialRow.name,
        stateLabel: initialState.label,
        sceneType: initialState.sceneType ?? initialRow.sceneType,
        environmentJson: JSON.stringify(environment),
        imageBase64: imageBuffer.toString("base64"),
        mimeType: sourceImage.mimeType,
      },
      options: {
        provider: options.provider,
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
          },
        });
        if (!row) {
          throw new AppError("没有找到这个场景。", 404);
        }
        return {
          raw: row.statesJson,
          fallbackStates: normalizeSceneStates(parseStates(row.statesJson), row),
          normalize: (states: StoryAssetState[]) => normalizeSceneStates(states, row),
        };
      },
      write: async (expectedRaw, nextRaw) => {
        const writeResult = await prisma.novelScene.updateMany({
          where: { id: sceneId, novelId, statesJson: expectedRaw },
          data: { statesJson: nextRaw },
        });
        return writeResult.count === 1;
      },
      patch: (state) => {
        if (stateImageFingerprint(state) !== imageFingerprint) {
          throw new AppError("场景图片已更新，请重新识别空间标记。", 409);
        }
        return { ...state, scene3dMarkers: markerSet };
      },
    });

    return storySettingsService.getScene(novelId, sceneId);
  }
}

export const storyScene3dMarkerService = new StoryScene3dMarkerService();
