import fs from "fs/promises";
import os from "os";
import path from "path";
import { prisma } from "../../../db/prisma";
import { AppError } from "../../../middleware/errorHandler";
import { safeJsonParse } from "../utils/json";
import { dramaShotKeyframeService } from "../visual/DramaShotKeyframeService";
import { resolveGeneratedVideosRoot } from "./LocalFfmpegVideoProvider";
import {
  assertFfmpegAvailable,
  ensureDir,
  escapeFilterPath,
  ffprobeDuration,
  resolveDrawtextFontFile,
  resolveFfmpegBin,
  runVideoProcess,
} from "./ffmpegUtils";
import { splitNarrationIntoSentences, wrapSubtitleText } from "./subtitleText";

// 漫剧整集合成（移植自 mydrama generators/video_composer.py + export/narrated_timeline.py）。
// 契约：
// - 时间轴由音频驱动：一行台词 = 一段音频 = 一条字幕，绝不二次切分文本。
// - 每个镜头先归一化为统一的 1080x1920/30fps/H.264+AAC 片段（时长精确对齐该镜音频总时长），
//   再用 concat demuxer 无损拼接；视频片段过长裁剪、缺口 ≤1.5x 变速补齐、>1.5x 冻结末帧。
// - 无视频片段的镜头退化为 首帧图 + Ken Burns 推拉（四效果按镜序轮换）；再退化为纯色卡。
// - 产物 mp4 + srt 落在 storage/generated-videos/，结果记录在 DramaEpisode.assembledVideoData。

const WIDTH = 1080;
const HEIGHT = 1920;
const FPS = 30;
const SUBTITLE_WRAP_CHARS = 18;
const SUBTITLE_FORCE_STYLE = "FontSize=44,Bold=1,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=2,Shadow=0,MarginV=140";
const TITLE_CARD_SEC = 3;
const END_CARD_SEC = 2;
const DURATION_TOLERANCE_SEC = 0.1;
const SPEED_STRETCH_LIMIT = 1.5;
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

interface AssemblyAudioLine {
  text: string;
  speaker?: string;
  durationSec: number;
}

interface AssemblyShotPlan {
  shotId: string;
  order: number;
  visualKind: "video" | "keyframe" | "card";
  videoClipPath: string | null;
  keyframePath: string | null;
  audioLines: AssemblyAudioLine[];
  audioInput: { kind: "file"; path: string } | { kind: "concat"; listPath: string } | null;
  targetDurationSec: number;
}

interface AssemblyJobProgress {
  total: number;
  done: number;
  failed: number;
  skipped: number;
  failedShotIds: string[];
  errors: Array<{ shotId: string; message: string }>;
  phase: "prepare" | "clips" | "concat" | "subtitles" | "done";
  provider?: string;
  videoUrl?: string;
  srtUrl?: string;
  durationSec?: number;
  error?: string;
}

interface SubtitleCue {
  startSec: number;
  endSec: number;
  text: string;
}

interface ShotLike {
  id: string;
  order: number;
  durationSec?: number | null;
  dialogue?: string | null;
  keyframeData?: string | null;
  dialogueAudioData?: string | null;
}

function dataUrlToBuffer(dataUrl: string): Buffer | null {
  const match = /^data:[^;]+;base64,(.+)$/s.exec(dataUrl.trim());
  return match ? Buffer.from(match[1]!, "base64") : null;
}

function toPosix(filePath: string): string {
  return filePath.replace(/\\/g, "/");
}

function concatListContent(filePaths: string[]): string {
  return filePaths.map((filePath) => `file '${toPosix(filePath).replace(/'/g, "'\\''")}'`).join("\n");
}

function normalizeDurationSec(value: number | null | undefined, fallback: number): number {
  return Number.isFinite(value) && Number(value) > 0 ? Number(value) : fallback;
}

