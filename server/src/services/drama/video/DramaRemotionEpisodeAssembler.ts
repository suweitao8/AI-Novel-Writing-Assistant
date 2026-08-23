import fs from "node:fs/promises";
import path from "node:path";
import type { DramaRenderProfile } from "./renderProfile";
import {
  DramaRemotionRenderer,
  type DramaRemotionRenderInput,
  type DramaRemotionRenderResult,
} from "./DramaRemotionRenderer";
import { buildDramaVideoTimeline, type DramaVideoTimeline } from "./dramaVideoTimeline";
import { resolveFfmpegBin, resolveFfprobeBin, runVideoProcess } from "./ffmpegUtils";
import { wrapSubtitleText } from "./subtitleText";

const SUBTITLE_WRAP_CHARS = 18;
const TITLE_CARD_SEC = 3;
const END_CARD_SEC = 2;

export interface DramaAssemblyAudioLine {
  text: string;
  speaker?: string;
  durationSec: number;
  sourcePath?: string | null;
}

export interface DramaAssemblyShot {
  shotId: string;
  order: number;
  durationSec: number;
  imagePath?: string | null;
  detail?: string;
  audioLines: DramaAssemblyAudioLine[];
}

export interface DramaRemotionEpisodeAssemblyInput {
  jobId: string;
  episodeTitle: string;
  episodeOrder: number;
  profile: DramaRenderProfile;
  shots: DramaAssemblyShot[];
  includeTitleCard: boolean;
  includeEndCard: boolean;
  showSubtitles: boolean;
  outputPath: string;
  srtPath: string;
  workDir: string;
  warnings?: string[];
  onPhase?: (phase: "audio" | "render" | "mux") => Promise<void> | void;
}

export interface DramaVideoArtifactProbe {
  durationSec: number | null;
  video: {
    codecName: string | null;
    width: number;
    height: number;
    fps: number;
  } | null;
  audio: {
    codecName: string | null;
    sampleRate: number | null;
    channels: number | null;
  } | null;
}

export interface DramaRemotionEpisodeAssemblyResult {
  outputPath: string;
  srtPath: string;
  durationSec: number;
  durationInFrames: number;
  timeline: DramaVideoTimeline;
  warnings: string[];
  probe: DramaVideoArtifactProbe;
}

export interface DramaRemotionEpisodeAssemblerDependencies {
  renderer?: DramaRemotionRendererPort;
  runFfmpeg?: (args: string[]) => Promise<void>;
  probe?: (filePath: string) => Promise<DramaVideoArtifactProbe>;
}

interface DramaRemotionRendererPort {
  render(input: DramaRemotionRenderInput): Promise<DramaRemotionRenderResult>;
}

interface AssemblySegment {
  id: string;
  kind: "title" | "shot" | "end";
  durationSec: number;
  imagePath?: string;
  title?: string;
  detail?: string;
  audioLines: DramaAssemblyAudioLine[];
}

interface SubtitleCue {
  startSec: number;
  endSec: number;
  text: string;
  speaker?: string;
}

export class DramaRemotionEpisodeAssembler {
  private readonly renderer: DramaRemotionRendererPort;
  private readonly runFfmpeg: (args: string[]) => Promise<void>;
  private readonly probe: (filePath: string) => Promise<DramaVideoArtifactProbe>;

  constructor(deps: DramaRemotionEpisodeAssemblerDependencies = {}) {
    this.renderer = deps.renderer ?? new DramaRemotionRenderer();
    this.runFfmpeg = deps.runFfmpeg ?? runFfmpegCommand;
    this.probe = deps.probe ?? probeDramaVideoArtifact;
  }

