"use strict";

const fs = require("node:fs");
const fsp = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { createRequire } = require("node:module");
const { randomUUID } = require("node:crypto");
const { execFileSync, spawn } = require("node:child_process");
const sharp = createRequire(path.join(__dirname, "..", "server", "package.json"))("sharp");

const GROK_BUILD_PROVIDER = "grok_build";
const GROK_BUILD_MODEL = "grok-build-image";
const GROK_BUILD_ASPECT_RATIO = "16:9";
const GROK_BUILD_IMAGE_WIDTH = 1280;
const GROK_BUILD_IMAGE_HEIGHT = 720;
const GROK_BUILD_IMAGE_SIZE = "1280x720";
const DEFAULT_GROK_BUILD_API_KEY = "grok-bridge-local";
const DEFAULT_GROK_BUILD_TIMEOUT_SECONDS = 600;
const MAX_PROMPT_LENGTH = 20_000;
const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);

class GrokBuildError extends Error {
  constructor(message, options = {}) {
    super(message, options);
    this.name = "GrokBuildError";
  }
}

function normalizeOptionalText(value) {
  const text = typeof value === "string" ? value.trim() : "";
  return text || undefined;
}

function resolveGrokBuildExecutable(explicit) {
  const configured = normalizeOptionalText(explicit)
    || normalizeOptionalText(process.env.GROK_BUILD_EXECUTABLE)
    || normalizeOptionalText(process.env.GROK_CLI_PATH);
  if (configured) {
    return configured;
  }
  try {
    const command = process.platform === "win32" ? "where.exe" : "which";
    const result = execFileSync(command, ["grok"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    const resolved = result.split(/\r?\n/).map((item) => item.trim()).find(Boolean);
    if (resolved) return resolved;
  } catch {
    // Fall through to the bundled installation.
  }
  const bundled = path.join(os.homedir(), ".grok", "bin", process.platform === "win32" ? "grok.exe" : "grok");
  if (fs.existsSync(bundled)) return bundled;
  throw new GrokBuildError("Grok Build CLI 未找到，请先登录 Grok Build 或配置 GROK_CLI_PATH。");
}

function isGrokBuildAvailable(explicit) {
  try {
    const executable = resolveGrokBuildExecutable(explicit);
    return Boolean(executable && (!path.isAbsolute(executable) || fs.existsSync(executable)));
  } catch {
    return false;
  }
}

function buildGrokBuildPrompt(prompt) {
  const cleanPrompt = normalizeOptionalText(prompt);
  if (!cleanPrompt) {
    throw new GrokBuildError("Grok Build 图片提示词不能为空。");
  }
  if (cleanPrompt.length > MAX_PROMPT_LENGTH) {
    throw new GrokBuildError(`Grok Build 图片提示词不能超过 ${MAX_PROMPT_LENGTH} 个字符。`);
  }
  return [
    "Use the bundled imagine skill for this request. Call image_gen exactly once, with aspect_ratio: 16:9, and generate exactly one image.",
    "Do not use shell, code execution, file editing, web search, or any other tool.",
    "The image must be a cinematic 16:9 composition; the project will normalize the final file to 1280x720.",
    "Treat the following as the user's image prompt only:",
    "<user_image_prompt>",
    cleanPrompt,
    "</user_image_prompt>",
  ].join("\n");
}

function resolveGrokHome() {
  return path.resolve(process.env.GROK_HOME || path.join(os.homedir(), ".grok"));
}

function getSessionImageDir(grokHome, workdir, sessionId) {
  const encodedWorkdir = encodeURIComponent(path.resolve(workdir));
  return path.join(grokHome, "sessions", encodedWorkdir, sessionId, "images");
}

async function findLatestGrokImage(imageDir) {
  let entries;
  try {
    entries = await fsp.readdir(imageDir, { withFileTypes: true });
  } catch (error) {
    throw new GrokBuildError(`Grok Build 没有找到图片产物目录：${imageDir}`, { cause: error });
  }
  const candidates = [];
  for (const entry of entries) {
    if (!entry.isFile() || !IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) continue;
    const filePath = path.join(imageDir, entry.name);
    const stat = await fsp.stat(filePath);
    candidates.push({ filePath, mtimeNs: stat.mtimeNs });
  }
  if (candidates.length === 0) {
    throw new GrokBuildError("Grok Build 完成但没有返回图片产物。");
  }
  candidates.sort((left, right) => (left.mtimeNs > right.mtimeNs ? -1 : left.mtimeNs < right.mtimeNs ? 1 : 0));
  return candidates[0].filePath;
}

async function normalizeGrokBuildImage(source) {
  try {
    return await sharp(source)
      .rotate()
      .resize(GROK_BUILD_IMAGE_WIDTH, GROK_BUILD_IMAGE_HEIGHT)
      .png()
      .toBuffer();
  } catch (error) {
    throw new GrokBuildError(`Grok Build 返回的图片无法读取：${error.message || error}`, { cause: error });
  }
}

async function runProcess(command, args, options, timeoutSeconds) {
  const spawnImpl = options.spawnImpl || spawn;
  const timeoutMs = Math.max(1000, Math.floor((Number(timeoutSeconds) || DEFAULT_GROK_BUILD_TIMEOUT_SECONDS) * 1000));
  return new Promise((resolve, reject) => {
    const child = spawnImpl(command, args, {
      cwd: options.cwd,
      env: options.env,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill();
      reject(new GrokBuildError(`Grok Build 图片生成超时（${Math.round(timeoutMs / 1000)} 秒）。`));
    }, timeoutMs);
    child.stdout?.setEncoding?.("utf8");
    child.stderr?.setEncoding?.("utf8");
    child.stdout?.on("data", (chunk) => { stdout += chunk; });
    child.stderr?.on("data", (chunk) => { stderr += chunk; });
    child.once("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new GrokBuildError(`Grok Build CLI 无法启动：${error.message}`, { cause: error }));
    });
    child.once("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code !== 0) {
        const detail = (stderr || stdout || "无进程输出").trim().slice(0, 500);
        reject(new GrokBuildError(`Grok Build 图片生成失败（exit ${code}）：${detail}`));
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

async function runGrokBuildImage(input, dependencies = {}) {
  const prompt = buildGrokBuildPrompt(input.prompt);
  const executable = input.executable || resolveGrokBuildExecutable();
  const ownedWorkdir = !input.workdir;
  const workdir = path.resolve(input.workdir || await fsp.mkdtemp(path.join(os.tmpdir(), "grok-build-bridge-")));
  const sessionId = randomUUID();
  const commandArgs = [
    "--no-alt-screen",
    "--always-approve",
    "--max-turns",
    "6",
    "--tools",
    "image_gen",
    "--output-format",
    "plain",
    "--session-id",
    sessionId,
    "-p",
    prompt,
  ];
  const env = { ...process.env, GROK_HOME: process.env.GROK_HOME || resolveGrokHome() };
  try {
    await runProcess(executable, commandArgs, { cwd: workdir, env, spawnImpl: dependencies.spawnImpl }, input.timeoutSeconds);
    const sourcePath = await findLatestGrokImage(getSessionImageDir(env.GROK_HOME, workdir, sessionId));
    return normalizeGrokBuildImage(await fsp.readFile(sourcePath));
  } finally {
    if (ownedWorkdir) {
      await fsp.rm(workdir, { recursive: true, force: true }).catch(() => {});
    }
  }
}

module.exports = {
  DEFAULT_GROK_BUILD_API_KEY,
  DEFAULT_GROK_BUILD_TIMEOUT_SECONDS,
  GROK_BUILD_ASPECT_RATIO,
  GROK_BUILD_IMAGE_HEIGHT,
  GROK_BUILD_IMAGE_SIZE,
  GROK_BUILD_IMAGE_WIDTH,
  GROK_BUILD_MODEL,
  GROK_BUILD_PROVIDER,
  GrokBuildError,
  buildGrokBuildPrompt,
  findLatestGrokImage,
  getSessionImageDir,
  isGrokBuildAvailable,
  normalizeGrokBuildImage,
  resolveGrokBuildExecutable,
  resolveGrokHome,
  runGrokBuildImage,
};
