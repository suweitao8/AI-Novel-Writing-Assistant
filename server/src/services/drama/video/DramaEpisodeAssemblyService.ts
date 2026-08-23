import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { prisma } from "../../../db/prisma";
import { getAudioModelProvider } from "../../../llm/modelCategories";
import { AppError } from "../../../middleware/errorHandler";
import { safeJsonParse } from "../utils/json";
import { isRealTTSProvider } from "../audio/TTSProviderPort";
import { dramaShotKeyframeService } from "../visual/DramaShotKeyframeService";
import { resolveGeneratedVideosRoot } from "./LocalFfmpegVideoProvider";
import {
  DramaRemotionEpisodeAssembler,
  type DramaAssemblyAudioLine,
  type DramaAssemblyShot,
} from "./DramaRemotionEpisodeAssembler";
import type { DramaSubtitleType } from "./dramaVideoTimeline";
import { audioFileExtensionFromDataUrl, type DramaRenderProfile } from "./renderProfile";
import { getConfiguredDramaRenderProfile } from "../../settings/DramaVideoRenderProfileSettingsService";
import {
  assertFfmpegAvailable,
  ensureDir,
  ffprobeDuration,
  resolveFfmpegBin,
  runVideoProcess,
} from "./ffmpegUtils";
import {
  mapDramaVideoTasksInOrder,
  resolveDramaVideoPreparationConcurrency,
} from "./videoProcessingConcurrency";
import {
  DramaAssemblyProgressTracker,
  type DramaAssemblyProgressState,
} from "./assemblyJobProgress";

// 漫剧整集合成：Remotion 负责唯一的画面时间轴，ffmpeg 只负责音频规范化、最终封装与探测。
// 这样每一镜的画面不再经过逐镜编码再 concat，成片合同也由 profile + ffprobe 在出口处校验。

const STALE_JOB_MS = 10 * 60_000;

export interface DramaAssembledVideoData {
  status: "assembling" | "done" | "error";
  videoUrl?: string;
  srtUrl?: string;
  durationSec?: number;
  shotCount?: number;
  burnedSubtitles?: boolean;
  generatedAt?: string;
  error?: string;
  warnings?: string[];
}

export interface DramaEpisodeAssemblyOptions {
  burnSubtitles?: boolean;
  includeTitleCard?: boolean;
  includeEndCard?: boolean;
}

interface AssemblyShotPlan extends DramaAssemblyShot {
  shotId: string;
  order: number;
  targetDurationSec: number;
}

interface AssemblyJobProgress extends DramaAssemblyProgressState {
  total: number;
  done: number;
  failed: number;
  skipped: number;
  failedShotIds: string[];
  errors: Array<{ shotId: string; message: string }>;
  provider?: string;
  videoUrl?: string;
  srtUrl?: string;
  durationSec?: number;
  error?: string;
}

interface ShotLike {
  id: string;
  order: number;
  durationSec?: number | null;
  dialogue?: string | null;
  action?: string | null;
  location?: string | null;
  keyframeData?: string | null;
  dialogueAudioData?: string | null;
}

export class DramaEpisodeAssemblyService {
  private readonly runningJobs = new Set<string>();
  private readonly assembler = new DramaRemotionEpisodeAssembler();