  async assemble(input: DramaRemotionEpisodeAssemblyInput): Promise<DramaRemotionEpisodeAssemblyResult> {
    await fs.mkdir(input.workDir, { recursive: true });
    await fs.mkdir(path.dirname(input.outputPath), { recursive: true });
    await fs.mkdir(path.dirname(input.srtPath), { recursive: true });

    const warnings = [...(input.warnings ?? [])];
    const segments = buildAssemblySegments(input);
    await input.onPhase?.("audio");
    const sceneCursor = buildSceneCursor(segments);
    const alignedSubtitles = alignSubtitlesToSceneCursor(segments, sceneCursor);
    const timeline = buildDramaVideoTimeline({
      fps: input.profile.fps,
      scenes: segments.map((segment, index) => ({
        id: segment.id,
        kind: segment.kind,
        durationSec: segment.durationSec,
        imagePath: segment.imagePath ? publicImagePath(segment, index) : undefined,
        title: segment.title,
        detail: segment.detail,
      })),
      subtitles: alignedSubtitles,
    });

    const publicFiles = await this.buildPublicFiles(segments, input.workDir);
    const srtBody = buildSrt(alignedSubtitles);
    await fs.writeFile(input.srtPath, srtBody, "utf8");

    const normalizedAudioPaths: string[] = [];
    for (let index = 0; index < segments.length; index += 1) {
      const outputPath = path.join(input.workDir, `audio-segment-${String(index).padStart(4, "0")}.wav`);
      await this.normalizeSegmentAudio(segments[index]!, outputPath, input.workDir, index);
      normalizedAudioPaths.push(outputPath);
    }

    const fullAudioPath = path.join(input.workDir, "episode-audio.wav");
    await this.concatNormalizedAudio(normalizedAudioPaths, fullAudioPath, input.workDir, timeline.durationInFrames / input.profile.fps);

    await input.onPhase?.("render");
    const silentVideoPath = path.join(input.workDir, "remotion-video.mp4");
    await this.renderer.render({
      jobId: input.jobId,
      profile: input.profile,
      timeline,
      publicFiles,
      outputPath: silentVideoPath,
      showSubtitles: input.showSubtitles,
    });

    await input.onPhase?.("mux");
    await this.runFfmpeg([
      "-y",
      "-i", silentVideoPath,
      "-i", fullAudioPath,
      "-map", "0:v:0",
      "-map", "1:a:0",
      "-c:v", "copy",
      "-c:a", "aac",
      "-b:a", "128k",
      "-ar", "44100",
      "-ac", "2",
      "-shortest",
      "-movflags", "+faststart",
      input.outputPath,
    ]);

    const probe = await this.probe(input.outputPath);
    assertDramaVideoArtifact(probe, input.profile);
    const durationSec = probe.durationSec ?? timeline.durationInFrames / input.profile.fps;
    return {
      outputPath: input.outputPath,
      srtPath: input.srtPath,
      durationSec,
      durationInFrames: timeline.durationInFrames,
      timeline,
      warnings,
      probe,
    };
  }

  private async buildPublicFiles(segments: AssemblySegment[], workDir: string) {
    const publicFiles: Array<{ sourcePath: string; publicPath: string }> = [];
    for (let index = 0; index < segments.length; index += 1) {
      const segment = segments[index]!;
      if (!segment.imagePath) {
        continue;
      }
      try {
        await fs.access(segment.imagePath);
      } catch {
        continue;
      }
      publicFiles.push({
        sourcePath: segment.imagePath,
        publicPath: publicImagePath(segment, index),
      });
    }
    await fs.mkdir(workDir, { recursive: true });
    return publicFiles;
  }

  private async normalizeSegmentAudio(
    segment: AssemblySegment,
    outputPath: string,
    workDir: string,
    segmentIndex: number,
  ): Promise<void> {
    const duration = segment.durationSec.toFixed(3);
    const sourcePaths = segment.audioLines
      .map((line) => line.sourcePath?.trim())
      .filter((sourcePath): sourcePath is string => Boolean(sourcePath));
    if (sourcePaths.length === 0) {
      await this.runFfmpeg([
        "-y",
        "-f", "lavfi",
        "-i", "anullsrc=channel_layout=stereo:sample_rate=44100",
        "-t", duration,
        "-ac", "2",
        "-ar", "44100",
        "-c:a", "pcm_s16le",
        outputPath,
      ]);
      return;
    }

    let inputArgs: string[];
    if (sourcePaths.length === 1) {
      inputArgs = ["-i", sourcePaths[0]!];
    } else {
      const listPath = path.join(workDir, `audio-lines-${String(segmentIndex).padStart(4, "0")}.txt`);
      await fs.writeFile(listPath, concatListContent(sourcePaths), "utf8");
      inputArgs = ["-f", "concat", "-safe", "0", "-i", listPath];
    }
    await this.runFfmpeg([
      "-y",
      ...inputArgs,
      "-vn",
      "-af", "aresample=44100,apad",
      "-t", duration,
      "-ac", "2",
      "-ar", "44100",
      "-c:a", "pcm_s16le",
      outputPath,
    ]);
  }