function formatSrtTime(totalSeconds: number): string {
  const totalMs = Math.max(0, Math.round(totalSeconds * 1000));
  const hours = Math.floor(totalMs / 3_600_000);
  const minutes = Math.floor((totalMs % 3_600_000) / 60_000);
  const seconds = Math.floor((totalMs % 60_000) / 1000);
  const ms = totalMs % 1000;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
}

function buildSrt(cues: SubtitleCue[]): string {
  return cues.map((cue, index) => [
    String(index + 1),
    `${formatSrtTime(cue.startSec)} --> ${formatSrtTime(cue.endSec)}`,
    wrapSubtitleText(cue.text, SUBTITLE_WRAP_CHARS),
    "",
  ].join("\n")).join("\n");
}

/** Ken Burns 四效果按镜序轮换（移植自 mydrama KenBurnsEffect；pan 方向用 on 帧计数渐进，修正旧项目常量偏移的实现）。 */
function kenBurnsFilter(effectIndex: number, durationSec: number): string {
  const frames = Math.max(FPS, Math.round(durationSec * FPS));
  const base = `scale=${WIDTH * 2}:${HEIGHT * 2}:force_original_aspect_ratio=increase,crop=${WIDTH * 2}:${HEIGHT * 2}`;
  const tail = `s=${WIDTH}x${HEIGHT}:fps=${FPS}`;
  switch (effectIndex % 4) {
    case 0:
      return `${base},zoompan=z='min(zoom+0.001,1.2)':d=${frames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':${tail}`;
    case 1:
      return `${base},zoompan=z='if(lte(zoom,1.0),1.2,max(1.001,zoom-0.001))':d=${frames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':${tail}`;
    case 2:
      return `${base},zoompan=z=1.1:d=${frames}:x='iw/2-(iw/zoom/2)+(on/${frames})*(iw-iw/zoom)*0.5':y='ih/2-(ih/zoom/2)':${tail}`;
    default:
      return `${base},zoompan=z=1.1:d=${frames}:x='iw/2-(iw/zoom/2)-(on/${frames})*(iw-iw/zoom)*0.5':y='ih/2-(ih/zoom/2)':${tail}`;
  }
}

function buildVideoClipFilter(probedDurationSec: number, targetDurationSec: number): string {
  const normalize = `scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=increase,crop=${WIDTH}:${HEIGHT}`;
  const tail = `fps=${FPS},setsar=1,format=yuv420p`;
  if (probedDurationSec > 0 && targetDurationSec > probedDurationSec + DURATION_TOLERANCE_SEC) {
    const stretchRatio = targetDurationSec / probedDurationSec;
    if (stretchRatio <= SPEED_STRETCH_LIMIT) {
      return `${normalize},setpts=${stretchRatio.toFixed(4)}*PTS,${tail}`;
    }
    const freezeSec = targetDurationSec - probedDurationSec;
    return `${normalize},tpad=stop_mode=clone:stop_duration=${freezeSec.toFixed(3)},${tail}`;
  }
  return `${normalize},${tail}`;
}

export class DramaEpisodeAssemblyService {
  private readonly runningJobs = new Set<string>();

  async getAssemblyStatus(projectId: string, order: number) {
    const episode = await this.loadEpisode(projectId, order);
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
      const audio = safeJsonParse<{ status?: string; items?: unknown[] }>(shot.dialogueAudioData, {});
      if (audio.status !== "done" || !audio.items?.length) {
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

    const running = await prisma.dramaBatchJob.findFirst({
      where: { episodeId: episode.id, type: "full_episode", status: { in: ["pending", "running"] } },
    });
    if (running) {
      throw new AppError("整集合成正在进行中，请等待完成后再试。", 409);
    }

    const progress: AssemblyJobProgress = {
      total: shots.length,
      done: 0,
      failed: 0,
      skipped: 0,
      failedShotIds: [],
      errors: [],
      phase: "prepare",
      provider: "local_ffmpeg",
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
    }).catch(() => undefined);
    return job;
  }