  async getAssemblyStatus(projectId: string, order: number) {
    const episode = await this.loadEpisode(projectId, order);
    const renderProfile = await getConfiguredDramaRenderProfile();
    const shots = episode.storyboards[0]?.shots ?? [];
    const promptByShot = this.buildPromptByShot(episode.videoPrompts ?? []);
    let withVideoClip = 0;
    let withKeyframeOnly = 0;
    let withoutVisual = 0;
    let withoutAudio = 0;
    for (const shot of shots) {
      const prompt = promptByShot.get(shot.id);
      const keyframe = safeJsonParse<{ status?: string; url?: string }>(shot.keyframeData, {});
      if (prompt?.status === "succeeded" && prompt.resultUrl?.trim()) {
        withVideoClip += 1;
      } else if (keyframe.status === "done" && keyframe.url?.trim()) {
        withKeyframeOnly += 1;
      } else {
        withoutVisual += 1;
      }
      const audio = safeJsonParse<{
        status?: string;
        provider?: string;
        items?: Array<{ audioUrl?: string; provider?: string }>;
      }>(shot.dialogueAudioData, {});
      const expectedProvider = getAudioModelProvider();
      const hasRealAudio = audio.status === "done"
        && audio.provider === expectedProvider
        && isRealTTSProvider(expectedProvider)
        && Boolean(audio.items?.length)
        && audio.items?.every((item) => item.provider === expectedProvider && item.audioUrl?.startsWith("data:"));
      if (!hasRealAudio) {
        withoutAudio += 1;
      }
    }
    const activeJob = await prisma.dramaBatchJob.findFirst({
      where: {
        episodeId: episode.id,
        type: "full_episode",
        status: { in: ["pending", "running"] },
      },
      orderBy: { createdAt: "desc" },
    });
    return {
      episodeId: episode.id,
      order,
      renderProfile,
      shotCount: shots.length,
      clips: { withVideoClip, withKeyframeOnly, withoutVisual },
      withoutAudioShotCount: withoutAudio,
      canAssemble: shots.length > 0,
      assembled: this.readAssembled(episode.assembledVideoData),
      activeJob: activeJob ?? null,
    };
  }

  async startAssembly(projectId: string, order: number, options: DramaEpisodeAssemblyOptions = {}) {
    const episode = await this.loadEpisode(projectId, order);
    const shots = episode.storyboards[0]?.shots ?? [];
    if (!shots.length) {
      throw new AppError(`第 ${order} 集还没有分镜，不能合成整集。`, 400);
    }
    await assertFfmpegAvailable();
    await this.failStaleJobs(episode.id);
    const renderProfile = await getConfiguredDramaRenderProfile();

    const running = await prisma.dramaBatchJob.findFirst({
      where: { episodeId: episode.id, type: "full_episode", status: { in: ["pending", "running"] } },
    });
    if (running) {
      throw new AppError("整集合成正在进行中，请等待完成后再试。", 409);
    }

    const progress: AssemblyJobProgress = {
      total: shots.length + (options.includeTitleCard === false ? 0 : 1) + (options.includeEndCard === false ? 0 : 1),
      done: 0,
      failed: 0,
      skipped: 0,
      failedShotIds: [],
      errors: [],
      phase: "prepare",
      provider: "remotion",
    };
    const job = await prisma.dramaBatchJob.create({
      data: {
        projectId,
        episodeId: episode.id,
        type: "full_episode",
        status: "running",
        progress: JSON.stringify(progress),
      },
    });
    await this.writeAssembled(episode.id, { status: "assembling", generatedAt: new Date().toISOString() });
    void this.runAssemblyJob(job.id, projectId, order, {
      burnSubtitles: options.burnSubtitles ?? true,
      includeTitleCard: options.includeTitleCard ?? true,
      includeEndCard: options.includeEndCard ?? true,
    }, renderProfile).catch(() => undefined);
    return job;
  }

