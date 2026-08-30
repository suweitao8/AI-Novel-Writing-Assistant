// 通用环境资产的状态图生成：完全走 services/image 的 runtime 适配器模式
// （模板 = StoryAssetImageService.generateSceneImage 的固定路径 adapter），
// 宿主状态存在 AppSetting 的环境资产文档里，不进入小说域链路。
import path from "path";
import fs from "node:fs";

import { AppError } from "../../middleware/errorHandler";
import { resolveGeneratedImagesRoot } from "../../runtime/appPaths";
import {
  IMAGE_GENERATION_CANCELLED_MESSAGE,
  runImageGeneration,
  type GeneratedImageState,
  type ImageTargetAdapter,
} from "../image/runtime";
import { resolveAssetImageProvider } from "../image/assetProviderRouting";
import { IMAGE_SPECS } from "../image/imageSpecs";
import { buildStateImagePrompt } from "../image/storyStateImagePrompt";
import {
  ROOM_ARCHITECTURE_NEGATIVE_PROMPT,
} from "../image/roomArchitecture";
import {
  combineAssetStyleAvoidInstructions,
  DEFAULT_DRAMA_VISUAL_STYLE_ID,
  SCENE_PANORAMA_LAYOUT_NEGATIVE_PROMPT,
  buildAssetStylePromptLines,
} from "../drama/visual/dramaVisualStyles";
import {
  resolveDramaArtStyleContext,
} from "../drama/visual/dramaArtStyleResolver";
import {
  getStudioEnvironmentAssetDocument,
  getStoredStudioEnvironmentAsset,
  resolveStudioEnvironmentEffectiveState,
  updateStudioEnvironmentStateImage,
} from "./StudioEnvironmentAssetSettingsService";
import type {
  StudioEnvironmentAsset,
  StudioEnvironmentAssetState,
  StudioEnvironmentId,
} from "@ai-novel/shared/types/studioEnvironmentAssets";

const ENVIRONMENT_IMAGES_DIR = "studio-environments";

function environmentStateImageDir(environmentId: StudioEnvironmentId, stateId: string): string {
  return path.join(resolveGeneratedImagesRoot(), ENVIRONMENT_IMAGES_DIR, environmentId, stateId);
}

export function studioEnvironmentStateImageUrl(environmentId: string, stateId: string): string {
  return `/api/settings/environment-assets/${encodeURIComponent(environmentId)}/states/${encodeURIComponent(stateId)}/image`;
}

/** 只允许清除用户当时看到的那次失败；若已出现新错误则保留，避免把没见过的新错误悄悄关掉。 */
export function canDismissStudioEnvironmentImageError(
  image: StudioEnvironmentAssetState["image"],
  expectedError: string,
  expectedAttemptId?: string,
): boolean {
  if (image?.status !== "error") return false;
  if (image.error !== expectedError) return false;
  return expectedAttemptId === undefined || image.attemptId === expectedAttemptId;
}

export async function resolveStudioEnvironmentStateImagePath(
  environmentId: StudioEnvironmentId,
  stateId: string,
): Promise<{ filePath: string; mimeType: string }> {
  const dir = environmentStateImageDir(environmentId, stateId);
  for (const ext of ["png", "jpg", "jpeg", "webp"]) {
    const filePath = path.join(dir, `environment-panorama.${ext}`);
    if (fs.existsSync(filePath)) {
      const mimeType = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
      return { filePath, mimeType };
    }
  }
  throw new AppError("环境全景图未生成。", 404);
}

async function removeOldFiles(dir: string, base: string, keepExt: string): Promise<void> {
  try {
    for (const entry of await fs.promises.readdir(dir)) {
      if (entry.startsWith(base) && !entry.endsWith(keepExt)) {
        await fs.promises.rm(path.join(dir, entry), { force: true });
      }
    }
  } catch {
    // 目录尚不存在时无需清理。
  }
}

