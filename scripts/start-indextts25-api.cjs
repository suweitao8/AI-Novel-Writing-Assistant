#!/usr/bin/env node
// 确保 IndexTTS 2.5 的独立 FastAPI 服务已就绪。
// 9000 端口的“启动.bat”网页工作台与 9005 端口的 API 是两个进程；
// 项目开发启动链只管理 API，网页仍可由整合包启动脚本单独打开。

"use strict";

const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const REPO_ROOT = path.resolve(__dirname, "..");
const DEFAULT_ROOT = "D:\\Tools\\yzy-index-tts-2.5-260824";
const DEFAULT_PORT = 9005;
const READY_TIMEOUT_SECONDS = 120;

function readPositiveNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseArgs(argv = process.argv, env = process.env) {
  const args = {
    port: readPositiveNumber(env.INDEXTTS25_API_PORT, DEFAULT_PORT),
    root: env.INDEXTTS25_ROOT?.trim() || DEFAULT_ROOT,
    python: env.INDEXTTS25_API_PYTHON?.trim() || "",
    script: env.INDEXTTS25_API_SCRIPT?.trim() || "",
    timeoutSeconds: readPositiveNumber(env.INDEXTTS25_API_TIMEOUT_SECONDS, READY_TIMEOUT_SECONDS),
  };

  for (let index = 2; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];
    if (value === undefined) {
      throw new Error(`缺少参数值：${key}`);
    }
    switch (key) {
      case "--port": args.port = readPositiveNumber(value, args.port); index += 1; break;
      case "--root": args.root = value; index += 1; break;
      case "--python": args.python = value; index += 1; break;
      case "--script": args.script = value; index += 1; break;
      case "--timeout-seconds": args.timeoutSeconds = readPositiveNumber(value, args.timeoutSeconds); index += 1; break;
      default: throw new Error(`未知参数：${key}`);
    }
  }
  return args;
}

function resolvePaths(args) {
  const root = path.resolve(args.root);
  return {
    root,
    python: path.resolve(args.python || path.join(root, ".venv", "Scripts", "python.exe")),
    script: path.resolve(args.script || path.join(root, "app_api.py")),
    webuiLauncher: path.join(root, "启动.bat"),
  };
}

function isIndexTTS25Health(payload) {
  return Boolean(payload && payload.status === "ok");
}

async function isHttpReady(healthURL, fetchImpl = fetch) {
  try {
    const response = await fetchImpl(healthURL, { signal: AbortSignal.timeout(3000) });
    if (!response.ok) {
      return false;
    }
    const payload = await response.json().catch(() => null);
    return isIndexTTS25Health(payload);
  } catch {
    return false;
  }
}

async function waitForHttpReady(url, label, timeoutSeconds = READY_TIMEOUT_SECONDS, fetchImpl = fetch) {
  const deadline = Date.now() + timeoutSeconds * 1000;
  while (Date.now() < deadline) {
    if (await isHttpReady(url, fetchImpl)) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error(`${label} 在 ${timeoutSeconds} 秒内未就绪：${url}`);
}

function resolveLogsDir(env = process.env) {
  if (env.LOCALAPPDATA) {
    return path.join(env.LOCALAPPDATA, "AINovel", "indextts25-api", "logs");
  }
  return path.join(REPO_ROOT, "runtime", "indextts25-api", "logs");
}

function spawnDetached(command, args, options) {
  const stdout = fs.openSync(options.stdoutLog, "a");
  const stderr = fs.openSync(options.stderrLog, "a");
  const child = spawn(command, args, {
    cwd: options.cwd,
    detached: true,
    stdio: ["ignore", stdout, stderr],
    windowsHide: true,
  });
  child.unref();
  return child;
}

async function ensureIndexTTS25Api(args, fetchImpl = fetch) {
  const healthURL = `http://127.0.0.1:${args.port}/health`;
  if (await isHttpReady(healthURL, fetchImpl)) {
    console.log(`IndexTTS 2.5 API 已在运行：${healthURL}`);
    return;
  }

  const paths = resolvePaths(args);
  if (!fs.existsSync(paths.script)) {
    throw new Error(`未找到 IndexTTS 2.5 API 脚本：${paths.script}。请设置 INDEXTTS25_ROOT 或 INDEXTTS25_API_SCRIPT。`);
  }
  if (!fs.existsSync(paths.python)) {
    throw new Error(`未找到 IndexTTS 2.5 Python 环境：${paths.python}。请设置 INDEXTTS25_ROOT 或 INDEXTTS25_API_PYTHON。`);
  }

  const logsDir = resolveLogsDir();
  fs.mkdirSync(logsDir, { recursive: true });
  spawnDetached(paths.python, ["-u", paths.script, "--host", "127.0.0.1", "--port", String(args.port)], {
    cwd: paths.root,
    stdoutLog: path.join(logsDir, "api.stdout.log"),
    stderrLog: path.join(logsDir, "api.stderr.log"),
  });
  console.log(`已启动 IndexTTS 2.5 API，等待 ${healthURL}`);
  await waitForHttpReady(healthURL, "IndexTTS 2.5 API", args.timeoutSeconds, fetchImpl);
}

async function main() {
  const args = parseArgs();
  await ensureIndexTTS25Api(args);
  console.log(`IndexTTS 2.5 音频通道已就绪：http://127.0.0.1:${args.port}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  });
}

module.exports = {
  DEFAULT_ROOT,
  DEFAULT_PORT,
  READY_TIMEOUT_SECONDS,
  isIndexTTS25Health,
  isHttpReady,
  parseArgs,
  resolveLogsDir,
  resolvePaths,
  spawnDetached,
  waitForHttpReady,
  ensureIndexTTS25Api,
};
