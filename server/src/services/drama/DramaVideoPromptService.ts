import { prisma } from "../../db/prisma";
import { runStructuredPrompt } from "../../prompting/core/promptRunner";
import { dramaVideoPromptPrompt } from "../../prompting/prompts/drama/drama.prompts";
import { dramaContextAssembler } from "./DramaContextAssembler";
import { safeJsonParse } from "./utils/json";
import { resolveDefaultVideoProvider, videoProviderRegistry } from "./video/VideoProviderPort";
import { dramaShotKeyframeService } from "./visual/DramaShotKeyframeService";
import type { DramaLLMOptions } from "./DramaStrategyService";
import type { VideoGenerationRequest } from "./video/VideoProviderPort";

interface PortraitReferenceData {
  status?: string;
  url?: string;
}

interface KeyframeReferenceData {
  status?: string;
  url?: string;
}

interface VideoPromptReferenceSource {
  projectId: string;
  shotId?: string | null;
}

function normalizeReferenceKey(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed.toLowerCase() : null;
}

function parseCharacterRefs(raw: string | null | undefined): string[] {
  const parsed = safeJsonParse<unknown>(raw, raw ?? []);
  if (Array.isArray(parsed)) {
    return parsed
      .map((item) => typeof item === "string" ? item.trim() : "")
      .filter(Boolean);
  }
  if (typeof parsed === "string" && parsed.trim()) {
    return [parsed.trim()];
  }
  return [];
}

function normalizeRefImageUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed.startsWith("/")) {
    return trimmed;
  }
  const baseUrl = process.env.DRAMA_VIDEO_REF_IMAGE_BASE_URL?.trim() || process.env.APP_BASE_URL?.trim();
  if (!baseUrl) {
    return trimmed;
  }
  try {
    return new URL(trimmed, baseUrl).toString();
  } catch {
    return trimmed;
  }
}

async function collectShotReferenceImages(videoPrompt: VideoPromptReferenceSource): Promise<string[]> {
  if (!videoPrompt.shotId) {
    return [];
  }
  const shot = await prisma.dramaShot.findUnique({
    where: { id: videoPrompt.shotId },
    select: { characterRefs: true, keyframeData: true },
  });
  const urls: string[] = [];
  const keyframe = safeJsonParse<KeyframeReferenceData>(shot?.keyframeData, {});
  if (keyframe.status === "done" && typeof keyframe.url === "string" && keyframe.url.trim()) {
    urls.push(normalizeRefImageUrl(keyframe.url));
  }
  const refs = parseCharacterRefs(shot?.characterRefs);
  if (!refs.length) {
    return [...new Set(urls)];
  }
  const refKeys = new Set(refs.map(normalizeReferenceKey).filter((key): key is string => Boolean(key)));
  const characters = await prisma.dramaCharacter.findMany({
    where: { projectId: videoPrompt.projectId },
    select: { id: true, name: true, portraitData: true },
  });
  for (const character of characters) {
    const idKey = normalizeReferenceKey(character.id);
    const nameKey = normalizeReferenceKey(character.name);
    if ((!idKey || !refKeys.has(idKey)) && (!nameKey || !refKeys.has(nameKey))) {
      continue;
    }
    const portrait = safeJsonParse<PortraitReferenceData>(character.portraitData, {});
    const url = typeof portrait.url === "string" ? normalizeRefImageUrl(portrait.url) : "";
    if (portrait.status === "done" && url) {
      urls.push(url);
    }
  }
  return [...new Set(urls)];
}