  private async concatNormalizedAudio(
    audioPaths: string[],
    outputPath: string,
    workDir: string,
    durationSec: number,
  ): Promise<void> {
    const listPath = path.join(workDir, "normalized-audio-list.txt");
    await fs.writeFile(listPath, concatListContent(audioPaths), "utf8");
    await this.runFfmpeg([
      "-y",
      "-f", "concat",
      "-safe", "0",
      "-i", listPath,
      "-vn",
      "-ar", "44100",
      "-ac", "2",
      "-c:a", "pcm_s16le",
      "-t", durationSec.toFixed(3),
      outputPath,
    ]);
  }
}

export function resolveAssemblyJobStatus(input: {
  renderSucceeded: boolean;
  muxSucceeded: boolean;
  probePassed: boolean;
  warningCount?: number;
}): "done" | "failed" {
  return input.renderSucceeded && input.muxSucceeded && input.probePassed ? "done" : "failed";
}

export async function probeDramaVideoArtifact(filePath: string): Promise<DramaVideoArtifactProbe> {
  const result = await runVideoProcess(resolveFfprobeBin(), [
    "-v", "error",
    "-show_entries", "stream=codec_type,codec_name,width,height,r_frame_rate,sample_rate,channels:format=duration",
    "-of", "json",
    filePath,
  ], 60_000);
  if (result.code !== 0) {
    throw new Error(`ffprobe 失败（退出码 ${result.code}）：${result.stderrTail.slice(-400)}`);
  }
  let parsed: {
    streams?: Array<Record<string, unknown>>;
    format?: { duration?: string };
  };
  try {
    parsed = JSON.parse(result.stdout) as typeof parsed;
  } catch {
    throw new Error("ffprobe 返回了无法解析的媒体信息。 ");
  }
  const streams = parsed.streams ?? [];
  const videoStream = streams.find((stream) => stream.codec_type === "video");
  const audioStream = streams.find((stream) => stream.codec_type === "audio");
  return {
    durationSec: parseFiniteNumber(parsed.format?.duration),
    video: videoStream
      ? {
        codecName: stringOrNull(videoStream.codec_name),
        width: numberOrZero(videoStream.width),
        height: numberOrZero(videoStream.height),
        fps: parseFrameRate(videoStream.r_frame_rate),
      }
      : null,
    audio: audioStream
      ? {
        codecName: stringOrNull(audioStream.codec_name),
        sampleRate: parseFiniteNumber(audioStream.sample_rate),
        channels: parseFiniteNumber(audioStream.channels),
      }
      : null,
  };
}

export function assertDramaVideoArtifact(probe: DramaVideoArtifactProbe, profile: DramaRenderProfile): void {
  if (!probe.video) {
    throw new Error("成片缺少视频流。");
  }
  if (!probe.audio) {
    throw new Error("成片缺少音频流。");
  }
  if (probe.video.width !== profile.width || probe.video.height !== profile.height) {
    throw new Error(`成片分辨率不符合 ${profile.id}：实测 ${probe.video.width}x${probe.video.height}。`);
  }
  const expectedAspect = profile.width / profile.height;
  const actualAspect = probe.video.width / probe.video.height;
  if (Math.abs(actualAspect - expectedAspect) > 0.001) {
    throw new Error(`成片不是横屏 16:9：实测 ${probe.video.width}x${probe.video.height}。`);
  }
  if (Math.abs(probe.video.fps - profile.fps) > 0.01) {
    throw new Error(`成片帧率不符合 ${profile.fps}fps：实测 ${probe.video.fps}fps。`);
  }
  if (probe.video.codecName && probe.video.codecName !== "h264") {
    throw new Error(`成片视频编码不是 H.264：实测 ${probe.video.codecName}。`);
  }
  if (probe.audio.codecName && probe.audio.codecName !== "aac") {
    throw new Error(`成片音频编码不是 AAC：实测 ${probe.audio.codecName}。`);
  }
}

