import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { resolveServerRoot } from "../../../runtime/appPaths";
import type { DramaRenderProfile } from "./renderProfile";
import type { DramaVideoTimeline } from "./dramaVideoTimeline";

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
      for (const file of input.publicFiles) {
        const targetPath = resolvePublicPath(publicDir, file.publicPath);
        await fs.mkdir(path.dirname(targetPath), { recursive: true });
        await fs.copyFile(file.sourcePath, targetPath);
      }

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
        "--props",
        propsPath,
        "--public-dir",
        publicDir,
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
  const command = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { cwd, env: process.env, stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("Remotion 渲染超过 15 分钟，已终止。"));
    }, 15 * 60_000);
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
        reject(new Error(`Remotion 渲染失败（exit ${code ?? "unknown"}）：${stderr.trim() || "无详细错误"}`));
      }
    });
  });
}

