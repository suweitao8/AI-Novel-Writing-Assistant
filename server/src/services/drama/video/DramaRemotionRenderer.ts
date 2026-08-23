import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { resolveServerRoot } from "../../../runtime/appPaths";
import type { DramaRenderProfile } from "./renderProfile";
import type { DramaVideoTimeline } from "./dramaVideoTimeline";
import {
  mapDramaVideoTasksInOrder,
  resolveDramaVideoMediaCopyConcurrency,
} from "./videoProcessingConcurrency";

export interface DramaRemotionPublicFile {
  sourcePath: string;
  publicPath: string;
}

export interface DramaRemotionRenderInput {
  jobId: string;
  profile: DramaRenderProfile;
  timeline: DramaVideoTimeline;
  publicFiles: DramaRemotionPublicFile[];
  outputPath: string;
  showSubtitles: boolean;
  backgroundColor?: string;
}

export interface DramaRemotionRenderResult {
  outputPath: string;
  durationInFrames: number;
}

export interface DramaRemotionRendererDependencies {
  videoPackageRoot?: string;
  runRemotion?: (args: string[], cwd: string) => Promise<void>;
}

export class DramaRemotionRenderer {
  private readonly videoPackageRoot: string;
  private readonly runRemotionCommand: (args: string[], cwd: string) => Promise<void>;

  constructor(deps: DramaRemotionRendererDependencies = {}) {
    this.videoPackageRoot = deps.videoPackageRoot ?? path.join(resolveServerRoot(), "..", "video");
    this.runRemotionCommand = deps.runRemotion ?? runRemotionCommand;
  }

  async render(input: DramaRemotionRenderInput): Promise<DramaRemotionRenderResult> {
    const publicDir = await fs.mkdtemp(path.join(os.tmpdir(), `drama-remotion-${sanitize(input.jobId)}-`));
    try {
      await mapDramaVideoTasksInOrder(
        input.publicFiles,
        resolveDramaVideoMediaCopyConcurrency(),
        async (file) => {
          const targetPath = resolvePublicPath(publicDir, file.publicPath);
          await fs.mkdir(path.dirname(targetPath), { recursive: true });
          await fs.copyFile(file.sourcePath, targetPath);
        },
      );

      const propsPath = path.join(publicDir, "props.json");
      await fs.writeFile(propsPath, JSON.stringify({
        durationInFrames: input.timeline.durationInFrames,
        width: input.profile.width,
        height: input.profile.height,
        fps: input.profile.fps,
        backgroundColor: input.backgroundColor ?? "#101418",
        scenes: input.timeline.scenes,
        subtitles: input.timeline.subtitles,
        showSubtitles: input.showSubtitles,
      }), "utf8");
      await fs.mkdir(path.dirname(input.outputPath), { recursive: true });

      await this.runRemotionCommand([
        "exec",
        "remotion",
        "render",
        "src/index.tsx",
        "DramaEpisodeVideo",
        input.outputPath,
        `--props=${propsPath}`,
        `--public-dir=${publicDir}`,
      ], this.videoPackageRoot);

      return {
        outputPath: input.outputPath,
        durationInFrames: input.timeline.durationInFrames,
      };
    } finally {
      await fs.rm(publicDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}

function resolvePublicPath(publicDir: string, publicPath: string): string {
  const root = path.resolve(publicDir);
  const target = path.resolve(root, publicPath);
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) {
    throw new Error(`Remotion public path escapes the render directory: ${publicPath}`);
  }
  return target;
}

function sanitize(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64) || "job";
}

async function runRemotionCommand(args: string[], cwd: string): Promise<void> {
  const processSpec = resolveRemotionProcess(args);
  await new Promise<void>((resolve, reject) => {
    const child = spawn(processSpec.command, processSpec.args, {
      cwd,
      env: process.env,
      shell: processSpec.shell,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("Remotion 渲染超过 15 分钟，已终止。"));
    }, 15 * 60_000);
    child.stdout?.on("data", (chunk: Buffer) => {
      stdout = `${stdout}${chunk.toString()}`.slice(-6000);
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr = `${stderr}${chunk.toString()}`.slice(-6000);
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve();
      } else {
        const details = [stdout.trim(), stderr.trim()].filter(Boolean).join("\n");
        reject(new Error(`Remotion 渲染失败（exit ${code ?? "unknown"}）：${details || "无详细错误"}`));
      }
    });
  });
}

export function resolveRemotionProcess(args: string[]): { command: string; args: string[]; shell: boolean } {
  if (process.platform !== "win32") {
    return { command: "pnpm", args, shell: false };
  }
  // pnpm is distributed as a .cmd shim on Windows; Node cannot spawn that file
  // without a shell, while shell=true lets cmd.exe preserve paths with spaces.
  return { command: "pnpm.cmd", args, shell: true };
}