export class DramaVideoPromptService {
  async generateVideoPromptForShot(projectId: string, shotId: string, options: DramaLLMOptions = {}) {
    const shot = await prisma.dramaShot.findUnique({
      where: { id: shotId },
      include: { storyboard: { include: { episode: true } } },
    });
    if (!shot) {
      throw new Error(`未找到短剧镜头：${shotId}`);
    }
    const context = await dramaContextAssembler.buildEpisodeContext(projectId, shot.storyboard.episode.order);
    const result = await runStructuredPrompt({
      asset: dramaVideoPromptPrompt,
      promptInput: {
        shotJson: JSON.stringify({
          order: shot.order,
          shotSize: shot.shotSize,
          cameraMove: shot.cameraMove,
          durationSec: shot.durationSec,
          location: shot.location,
          action: shot.action,
          dialogue: shot.dialogue,
          characterRefs: shot.characterRefs,
          characterStates: shot.characterStates,
          visualPrompt: shot.visualPrompt,
        }, null, 2),
        charactersDigest: context.charactersDigest,
      },
      options: {
        provider: options.provider,
        model: options.model,
        temperature: options.temperature ?? 0.35,
      },
    });
    const output = result.output;
    const latest = await prisma.dramaVideoPrompt.findFirst({
      where: { projectId, shotId },
      orderBy: [{ version: "desc" }, { createdAt: "desc" }],
    });
    const version = (latest?.version ?? 0) + 1;
    return prisma.$transaction(async (tx) => {
      const created = await tx.dramaVideoPrompt.create({
        data: {
          projectId,
          episodeId: shot.storyboard.episodeId,
          shotId,
          provider: resolveDefaultVideoProvider(),
          prompt: output.prompt,
          negativePrompt: output.negativePrompt ?? null,
          // 分镜视频统一走横屏时间轴；模型返回的旧画幅不能覆盖产品画幅契约。
          aspectRatio: "16:9",
          durationSec: output.durationSec ?? shot.durationSec,
          status: "prompted",
          version,
        },
      });
      await tx.dramaVideoPrompt.updateMany({
        where: {
          projectId,
          shotId,
          id: { not: created.id },
          status: { not: "superseded" },
        },
        data: {
          status: "superseded",
          supersededById: created.id,
        },
      });
      return created;
    });
  }

  async createProviderTask(videoPromptId: string, provider?: string) {
    const videoPrompt = await prisma.dramaVideoPrompt.findUnique({ where: { id: videoPromptId } });
    if (!videoPrompt) {
      throw new Error(`未找到视频提示词：${videoPromptId}`);
    }
    if (videoPrompt.status === "superseded") {
      throw new Error("该视频提示词已有新版，请使用当前版本创建视频任务。");
    }
    const resolvedProvider = provider?.trim() || resolveDefaultVideoProvider();
    const adapter = videoProviderRegistry.resolve(resolvedProvider);
    const refImages = adapter.supportsRefImages ? await collectShotReferenceImages(videoPrompt) : [];
    const request: VideoGenerationRequest = {
      prompt: videoPrompt.prompt,
      negativePrompt: videoPrompt.negativePrompt,
      aspectRatio: videoPrompt.aspectRatio,
      durationSec: videoPrompt.durationSec,
    };
    if (refImages.length) {
      request.refImages = refImages;
    }
    if (videoPrompt.shotId) {
      // 本地合成通道：直接给首帧图本地路径与台词配音，避免绕 HTTP 下载自己。
      const shot = await prisma.dramaShot.findUnique({
        where: { id: videoPrompt.shotId },
        select: { keyframeData: true, dialogueAudioData: true },
      });
      const keyframePath = await dramaShotKeyframeService.resolveExistingKeyframePath(videoPrompt.shotId);
      if (keyframePath) {
        request.localImagePaths = [keyframePath.filePath];
      }
      const audioItems = safeJsonParse<{ items?: Array<{ audioUrl?: unknown }> } | null>(shot?.dialogueAudioData, null);
      const audioDataUrls = (audioItems?.items ?? [])
        .map((item) => (typeof item.audioUrl === "string" && item.audioUrl.startsWith("data:") ? item.audioUrl : ""))
        .filter(Boolean);
      if (audioDataUrls.length > 0) {
        request.audioDataUrls = audioDataUrls;
      }
    }
    const result = await adapter.createTask(request);
    return prisma.dramaVideoPrompt.update({
      where: { id: videoPromptId },
      data: {
        provider: resolvedProvider,
        providerTaskId: result.providerTaskId,
        status: result.status,
        resultUrl: result.resultUrl ?? null,
        failureReason: result.failureReason ?? null,
        providerResult: JSON.stringify(result),
      },
    });
  }

  async refreshProviderTask(videoPromptId: string) {
    const videoPrompt = await prisma.dramaVideoPrompt.findUnique({ where: { id: videoPromptId } });
    if (!videoPrompt?.providerTaskId) {
      throw new Error(`视频提示词尚未创建 provider 任务：${videoPromptId}`);
    }
    const adapter = videoProviderRegistry.resolve(videoPrompt.provider);
    const result = await adapter.getTask(videoPrompt.providerTaskId);
    return prisma.dramaVideoPrompt.update({
      where: { id: videoPromptId },
      data: {
        status: result.status,
        resultUrl: result.resultUrl ?? null,
        failureReason: result.failureReason ?? null,
        providerResult: JSON.stringify(result),
      },
    });
  }
}

export const dramaVideoPromptService = new DramaVideoPromptService();
