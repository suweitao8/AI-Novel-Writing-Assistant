import { spawn } from "child_process";
import { existsSync } from "fs";
import fs from "fs/promises";
import path from "path";

// 整集合成使用的 ffmpeg/ffprobe 进程工具（移植自 mydrama generators/video_composer.py 的
// 子进程约定：捕获 stderr 尾部用于报错、超时强杀、退出码判断成败）。

export interface VideoProcessResult {
  code: number;
  stdout: string;
  stderrTail: string;
}

export function resolveFfmpegBin(): string {
  return process.env.FFMPEG_PATH?.trim() || "ffmpeg";
}

export function resolveFfprobeBin(): string {
  return process.env.FFPROBE_PATH?.trim() || "ffprobe";
}

export function runVideoProcess(
  bin: string,
  args: string[],
  timeoutMs = 10 * 60_000,
): Promise<VideoProcessResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    let stdout = "";
    let stderrTail = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
    }, timeoutMs);
    child.stdout?.on("data", (chunk: Buffer) => {
      stdout = `${stdout}${chunk.toString("utf8")}`.slice(-4000);
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderrTail = `${stderrTail}${chunk.toString("utf8")}`.slice(-4000);
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(new Error(`无法启动 ${path.basename(bin)}（${error.message}）。请确认本机已安装 ffmpeg。`));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? -1, stdout, stderrTail });
    });
  });
}

/** ffprobe 实测媒体时长（秒）；探测失败返回 null，由调用方回退到估算值。 */
export async function ffprobeDuration(filePath: string): Promise<number | null> {
  try {
    const result = await runVideoProcess(resolveFfprobeBin(), [
      "-v", "error",
      "-show_entries", "format=duration",
      "-of", "default=noprint_wrappers=1:nokey=1",
      filePath,
    ], 60_000);
    if (result.code !== 0) {
      return null;
    }
    const parsed = Number.parseFloat(result.stdout.trim().split(/\r?\n/)[0] ?? "");
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  } catch {
    return null;
  }
}

/** ffmpeg 滤镜参数里的文件路径转义：反斜杠转正斜杠、冒号加反斜杠（Windows 盘符）。 */
export function escapeFilterPath(filePath: string): string {
  return filePath.replace(/\\/g, "/").replace(/:/g, "\\:");
}

let cachedFontFile: string | null | undefined;

/** 探测可用的中文字体（drawtext 片头片尾卡）；找不到返回 null，调用方退化为纯色卡。 */
export function resolveDrawtextFontFile(): string | null {
  if (cachedFontFile !== undefined) {
    return cachedFontFile;
  }
  const candidates = [
    process.env.DRAMA_FFMPEG_FONT_FILE?.trim() || "",
    "C:/Windows/Fonts/msyh.ttc",
    "C:/Windows/Fonts/simhei.ttf",
    "C:/Windows/Fonts/simsun.ttc",
    "/System/Library/Fonts/PingFang.ttc",
    "/System/Library/Fonts/STHeiti Medium.ttc",
    "/usr/share/fonts/wqy-microhei/wqy-microhei.ttc",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
  ].filter(Boolean);
  cachedFontFile = candidates.find((candidate) => existsSync(candidate)) ?? null;
  return cachedFontFile;
}

export async function assertFfmpegAvailable(): Promise<void> {
  try {
    const result = await runVideoProcess(resolveFfmpegBin(), ["-version"], 15_000);
    if (result.code !== 0) {
      throw new Error(result.stderrTail.slice(-300));
    }
  } catch (error) {
    throw new Error(
      `本机无法运行 ffmpeg，整集合成不可用：${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}
