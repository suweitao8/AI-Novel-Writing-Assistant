import { spawn } from "child_process";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { resolveServerRoot } from "../../../runtime/appPaths";
import type { VideoGenerationRequest, VideoGenerationResult, VideoProviderPort } from "./VideoProviderPort";

// 本地 ffmpeg 视频通道：把镜头首帧图 + 台词配音合成为真实的 mp4 片段。
// 参考旧项目（supertale）的合成方式：循环首帧图 + Ken Burns 缓慢推拉（zoompan），
// 以配音时长为时间线（无配音时用 durationSec 静音占位），输出竖屏 1080x1920 H.264。
// 任务为本地异步进程：createTask 派生 ffmpeg 后立即返回 running，getTask 检查产物文件。

const VIDEOS_DIR_NAME = "generated-videos";
const DEFAULT_FPS = 30;
const DEFAULT_DURATION_SEC = 4;
const MAX_AUDIO_ITEMS = 12;

export function resolveGeneratedVideosRoot(): string {
  return path.join(resolveServerRoot(), "storage", VIDEOS_DIR_NAME);
}

export function dramaVideoFilePath(taskId: string): string {
  return path.join(resolveGeneratedVideosRoot(), `${sanitizeTaskId(taskId)}.mp4`);
}

function sanitizeTaskId(taskId: string): string {
  return taskId.replace(/[^a-zA-Z0-9_-]/g, "");
}

