#!/usr/bin/env node
// 确保项目使用的正式 VoxCPM2 FastAPI 桥接服务已就绪。
// 不复用旧版 Gradio worker 桥：它没有 /v1/models，且响应头协议不完整。

"use strict";

const { spawn } = require("node:child_process");
const fs = require("node:fs");
const net = require("node:net");
const path = require("node:path");

const REPO_ROOT = path.resolve(__dirname, "..");
const DEFAULT_ROOT = "D:\\Github\\VoxCPM";
const DEFAULT_PORT = 18761;
const READY_TIMEOUT_SECONDS = 120;

function readPositiveNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseArgs(argv = process.argv, env = process.env) {
  const args = {
    port: readPositiveNumber(env.VOXCPM2_BRIDGE_PORT, DEFAULT_PORT),
    root: env.VOXCPM2_ROOT?.trim() || DEFAULT_ROOT,
    python: env.VOXCPM2_BRIDGE_PYTHON?.trim() || "",
    script: env.VOXCPM2_BRIDGE_SCRIPT?.trim() || "",
    timeoutSeconds: readPositiveNumber(env.VOXCPM2_BRIDGE_TIMEOUT_SECONDS, READY_TIMEOUT_SECONDS),
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
    script: path.resolve(args.script || path.join(root, "openai_speech_server.py")),
  };
}

function isCanonicalBridgeHealth(payload) {
  return Boolean(payload && payload.status === "ok" && payload.model_loaded === true);
}

async function isHttpReady(healthURL, fetchImpl = fetch) {
  try {
    const healthResponse = await fetchImpl(healthURL, { signal: AbortSignal.timeout(3000) });
    if (!healthResponse.ok) {
      return false;
    }
    const health = await healthResponse.json().catch(() => null);
    if (!isCanonicalBridgeHealth(health)) {
      return false;
    }

    const modelsResponse = await fetchImpl(`${new URL(healthURL).origin}/v1/models`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!modelsResponse.ok) {
      return false;
    }
    const models = await modelsResponse.json().catch(() => null);
    return Boolean(models?.data?.some((model) => model?.id === "voxcpm2"));
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
    return path.join(env.LOCALAPPDATA, "AINovel", "voxcpm2-bridge", "logs");
  }
  return path.join(REPO_ROOT, "runtime", "voxcpm2-bridge", "logs");
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

/** 端口被任何进程占用即视为已有实例（健康或正在加载模型），绝不重复拉起。 */
function isPortOccupied(port) {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.once("error", () => resolve(true));
    probe.once("listening", () => {
      probe.close(() => resolve(false));
    });
    probe.listen(port, "127.0.0.1");
  });
}

async function ensureBridge(args, fetchImpl = fetch) {
  const healthURL = `http://127.0.0.1:${args.port}/health`;
  if (await isHttpReady(healthURL, fetchImpl)) {
    console.log(`VoxCPM2 音频桥已在运行：${healthURL}`);
    return;
  }

  if (await isPortOccupied(args.port)) {
    // 端口已被占用：现有实例要么健康检查瞬时不通过，要么模型还在加载。
    // 再 spawn 一个只会造成多份模型互抢 GPU/内存，因此只等待、不重复启动。
    console.log(`端口 ${args.port} 已被占用，等待现有 VoxCPM2 音频桥就绪：${healthURL}`);
    await waitForHttpReady(healthURL, "VoxCPM2 音频桥", args.timeoutSeconds, fetchImpl);
    return;
  }

  const paths = resolvePaths(args);
  if (!fs.existsSync(paths.script)) {
    throw new Error(`未找到正式 VoxCPM2 桥接脚本：${paths.script}。请设置 VOXCPM2_ROOT 或 VOXCPM2_BRIDGE_SCRIPT。`);
  }
  if (!fs.existsSync(paths.python)) {
    throw new Error(`未找到 VoxCPM2 Python 环境：${paths.python}。请设置 VOXCPM2_BRIDGE_PYTHON。`);
  }

  const logsDir = resolveLogsDir();
  fs.mkdirSync(logsDir, { recursive: true });
  spawnDetached(paths.python, [paths.script, "--host", "127.0.0.1", "--port", String(args.port)], {
    cwd: paths.root,
    stdoutLog: path.join(logsDir, "bridge.stdout.log"),
    stderrLog: path.join(logsDir, "bridge.stderr.log"),
  });
  console.log(`已启动 VoxCPM2 音频桥，等待 ${healthURL}`);
  await waitForHttpReady(healthURL, "VoxCPM2 音频桥", args.timeoutSeconds, fetchImpl);
}

async function main() {
  const args = parseArgs();
  await ensureBridge(args);
  console.log(`VoxCPM2 音频通道已就绪：http://127.0.0.1:${args.port}/v1`);
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
  isCanonicalBridgeHealth,
  isHttpReady,
  isPortOccupied,
  parseArgs,
  resolveLogsDir,
  resolvePaths,
  spawnDetached,
  waitForHttpReady,
  ensureBridge,
};