function buildAssemblySegments(input: DramaRemotionEpisodeAssemblyInput): AssemblySegment[] {
  const segments: AssemblySegment[] = [];
  if (input.includeTitleCard) {
    segments.push({
      id: "title-card",
      kind: "title",
      durationSec: TITLE_CARD_SEC,
      title: `${input.episodeTitle} · 第 ${input.episodeOrder} 集`,
      audioLines: [],
    });
  }
  for (const shot of input.shots) {
    const audioDuration = shot.audioLines.reduce((sum, line) => sum + normalizeDurationSec(line.durationSec, 1), 0);
    const durationSec = audioDuration > 0 ? Math.max(1, audioDuration) : normalizeDurationSec(shot.durationSec, 1);
    segments.push({
      id: `shot-${shot.order}-${shot.shotId}`,
      kind: "shot",
      durationSec,
      imagePath: shot.imagePath ?? undefined,
      title: `镜头 ${shot.order}`,
      detail: shot.detail,
      audioLines: shot.audioLines,
    });
  }
  if (input.includeEndCard) {
    segments.push({
      id: "end-card",
      kind: "end",
      durationSec: END_CARD_SEC,
      title: "敬请期待下集",
      audioLines: [],
    });
  }
  if (segments.length === 0) {
    throw new Error("没有可供 Remotion 合成的时间轴片段。");
  }
  return segments;
}

function buildSceneCursor(segments: AssemblySegment[]): number[] {
  const cursor: number[] = [];
  let current = 0;
  for (const segment of segments) {
    cursor.push(current);
    current += segment.durationSec;
  }
  return cursor;
}

function alignSubtitlesToSceneCursor(segments: AssemblySegment[], sceneCursor: number[]) {
  const subtitles: Array<{ startSec: number; endSec: number; text: string; speaker?: string }> = [];
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index]!;
    if (segment.kind !== "shot") {
      continue;
    }
    let lineCursor = sceneCursor[index]!;
    for (const line of segment.audioLines) {
      const durationSec = normalizeDurationSec(line.durationSec, 1);
      const text = line.text.trim();
      if (text) {
        subtitles.push({
          startSec: lineCursor,
          endSec: Math.min(sceneCursor[index]! + segment.durationSec, lineCursor + durationSec),
          text,
          speaker: line.speaker?.trim() || undefined,
        });
      }
      lineCursor += durationSec;
    }
  }
  return subtitles;
}

function publicImagePath(segment: AssemblySegment, index: number): string {
  const ext = path.extname(segment.imagePath ?? "").toLowerCase();
  const safeExt = [".png", ".jpg", ".jpeg", ".webp"].includes(ext) ? ext : ".png";
  return `images/scene-${String(index).padStart(4, "0")}${safeExt}`;
}

function normalizeDurationSec(value: number | null | undefined, fallback: number): number {
  return Number.isFinite(value) && Number(value) > 0 ? Number(value) : fallback;
}

function concatListContent(filePaths: string[]): string {
  return filePaths
    .map((filePath) => `file '${filePath.replace(/\\/g, "/").replace(/'/g, "'\\''")}'`)
    .join("\n");
}

function buildSrt(cues: SubtitleCue[]): string {
  return cues.map((cue, index) => [
    String(index + 1),
    `${formatSrtTime(cue.startSec)} --> ${formatSrtTime(cue.endSec)}`,
    wrapSubtitleText(cue.speaker ? `${cue.speaker}：${cue.text}` : cue.text, SUBTITLE_WRAP_CHARS),
    "",
  ].join("\n")).join("\n");
}

function formatSrtTime(totalSeconds: number): string {
  const totalMs = Math.max(0, Math.round(totalSeconds * 1000));
  const hours = Math.floor(totalMs / 3_600_000);
  const minutes = Math.floor((totalMs % 3_600_000) / 60_000);
  const seconds = Math.floor((totalMs % 60_000) / 1000);
  const ms = totalMs % 1000;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
}

async function runFfmpegCommand(args: string[]): Promise<void> {
  const result = await runVideoProcess(resolveFfmpegBin(), args);
  if (result.code !== 0) {
    throw new Error(`ffmpeg 失败（退出码 ${result.code}）：${result.stderrTail.slice(-400)}`);
  }
}

function parseFrameRate(value: unknown): number {
  if (typeof value !== "string") {
    return 0;
  }
  const [numerator, denominator] = value.split("/").map(Number);
  if (Number.isFinite(numerator) && Number.isFinite(denominator) && denominator > 0) {
    return numerator / denominator;
  }
  return Number.parseFloat(value) || 0;
}

function parseFiniteNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function numberOrZero(value: unknown): number {
  return parseFiniteNumber(value) ?? 0;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}