interface EnvironmentGenerationTarget {
  environment: StudioEnvironmentAsset;
  state: StudioEnvironmentAssetState;
}

function requireEnvironmentState(
  document: { environments: Record<StudioEnvironmentId, StudioEnvironmentAsset> },
  environmentId: string,
  stateId: string,
): EnvironmentGenerationTarget {
  const environment = getStoredStudioEnvironmentAsset(document, environmentId);
  const state = environment.states.find((item) => item.id === stateId);
  if (!state) {
    throw new AppError("没有找到这个环境状态。", 404);
  }
  return { environment, state };
}

export class StudioEnvironmentStateImageService {
  private readonly inFlight = new Map<string, AbortController>();

  /** 同步在请求内完成生成；同一状态重复发起时直接返回当前文档（幂等）。 */
  async generateStateImage(environmentId: StudioEnvironmentId, stateId: string): Promise<StudioEnvironmentAsset> {
    const attemptKey = `${environmentId}:${stateId}`;
    const existingFlight = this.inFlight.get(attemptKey);
    if (existingFlight) {
      const document = await getStudioEnvironmentAssetDocument();
      return getStoredStudioEnvironmentAsset(document, environmentId);
    }

    const current = await getStudioEnvironmentAssetDocument();
    const { environment, state } = requireEnvironmentState(current, environmentId, stateId);
    const attemptId = `studio-env-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const controller = new AbortController();
    this.inFlight.set(attemptKey, controller);

    try {
      // 生成前把状态置为 generating；runtime 会继续用同一 adapter 覆写 done/error。
      await updateStudioEnvironmentStateImage(environmentId, stateId, (currentImage) => ({
        ...(currentImage ?? { status: "idle" as const }),
        status: "generating",
        attemptId,
        error: undefined,
      }));

      const styleContext = await resolveDramaArtStyleContext({
        visualStyle: null,
        sourceRef: null,
        pinnedStyle: state.eraStyle?.trim() || DEFAULT_DRAMA_VISUAL_STYLE_ID,
        pinnedMissFallbackStyle: DEFAULT_DRAMA_VISUAL_STYLE_ID,
      });
      const styleLines = buildAssetStylePromptLines(
        "scene",
        styleContext.assets.scene,
        styleContext.specific,
        styleContext.renderFamily,
      );
      // 环境状态的时间/天气/时代风格与场景状态同一套语义；室内布局契约（家具不得
      // 越过地平线）按环境语义映射：interior 走室内行，其余走室外行。
      const prompt = buildStateImagePrompt(
        {
          kind: "scene",
          assetName: environment.label,
          baseAppearance: environment.description ?? null,
          state: {
            label: state.label,
            description: state.description ?? "",
            imagePrompt: state.imagePrompt ?? "",
            ageGroup: undefined,
            sceneType: "exterior",
            timeOfDay: state.timeOfDay ?? undefined,
            weather: state.weather ?? undefined,
          },
          hasReference: Boolean(state.referenceStateId),
        },
        styleLines,
      );
      const negativePrompt = [
        combineAssetStyleAvoidInstructions(
          styleContext.assets.scene,
          styleContext.specific,
          styleContext.renderFamily,
        ),
        SCENE_PANORAMA_LAYOUT_NEGATIVE_PROMPT,
        ROOM_ARCHITECTURE_NEGATIVE_PROMPT,
      ].filter(Boolean).join(", ");

      const referenceImage = await this.resolveReferenceImagePath(environmentId, environment, state);

      const adapter: ImageTargetAdapter<GeneratedImageState> = {
        kind: `studio.environment:${environmentId}:${stateId}`,
        loadState: async () => {
          const document = await getStudioEnvironmentAssetDocument();
          const target = requireEnvironmentState(document, environmentId, stateId);
          const image = target.state.image;
          if (image?.status === "generating" || image?.status === "done" || image?.status === "error") {
            return {
              status: image.status,
              url: image.url,
              prompt,
              provider: undefined,
              generatedAt: image.generatedAt,
              attemptId: image.attemptId,
              error: image.error,
            } satisfies GeneratedImageState;
          }
          return { status: "idle" };
        },
        saveState: async (next) => {
          await updateStudioEnvironmentStateImage(environmentId, stateId, () => ({
            status: next.status,
            url: next.url,
            generatedAt: next.generatedAt,
            attemptId: next.attemptId,
            error: next.error,
          }));
        },
        diskPath: (ext) => path.join(environmentStateImageDir(environmentId, stateId), `environment-panorama.${ext}`),
        publicUrl: () => studioEnvironmentStateImageUrl(environmentId, stateId),
        cleanupOtherExts: (keepExt) => removeOldFiles(environmentStateImageDir(environmentId, stateId), "environment-panorama", keepExt),
      };

      await runImageGeneration(adapter, {
        provider: resolveAssetImageProvider({ kind: "scene", hasReference: Boolean(referenceImage) }),
        prompt,
        size: IMAGE_SPECS.scenePanorama,
        negativePrompt,
        signal: controller.signal,
        attemptId,
        ...(referenceImage ? { refImagePaths: [referenceImage] } : {}),
      });

      if (controller.signal.aborted) {
        throw new AppError(IMAGE_GENERATION_CANCELLED_MESSAGE, 400);
      }
    } finally {
      this.inFlight.delete(attemptKey);
    }

    const document = await getStudioEnvironmentAssetDocument();
    return getStoredStudioEnvironmentAsset(document, environmentId);
  }

  async cancelStateImage(environmentId: StudioEnvironmentId, stateId: string): Promise<StudioEnvironmentAsset> {
    const controller = this.inFlight.get(`${environmentId}:${stateId}`);
    controller?.abort();
    const document = await getStudioEnvironmentAssetDocument();
    return getStoredStudioEnvironmentAsset(document, environmentId);
  }

  async dismissStateImageError(
    environmentId: StudioEnvironmentId,
    stateId: string,
    expectedError: string,
    expectedAttemptId?: string,
  ): Promise<StudioEnvironmentAsset> {
    const document = await getStudioEnvironmentAssetDocument();
    const { state } = requireEnvironmentState(document, environmentId, stateId);
    if (!canDismissStudioEnvironmentImageError(state.image, expectedError, expectedAttemptId)) {
      return getStoredStudioEnvironmentAsset(document, environmentId);
    }
    return updateStudioEnvironmentStateImage(environmentId, stateId, () => ({ status: "idle" }));
  }

  /** 参考图取同环境内参考状态的已生成本地文件；无可用参考时回落无参考生成。 */
  private async resolveReferenceImagePath(
    environmentId: StudioEnvironmentId,
    environment: StudioEnvironmentAsset,
    state: StudioEnvironmentAssetState,
  ): Promise<string | null> {
    const referenceId = state.referenceStateId?.trim();
    if (!referenceId) return null;
    const referenceState = environment.states.find((item) => item.id === referenceId);
    if (!referenceState || referenceState.image?.status !== "done" || !referenceState.image.url) {
      return null;
    }
    try {
      const resolved = await resolveStudioEnvironmentStateImagePath(environmentId, referenceState.id);
      return resolved.filePath;
    } catch {
      return null;
    }
  }
}

/** 供客户端解析该应用方向的环境源：生效状态（默认状态优先）的全景就绪时返回其 URL。 */
export async function getEffectiveStudioEnvironmentImageUrl(
  environmentId: StudioEnvironmentId,
): Promise<string | null> {
  const document = await getStudioEnvironmentAssetDocument();
  const environment = getStoredStudioEnvironmentAsset(document, environmentId);
  const state = resolveStudioEnvironmentEffectiveState(environment);
  if (state && state.image?.status === "done" && state.image.url) {
    return state.image.url;
  }
  return null;
}

export const studioEnvironmentStateImageService = new StudioEnvironmentStateImageService();