function resolveFfmpegPath(): string {
  return process.env.FFMPEG_PATH?.trim() || "ffmpeg";
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function dataUrlToBuffer(dataUrl: string): Buffer | null {
  const match = /^data:[^;]+;base64,(.+)$/s.exec(dataUrl.trim());
  if (!match) {
    return null;
  }
  return Buffer.from(match[1], "base64");
}

// 把可用的参考图解析成本地文件路径：本地图直用；http(s)/相对 URL 落到临时文件。
async function resolveImageInput(refImages: string[] | undefined, taskId: string): Promise<string | null> {
  const candidates = (refImages ?? []).filter((url) => typeof url === "string" && url.trim());
  const first = candidates[0];
  if (!first) {
    return null;
  }
  if (/^[a-zA-Z]:[\\/]/.test(first) && await pathExists(first)) {
    return first;
  }
  if (/^data:image\//.test(first)) {
    const buffer = dataUrlToBuffer(first);
    if (buffer) {
      const tempPath = path.join(os.tmpdir(), `cd-img-${taskId}${path.extname(first.split(";")[0]).slice(0, 5) || ".png"}`);
      await fs.writeFile(tempPath, buffer);
      return tempPath;
    }
    return null;
  }
  if (/^https?:\/\//.test(first)) {
    const response = await fetch(first, { signal: AbortSignal.timeout(60000) });
    if (!response.ok) {
      return null;
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    const tempPath = path.join(os.tmpdir(), `cd-img-${taskId}.img`);
    await fs.writeFile(tempPath, buffer);
    return tempPath;
  }
  return null;
}

async function writeAudioInputs(
  audioDataUrls: string[] | undefined,
  taskId: string,
): Promise<{ concatListPath: string; audioPaths: string[] } | null> {
  const dataUrls = (audioDataUrls ?? []).slice(0, MAX_AUDIO_ITEMS);
  const audioPaths: string[] = [];
  for (let index = 0; index < dataUrls.length; index += 1) {
    const dataUrl = dataUrls[index].trim();
    const buffer = dataUrlToBuffer(dataUrl);
    if (!buffer || buffer.length === 0) {
      continue;
    }
    // 扩展名按 dataUrl 的 mime 推断（VoxCPM 桥接返回 audio/wav），给 ffmpeg 正确的探测提示。
    const mimeMatch = /^data:([^;]+);/.exec(dataUrl);
    const ext = mimeMatch?.[1].includes("wav") ? "wav" : mimeMatch?.[1].includes("mpeg") ? "mp3" : "bin";
    const tempPath = path.join(os.tmpdir(), `cd-audio-${taskId}-${index}.${ext}`);
    await fs.writeFile(tempPath, buffer);
    audioPaths.push(tempPath);
  }
  if (audioPaths.length === 0) {
    return null;
  }
  if (audioPaths.length === 1) {
    return { concatListPath: audioPaths[0], audioPaths };
  }
  const concatListPath = path.join(os.tmpdir(), `cd-audio-${taskId}-list.txt`);
  // concat demuxer 列表内必须用正斜杠：Windows 反斜杠会被当作转义符导致 "Invalid data found"。
  const listContent = audioPaths
    .map((audioPath) => `file '${audioPath.replace(/\\/g, "/").replace(/'/g, "'\\''")}'`)
    .join("\n");
  await fs.writeFile(concatListPath, listContent, "utf8");
  return { concatListPath, audioPaths };
}

function buildFfmpegArgs(input: {
  imagePath: string | null;
  audioPath: string | null;
  durationSec: number;
  outputPath: string;
}): string[] {
  const width = 1080;
  const height = 1920;
  const fps = DEFAULT_FPS;
  const duration = Math.max(1, Math.round(input.durationSec));
  const filterChain = [
    `scale=${width * 2}:${height * 2}:force_original_aspect_ratio=increase`,
    `crop=${width * 2}:${height * 2}`,
    `zoompan=z='min(zoom+0.0008,1.10)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${width}x${height}:fps=${fps}`,
  ].join(",");

  const args: string[] = ["-y"];
  if (input.imagePath) {
    args.push("-loop", "1", "-framerate", String(fps), "-i", input.imagePath, "-t", String(duration));
  } else {
    // 没有首帧图时用纯色底板，保证视频仍然产出。
    args.push(
      "-f", "lavfi",
      "-i", `color=c=0x101418:s=${width}x${height}:r=${fps}:d=${duration}`,
    );
  }
  if (input.audioPath) {
    if (input.audioPath.endsWith(".txt")) {
      // 多段配音走 concat demuxer：必须显式 -f concat（.txt 扩展名无法自动推断格式）。
      args.push("-f", "concat", "-safe", "0", "-i", input.audioPath);
    } else {
      args.push("-i", input.audioPath);
    }
  } else {
    args.push("-f", "lavfi", "-i", `anullsrc=channel_layout=stereo:sample_rate=44100`);
  }
  args.push(
    "-vf", filterChain,
    "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p", "-b:v", "2400k",
    "-c:a", "aac", "-b:a", "128k", "-ar", "44100",
    "-shortest",
    "-movflags", "+faststart",
    input.outputPath,
  );
  return args;
}

export class LocalFfmpegVideoProvider implements VideoProviderPort {
  readonly provider = "local_ffmpeg";
  readonly label = "本地合成通道";
  readonly description = "用本机 ffmpeg 把镜头首帧图与配音合成为真实视频片段（Ken Burns 动效），不需要外部视频服务。";
  readonly supportsRefImages = true;
  readonly costPerSecond = 0;
  readonly currency = process.env.DRAMA_COST_CURRENCY?.trim() || "CNY";

  async createTask(input: VideoGenerationRequest): Promise<VideoGenerationResult> {
    const ffmpegPath = resolveFfmpegPath();
    const taskId = `local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const outputDir = resolveGeneratedVideosRoot();
    await fs.mkdir(outputDir, { recursive: true });
    const outputPath = dramaVideoFilePath(taskId);
    const errorPath = `${outputPath}.err`;

    const localFirst = input.localImagePaths?.[0];
    const imagePath = (localFirst && await pathExists(localFirst))
      ? localFirst
      : await resolveImageInput(input.refImages, taskId);
    const audio = await writeAudioInputs(input.audioDataUrls, taskId);
    const durationSec = Math.round(
      Math.max(input.durationSec ?? 0, audio ? 4 : 0) || DEFAULT_DURATION_SEC,
    );

    const args = buildFfmpegArgs({
      imagePath,
      audioPath: audio?.concatListPath ?? null,
      durationSec,
      outputPath,
    });

    const child = spawn(ffmpegPath, args, {
      stdio: ["ignore", "ignore", "pipe"],
      windowsHide: true,
    });
    let stderrTail = "";
    child.stderr.on("data", (chunk: Buffer) => {
      stderrTail = `${stderrTail}${chunk.toString("utf8")}`.slice(-2000);
    });
    child.on("error", async (error) => {
      await fs.writeFile(errorPath, `ffmpeg spawn 失败：${error.message}`, "utf8").catch(() => undefined);
    });
    child.on("close", async (code) => {
      if (code !== 0) {
        await fs.writeFile(errorPath, `ffmpeg 退出码 ${code}：${stderrTail.slice(-800)}`, "utf8").catch(() => undefined);
      }
      for (const tempPath of audio?.audioPaths ?? []) {
        await fs.unlink(tempPath).catch(() => undefined);
      }
    });

    return {
      providerTaskId: taskId,
      status: "running",
      raw: { taskId, outputPath, durationSec, hasImage: Boolean(imagePath), hasAudio: Boolean(audio) },
    };
  }

  async getTask(providerTaskId: string): Promise<VideoGenerationResult> {
    const taskId = sanitizeTaskId(providerTaskId);
    const outputPath = dramaVideoFilePath(taskId);
    const errorPath = `${outputPath}.err`;
    if (await pathExists(outputPath)) {
      return {
        providerTaskId: taskId,
        status: "succeeded",
        resultUrl: `/api/drama/video-files/${taskId}`,
        raw: { outputPath },
      };
    }
    if (await pathExists(errorPath)) {
      const reason = await fs.readFile(errorPath, "utf8").catch(() => "ffmpeg 合成失败");
      return {
        providerTaskId: taskId,
        status: "failed",
        failureReason: reason.slice(-500),
      };
    }
    return { providerTaskId: taskId, status: "running" };
  }
}