  private async runAssemblyJob(
    jobId: string,
    projectId: string,
    order: number,
    options: Required<DramaEpisodeAssemblyOptions>,
    profile: DramaRenderProfile,
  ) {
    if (this.runningJobs.has(jobId)) {
      return;
    }
    this.runningJobs.add(jobId);
    const workDir = path.join(os.tmpdir(), `cd-asm-${jobId.replace(/[^a-zA-Z0-9_-]/g, "")}`);
    let progress: AssemblyJobProgress | undefined;
    let progressTracker: DramaAssemblyProgressTracker<AssemblyJobProgress> | undefined;
    try {
      const episode = await this.loadEpisode(projectId, order);
      const shots = episode.storyboards[0]?.shots ?? [];
      await ensureDir(workDir);
      const warnings: string[] = [];
      const plans: AssemblyShotPlan[] = [];
      const total = shots.length + (options.includeTitleCard ? 1 : 0) + (options.includeEndCard ? 1 : 0);
      progress = {
        total,
        done: 0,
        failed: 0,
        skipped: 0,
        failedShotIds: [],
        errors: [],
        phase: "prepare",
        provider: "remotion",
      };
      progressTracker = new DramaAssemblyProgressTracker(progress, (snapshot) => this.updateJob(jobId, snapshot));
      await progressTracker.enqueue();
      const preparedPlans = await mapDramaVideoTasksInOrder(
        shots,
        resolveDramaVideoPreparationConcurrency(),
        async (shot, index) => {
          const plan = await this.buildShotPlan(shot, index, workDir, warnings);
          if (!progress) {
            throw new Error("整集合成进度未初始化。");
          }
          progressTracker?.incrementDone();
          return plan;
        },
      );
      plans.push(...preparedPlans);
      await progressTracker.flush();

      const finalFileId = `ep_${episode.id}_${Date.now()}`;
      const outputRoot = resolveGeneratedVideosRoot();
      await ensureDir(outputRoot);
      const finalVideoPath = path.join(outputRoot, `${finalFileId}.mp4`);
      const finalSrtPath = path.join(outputRoot, `${finalFileId}.srt`);

      const result = await this.assembler.assemble({
        jobId,
        episodeTitle: episode.project.title,
        episodeOrder: order,
        profile,
        shots: plans,
        includeTitleCard: options.includeTitleCard,
        includeEndCard: options.includeEndCard,
        showSubtitles: options.burnSubtitles,
        outputPath: finalVideoPath,
        srtPath: finalSrtPath,
        workDir,
        warnings,
        onPhase: async (phase) => {
          await progressTracker?.transition(phase);
          if (!progress) {
            return;
          }
          if (phase === "render") {
            progress.done = Math.max(progress.done, Math.min(total - 1, Math.ceil(total * 0.75)));
          } else if (phase === "mux") {
            progress.done = Math.max(progress.done, Math.min(total - 1, Math.ceil(total * 0.9)));
          }
          await progressTracker?.enqueue();
        },
      });

      const assembled: DramaAssembledVideoData = {
        status: "done",
        videoUrl: `/api/drama/video-files/${finalFileId}`,
        srtUrl: `/api/drama/subtitle-files/${finalFileId}`,
        durationSec: result.durationSec,
        shotCount: plans.length,
        burnedSubtitles: options.burnSubtitles,
        generatedAt: new Date().toISOString(),
        warnings: result.warnings,
      };
      await this.writeAssembled(episode.id, assembled);

      await progressTracker?.transition("done");
      progressTracker?.finish();
      progress.phase = "done";
      progress.done = total;
      progress.videoUrl = assembled.videoUrl;
      progress.srtUrl = assembled.srtUrl;
      progress.durationSec = assembled.durationSec;
      await progressTracker?.enqueue();
      // 缺分镜画面、缺配音或其它可恢复素材问题只进入 warnings，不得把可播放成片标成 failed。
      await prisma.dramaBatchJob.update({ where: { id: jobId }, data: { status: "done" } });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (progress) {
        progressTracker?.finish();
        progress.error = message.slice(0, 500);
        await progressTracker?.enqueue();
      }
      await progressTracker?.flush();
      await prisma.dramaBatchJob.update({
        where: { id: jobId },
        data: {
          status: "failed",
          progress: JSON.stringify(progress ?? { phase: "mux", error: message.slice(0, 500) }),
        },
      }).catch(() => undefined);
      const episode = await prisma.dramaEpisode.findUnique({ where: { projectId_order: { projectId, order } } });
      if (episode) {
        await this.writeAssembled(episode.id, {
          status: "error",
          error: message.slice(0, 500),
          generatedAt: new Date().toISOString(),
        });
      }
      throw error;
    } finally {
      this.runningJobs.delete(jobId);
      await fs.rm(workDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  private async buildShotPlan(
    shot: ShotLike,
    index: number,
    workDir: string,
    warnings: string[],
  ): Promise<AssemblyShotPlan> {
    const audio = safeJsonParse<{
      status?: string;
      provider?: string;
      items?: Array<{
        lineIndex?: number;
        speaker?: string;
        type?: DramaSubtitleType;
        text?: string;
        audioUrl?: string;
        durationSec?: number;
        provider?: string;
      }>;
    }>(shot.dialogueAudioData, {});
    const expectedProvider = getAudioModelProvider();
    const audioItems = (
      audio.status === "done"
      && audio.provider === expectedProvider
      && isRealTTSProvider(expectedProvider)
        ? audio.items ?? []
        : []
    )
      .filter((item) => item
        && item.provider === expectedProvider
        && typeof item.text === "string"
        && item.text.trim()
        && typeof item.audioUrl === "string"
        && item.audioUrl.startsWith("data:"))
      .sort((a, b) => (a.lineIndex ?? 0) - (b.lineIndex ?? 0));

    const audioLines: DramaAssemblyAudioLine[] = [];
    for (let lineIndex = 0; lineIndex < audioItems.length; lineIndex += 1) {
      const item = audioItems[lineIndex]!;
      const buffer = dataUrlToBuffer(item.audioUrl!);
      if (!buffer?.length) {
        continue;
      }
      const ext = audioFileExtensionFromDataUrl(item.audioUrl!);
      const audioPath = path.join(workDir, `audio-${index}-${lineIndex}.${ext}`);
      await fs.writeFile(audioPath, buffer);
      const probed = await ffprobeDuration(audioPath);
      if (!probed) {
        await fs.unlink(audioPath).catch(() => undefined);
        continue;
      }
      const speaker = item.speaker?.trim() || undefined;
      audioLines.push({
        text: item.text!,
        speaker,
        type: item.type ?? (speaker && speaker !== "旁白" ? "dialogue" : "narration"),
        durationSec: Math.round(probed * 100) / 100,
        sourcePath: audioPath,
      });
    }

    if (audioItems.length === 0 || audioLines.length !== audioItems.length) {
      throw new Error(`镜头 ${shot.order} 没有可测量的真实配音时长，请先生成配音。`);
    }
    const audioTotal = audioLines.reduce((sum, line) => sum + line.durationSec, 0);
    const targetDurationSec = Math.round(audioTotal * 100) / 100;

    const imagePath = await this.resolveVisualSource(shot, index, workDir, warnings);
    if (!imagePath) {
      warnings.push(`镜头 ${shot.order} 没有可用分镜画面，Remotion 将使用占位画面。`);
    }

    return {
      shotId: shot.id,
      order: shot.order,
      durationSec: targetDurationSec,
      targetDurationSec,
      imagePath,
      detail: [shot.location?.trim(), shot.action?.trim()].filter(Boolean).join(" · ").slice(0, 180) || undefined,
      audioLines,
    };
  }

  private async resolveVisualSource(
    shot: ShotLike,
    index: number,
    workDir: string,
    warnings: string[],
  ): Promise<string | null> {
    const keyframe = await dramaShotKeyframeService.resolveExistingKeyframePath(shot.id);
    if (keyframe) {
      return keyframe.filePath;
    }

    // 兼容已有本地视频结果：只取第一帧作为 Remotion 的镜头底图，最终画面编码仍由 Remotion 完成。
    const prompt = await prisma.dramaVideoPrompt.findFirst({
      where: { shotId: shot.id, status: { not: "superseded" } },
      orderBy: [{ version: "desc" }, { createdAt: "desc" }],
    });
    const resultUrl = prompt?.status === "succeeded" ? prompt.resultUrl?.trim() : "";
    if (resultUrl) {
      const localMatch = /^\/api\/drama\/video-files\/([a-zA-Z0-9_-]+)$/.exec(resultUrl);
      if (localMatch) {
        const localPath = path.join(resolveGeneratedVideosRoot(), `${localMatch[1]}.mp4`);
        try {
          await fs.access(localPath);
          return this.extractVideoFrame(localPath, path.join(workDir, `source-frame-${index}.png`));
        } catch {
          warnings.push(`镜头 ${shot.order} 的已有视频片段文件已丢失。`);
        }
      }
    }
    return null;
  }

  private async extractVideoFrame(inputPath: string, outputPath: string): Promise<string | null> {
    const result = await runVideoProcess(resolveFfmpegBin(), [
      "-y",
      "-i", inputPath,
      "-frames:v", "1",
      "-vf", "scale=1536:864:force_original_aspect_ratio=increase,crop=1536:864",
      outputPath,
    ]);
    return result.code === 0 ? outputPath : null;
  }

  private async loadEpisode(projectId: string, order: number) {
    const episode = await prisma.dramaEpisode.findUnique({
      where: { projectId_order: { projectId, order } },
      include: {
        project: { select: { title: true } },
        storyboards: {
          orderBy: { createdAt: "desc" },
          include: { shots: { orderBy: { order: "asc" } } },
        },
        videoPrompts: { orderBy: [{ version: "desc" }, { createdAt: "desc" }] },
      },
    });
    if (!episode) {
      throw new AppError(`未找到短剧第 ${order} 集。`, 404);
    }
    return episode;
  }

  private buildPromptByShot(videoPrompts: Array<{ shotId: string | null; status: string; resultUrl: string | null; version: number }>) {
    const map = new Map<string, { shotId: string; status: string; resultUrl: string | null; version: number }>();
    for (const prompt of videoPrompts) {
      const shotId = prompt.shotId;
      if (shotId && prompt.status !== "superseded" && !map.has(shotId)) {
        map.set(shotId, { ...prompt, shotId });
      }
    }
    return map;
  }

  private readAssembled(raw: string | null | undefined): DramaAssembledVideoData | null {
    return safeJsonParse<DramaAssembledVideoData | null>(raw, null);
  }

  private async writeAssembled(episodeId: string, data: DramaAssembledVideoData): Promise<void> {
    await prisma.dramaEpisode.update({
      where: { id: episodeId },
      data: { assembledVideoData: JSON.stringify(data) },
    });
  }

  private async updateJob(jobId: string, progress: AssemblyJobProgress): Promise<void> {
    await prisma.dramaBatchJob.update({
      where: { id: jobId },
      data: { progress: JSON.stringify(progress) },
    }).catch(() => undefined);
  }

  private async failStaleJobs(episodeId: string): Promise<void> {
    const staleBefore = new Date(Date.now() - STALE_JOB_MS);
    const stale = await prisma.dramaBatchJob.findMany({
      where: {
        episodeId,
        type: "full_episode",
        status: { in: ["pending", "running"] },
        updatedAt: { lt: staleBefore },
      },
    });
    for (const job of stale) {
      await prisma.dramaBatchJob.update({
        where: { id: job.id },
        data: {
          status: "failed",
          progress: JSON.stringify({ phase: "mux", error: "服务重启导致合成中断，请重新合成。" }),
        },
      }).catch(() => undefined);
    }
  }
}

function dataUrlToBuffer(dataUrl: string): Buffer | null {
  const match = /^data:[^;]+;base64,(.+)$/s.exec(dataUrl.trim());
  return match ? Buffer.from(match[1]!, "base64") : null;
}

export const dramaEpisodeAssemblyService = new DramaEpisodeAssemblyService();