  private async runAssemblyJob(
    jobId: string,
    projectId: string,
    order: number,
    options: Required<DramaEpisodeAssemblyOptions>,
  ) {
    if (this.runningJobs.has(jobId)) {
      return;
    }
    this.runningJobs.add(jobId);
    const workDir = path.join(os.tmpdir(), `cd-asm-${jobId.replace(/[^a-zA-Z0-9_-]/g, "")}`);
    try {
      const episode = await this.loadEpisode(projectId, order);
      const shots = episode.storyboards[0]?.shots ?? [];
      await ensureDir(workDir);
      const warnings: string[] = [];
      const plans: AssemblyShotPlan[] = [];
      for (const shot of shots) {
        plans.push(await this.buildShotPlan(shot, plans.length, workDir, warnings));
      }

      const progress: AssemblyJobProgress = {
        total: plans.length + (options.includeTitleCard ? 1 : 0) + (options.includeEndCard ? 1 : 0),
        done: 0,
        failed: 0,
        skipped: 0,
        failedShotIds: [],
        errors: [],
        phase: "clips",
        provider: "local_ffmpeg",
      };
      await this.updateJob(jobId, progress);

      const clipPaths: string[] = [];
      let cursor = 0;
      const cues: SubtitleCue[] = [];

      if (options.includeTitleCard) {
        const cardPath = path.join(workDir, "card-title.mp4");
        await this.buildTextCard({
          text: `${episode.project.title} · 第 ${order} 集`,
          durationSec: TITLE_CARD_SEC,
          fontSize: 72,
          outputPath: cardPath,
        });
        clipPaths.push(cardPath);
        cursor += TITLE_CARD_SEC;
        progress.done += 1;
        await this.updateJob(jobId, progress);
      }

      for (const plan of plans) {
        const clipPath = path.join(workDir, `shot-${String(plan.order).padStart(4, "0")}.mp4`);
        try {
          await this.buildShotClip(plan, clipPath);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          progress.failed += 1;
          progress.failedShotIds.push(plan.shotId);
          progress.errors.push({ shotId: plan.shotId, message });
          warnings.push(`镜头 ${plan.order} 合成失败，已用占位画面补齐：${message.slice(0, 120)}`);
          try {
            await this.buildShotClip(
              { ...plan, visualKind: "card", videoClipPath: null, keyframePath: null },
              clipPath,
            );
          } catch {
            await this.buildSilentCard(clipPath, plan.targetDurationSec);
            warnings.push(`镜头 ${plan.order} 的配音无法混入成片，已降级为静音占位。`);
          }
        }
        clipPaths.push(clipPath);
        const shotStart = cursor;
        for (const line of plan.audioLines) {
          cues.push({
            startSec: shotStart,
            endSec: shotStart + line.durationSec,
            text: line.speaker?.trim() ? `${line.speaker.trim()}：${line.text}` : line.text,
          });
          cursor += line.durationSec;
        }
        if (!plan.audioLines.length) {
          cursor += plan.targetDurationSec;
        }
        progress.done += 1;
        await this.updateJob(jobId, progress);
      }

      if (options.includeEndCard) {
        const cardPath = path.join(workDir, "card-end.mp4");
        await this.buildTextCard({
          text: "敬请期待下集",
          durationSec: END_CARD_SEC,
          fontSize: 56,
          outputPath: cardPath,
        });
        clipPaths.push(cardPath);
        cursor += END_CARD_SEC;
        progress.done += 1;
        await this.updateJob(jobId, progress);
      }

      progress.phase = "concat";
      await this.updateJob(jobId, progress);
      const concatPath = path.join(workDir, "concat-list.txt");
      await fs.writeFile(concatPath, concatListContent(clipPaths), "utf8");
      const roughCutPath = path.join(workDir, "rough-cut.mp4");
      await this.runFfmpeg([
        "-y", "-f", "concat", "-safe", "0", "-i", concatPath,
        "-c", "copy", "-movflags", "+faststart",
        roughCutPath,
      ]);

      const srtBody = buildSrt(cues);
      const finalFileId = `ep_${episode.id}_${Date.now()}`;
      const outputRoot = resolveGeneratedVideosRoot();
      await ensureDir(outputRoot);
      const finalVideoPath = path.join(outputRoot, `${finalFileId}.mp4`);
      const finalSrtPath = path.join(outputRoot, `${finalFileId}.srt`);

      if (options.burnSubtitles && cues.length > 0) {
        progress.phase = "subtitles";
        await this.updateJob(jobId, progress);
        const tmpSrtPath = path.join(workDir, "burn.srt");
        await fs.writeFile(tmpSrtPath, srtBody, "utf8");
        const burnStyle = `subtitles='${escapeFilterPath(tmpSrtPath)}':force_style='${SUBTITLE_FORCE_STYLE}'`;
        await this.runFfmpeg(["-y", "-i", roughCutPath, "-vf", burnStyle, "-c:a", "copy", "-movflags", "+faststart", finalVideoPath]);
      } else {
        await fs.copyFile(roughCutPath, finalVideoPath);
      }
      await fs.writeFile(finalSrtPath, srtBody, "utf8");
      const durationSec = await ffprobeDuration(finalVideoPath);

      const assembled: DramaAssembledVideoData = {
        status: "done",
        videoUrl: `/api/drama/video-files/${finalFileId}`,
        srtUrl: `/api/drama/subtitle-files/${finalFileId}`,
        durationSec: durationSec ?? Math.round(cursor * 10) / 10,
        shotCount: plans.length,
        burnedSubtitles: options.burnSubtitles && cues.length > 0,
        generatedAt: new Date().toISOString(),
        warnings,
      };
      await this.writeAssembled(episode.id, assembled);

      progress.phase = "done";
      progress.videoUrl = assembled.videoUrl;
      progress.srtUrl = assembled.srtUrl;
      progress.durationSec = assembled.durationSec;
      await this.updateJob(jobId, progress);
      await prisma.dramaBatchJob.update({
        where: { id: jobId },
        data: { status: progress.failed > 0 ? "failed" : "done" },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await prisma.dramaBatchJob.update({
        where: { id: jobId },
        data: { status: "failed", progress: JSON.stringify({ phase: "concat", error: message.slice(0, 500) }) },
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
      items?: Array<{ lineIndex?: number; speaker?: string; text?: string; audioUrl?: string; durationSec?: number }>;
    }>(shot.dialogueAudioData, {});
    const audioItems = (audio.status === "done" ? audio.items ?? [] : [])
      .filter((item) => item && typeof item.text === "string" && item.text.trim() && typeof item.audioUrl === "string" && item.audioUrl.startsWith("data:"))
      .sort((a, b) => (a.lineIndex ?? 0) - (b.lineIndex ?? 0));

    const audioPaths: string[] = [];
    const audioLines: AssemblyAudioLine[] = [];
    for (let lineIndex = 0; lineIndex < audioItems.length; lineIndex += 1) {
      const item = audioItems[lineIndex]!;
      const buffer = dataUrlToBuffer(item.audioUrl!);
      if (!buffer?.length) {
        continue;
      }
      const audioPath = path.join(workDir, `audio-${index}-${lineIndex}.mp3`);
      await fs.writeFile(audioPath, buffer);
      const probed = await ffprobeDuration(audioPath);
      const durationSec = normalizeDurationSec(
        probed ?? item.durationSec,
        Math.max(1.5, Math.ceil((item.text?.length ?? 6) / 4)),
      );
      audioPaths.push(audioPath);
      audioLines.push({
        text: item.text!,
        speaker: item.speaker?.trim() || undefined,
        durationSec: Math.round(durationSec * 100) / 100,
      });
    }

    let audioInput: AssemblyShotPlan["audioInput"] = null;
    if (audioPaths.length === 1) {
      audioInput = { kind: "file", path: audioPaths[0]! };
    } else if (audioPaths.length > 1) {
      const listPath = path.join(workDir, `audio-${index}-list.txt`);
      await fs.writeFile(listPath, concatListContent(audioPaths), "utf8");
      audioInput = { kind: "concat", listPath };
    }

    const audioTotal = audioLines.reduce((sum, line) => sum + line.durationSec, 0);
    const noAudioTarget = normalizeDurationSec(shot.durationSec, 3);
    let targetDurationSec = audioLines.length
      ? Math.max(1, Math.round(audioTotal * 100) / 100)
      : noAudioTarget;

    const visual = await this.resolveVisualSource(shot, index, workDir, warnings);

    // 无音频时按台词行/断句拆分字幕，按字数权重分配时长（有音频时一行音频一条字幕）。
    if (!audioLines.length) {
      const lines = (shot.dialogue ?? "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
        .flatMap((line) => (line.length > 42 ? splitNarrationIntoSentences(line) : [line]));
      if (lines.length) {
        const totalWeight = lines.reduce((sum, line) => sum + Math.max(1, line.length), 0);
        let remaining = targetDurationSec;
        lines.forEach((line, lineIndex) => {
          const isLast = lineIndex === lines.length - 1;
          const durationSec = isLast
            ? Math.max(0.8, remaining)
            : Math.round((targetDurationSec * Math.max(1, line.length) / totalWeight) * 100) / 100;
          remaining -= durationSec;
          audioLines.push({ text: line, durationSec });
        });
      }
    }

    return {
      shotId: shot.id,
      order: shot.order,
      visualKind: visual.visualKind,
      videoClipPath: visual.videoClipPath,
      keyframePath: visual.keyframePath,
      audioLines,
      audioInput,
      targetDurationSec,
    };
  }

  private async resolveVisualSource(
    shot: ShotLike,
    index: number,
    workDir: string,
    warnings: string[],
  ): Promise<Pick<AssemblyShotPlan, "visualKind" | "videoClipPath" | "keyframePath">> {
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
          return { visualKind: "video", videoClipPath: localPath, keyframePath: null };
        } catch {
          warnings.push(`镜头 ${shot.order} 的视频片段文件已丢失，改用首帧图。`);
        }
      } else if (/^https?:\/\//.test(resultUrl)) {
        try {
          const response = await fetch(resultUrl, { signal: AbortSignal.timeout(120_000) });
          if (response.ok) {
            const buffer = Buffer.from(await response.arrayBuffer());
            const downloadPath = path.join(workDir, `source-${index}.mp4`);
            await fs.writeFile(downloadPath, buffer);
            return { visualKind: "video", videoClipPath: downloadPath, keyframePath: null };
          }
        } catch {
          warnings.push(`镜头 ${shot.order} 的视频片段下载失败，改用首帧图。`);
        }
      }
    }
    const keyframe = await dramaShotKeyframeService.resolveExistingKeyframePath(shot.id);
    if (keyframe) {
      return { visualKind: "keyframe", videoClipPath: null, keyframePath: keyframe.filePath };
    }
    warnings.push(`镜头 ${shot.order} 没有首帧图和视频片段，使用占位画面。`);
    return { visualKind: "card", videoClipPath: null, keyframePath: null };
  }

  private async buildShotClip(plan: AssemblyShotPlan, outputPath: string): Promise<void> {
    const args: string[] = ["-y"];
    let videoFilter: string;

    if (plan.visualKind === "video" && plan.videoClipPath) {
      const probed = (await ffprobeDuration(plan.videoClipPath)) ?? 0;
      videoFilter = buildVideoClipFilter(probed, plan.targetDurationSec);
      args.push("-i", plan.videoClipPath);
    } else if (plan.visualKind === "keyframe" && plan.keyframePath) {
      videoFilter = kenBurnsFilter(plan.order - 1, plan.targetDurationSec);
      args.push("-loop", "1", "-i", plan.keyframePath);
    } else {
      videoFilter = `null`;
      args.push(
        "-f", "lavfi",
        "-i", `color=c=0x101418:s=${WIDTH}x${HEIGHT}:r=${FPS}:d=${plan.targetDurationSec.toFixed(3)}`,
      );
    }

    if (plan.audioInput?.kind === "concat") {
      args.push("-f", "concat", "-safe", "0", "-i", plan.audioInput.listPath);
    } else if (plan.audioInput?.kind === "file") {
      args.push("-i", plan.audioInput.path);
    } else {
      args.push("-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100");
    }

    args.push(
      "-map", "0:v:0",
      "-map", "1:a:0",
      "-vf", videoFilter,
      "-af", "apad",
      "-c:v", "libx264", "-preset", "veryfast", "-b:v", "2400k",
      "-c:a", "aac", "-b:a", "128k", "-ar", "44100", "-ac", "2",
      "-t", plan.targetDurationSec.toFixed(3),
      outputPath,
    );
    await this.runFfmpeg(args);
  }

  private async buildSilentCard(outputPath: string, durationSec: number): Promise<void> {
    const duration = Math.max(1, durationSec).toFixed(3);
    await this.runFfmpeg([
      "-y",
      "-f", "lavfi", "-i", `color=c=0x101418:s=${WIDTH}x${HEIGHT}:r=${FPS}:d=${duration}`,
      "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100",
      "-map", "0:v:0",
      "-map", "1:a:0",
      "-vf", "null",
      "-af", "apad",
      "-c:v", "libx264", "-preset", "veryfast", "-b:v", "2400k",
      "-c:a", "aac", "-b:a", "128k", "-ar", "44100", "-ac", "2",
      "-t", duration,
      outputPath,
    ]);
  }

  private async buildTextCard(input: { text: string; durationSec: number; fontSize: number; outputPath: string }): Promise<void> {
    const fontFile = resolveDrawtextFontFile();
    const duration = input.durationSec.toFixed(3);
    const videoArgs = ["-f", "lavfi", "-i", `color=c=black:s=${WIDTH}x${HEIGHT}:r=${FPS}:d=${duration}`];
    let drawtext = "";
    if (fontFile) {
      const textFile = `${input.outputPath}.txt`;
      await fs.writeFile(textFile, input.text.replace(/\s+/g, " ").trim() || "未命名", "utf8");
      drawtext = `,drawtext=textfile='${escapeFilterPath(textFile)}':fontfile='${escapeFilterPath(fontFile)}':fontcolor=white:fontsize=${input.fontSize}:x=(w-text_w)/2:y=(h-text_h)/2`;
    }
    await this.runFfmpeg([
      "-y",
      ...videoArgs,
      "-f", "lavfi", "-i", `anullsrc=channel_layout=stereo:sample_rate=44100`,
      "-map", "0:v:0",
      "-map", "1:a:0",
      "-vf", `null${drawtext}`,
      "-af", "apad",
      "-c:v", "libx264", "-preset", "veryfast", "-b:v", "2400k",
      "-c:a", "aac", "-b:a", "128k", "-ar", "44100", "-ac", "2",
      "-t", duration,
      input.outputPath,
    ]);
  }

  private async runFfmpeg(args: string[]): Promise<void> {
    const result = await runVideoProcess(resolveFfmpegBin(), args);
    if (result.code !== 0) {
      throw new Error(`ffmpeg 失败（退出码 ${result.code}）：${result.stderrTail.slice(-400)}`);
    }
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
          progress: JSON.stringify({ phase: "concat", error: "服务重启导致合成中断，请重新合成。" }),
        },
      }).catch(() => undefined);
    }
  }
}

export const dramaEpisodeAssemblyService = new DramaEpisodeAssemblyService();
