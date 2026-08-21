#!/usr/bin/env node
// 启动本机 Grok Build 文本与图片桥接服务。
// 两个桥接都复用本机已登录的 grok CLI 订阅，不启动 API 或前端服务。
//
// 用法：pnpm grok:bridge
// 可选参数：--text-port 18764 --image-port 18767 --timeout-seconds 600 --cli-path <path>

"use strict";

const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const REPO_ROOT = path.resolve(__dirname, "..");
const TEXT_BRIDGE_SCRIPT = path.join(__dirname, "grok-cli-bridge.cjs");
const IMAGE_BRIDGE_SCRIPT = path.join(__dirname, "grok-build-image-bridge.cjs");
const READY_TIMEOUT_SECONDS = 120;

function readNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseArgs(argv, env = process.env) {
  const args = {
    textPort: readNumber(env.GROK_CLI_BRIDGE_PORT, 18764),
    imagePort: readNumber(env.GROK_IMAGE_BRIDGE_PORT, 18767),
    textModel: env.GROK_CLI_MODEL || "grok-cli/grok-4.6",
    imageModel: env.GROK_IMAGE_MODEL || "grok-build-image",
    timeoutSeconds: readNumber(env.GROK_CLI_TIMEOUT_SECONDS || env.GROK_BUILD_TIMEOUT_SECONDS, 600),
    cliPath: env.GROK_CLI_PATH || env.GROK_BUILD_EXECUTABLE || "",
  };

  for (let index = 2; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];
    if (value === undefined) {
      throw new Error(`缺少参数值：${key}`);
    }
    switch (key) {
      case "--text-port": args.textPort = readNumber(value, args.textPort); index += 1; break;
      case "--image-port": args.imagePort = readNumber(value, args.imagePort); index += 1; break;
      case "--text-model": args.textModel = value; index += 1; break;
      case "--image-model": args.imageModel = value; index += 1; break;
      case "--model": args.textModel = value; index += 1; break;
      case "--timeout-seconds": args.timeoutSeconds = readNumber(value, args.timeoutSeconds); index += 1; break;
      case "--cli-path": args.cliPath = value; index += 1; break;
      default: throw new Error(`未知参数：${key}`);
    }
  }
  return args;
}

function resolveLogsDir(env = process.env) {
  if (env.LOCALAPPDATA) {
    return path.join(env.LOCALAPPDATA, "AINovel", "grok-build-bridge", "logs");
  }
  return path.join(REPO_ROOT, "runtime", "grok-build-bridge", "logs");
}

function buildBridgeLaunches(args) {
  const common = ["--host", "0.0.0.0", "--timeout-seconds", String(args.timeoutSeconds)];
  const cliPathArgs = args.cliPath ? ["--cli-path", args.cliPath] : [];
  return [
    {
      name: "grok-cli-text",
      label: "Grok Build 文本桥",
      script: TEXT_BRIDGE_SCRIPT,
      port: args.textPort,
      model: args.textModel,
      healthURL: `http://127.0.0.1:${args.textPort}/health`,
      args: [TEXT_BRIDGE_SCRIPT, ...common, "--port", String(args.textPort), "--model", args.textModel, ...cliPathArgs],
    },
    {
      name: "grok-build-image",
      label: "Grok Build 图片桥",
      script: IMAGE_BRIDGE_SCRIPT,
      port: args.imagePort,
      model: args.imageModel,
      healthURL: `http://127.0.0.1:${args.imagePort}/health`,
      args: [IMAGE_BRIDGE_SCRIPT, ...common, "--port", String(args.imagePort), "--model", args.imageModel, ...cliPathArgs],
    },
  ];
}

async function isHttpReady(url, fetchImpl = fetch) {
  try {
    const response = await fetchImpl(url, { signal: AbortSignal.timeout(3000) });
    if (!response.ok) {
      return false;
    }
    const payload = await response.json().catch(() => null);
    return payload?.ready === true;
  } catch {
    return false;
  }
}

async function waitForHttpReady(url, label) {
  const deadline = Date.now() + READY_TIMEOUT_SECONDS * 1000;
  while (Date.now() < deadline) {
    if (await isHttpReady(url)) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error(`${label} 在 ${READY_TIMEOUT_SECONDS} 秒内未就绪：${url}`);
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

async function ensureBridge(launch, logsDir) {
  if (await isHttpReady(launch.healthURL)) {
    console.log(`${launch.label}已在运行：${launch.healthURL}`);
    return;
  }

  spawnDetached(process.execPath, launch.args, {
    cwd: REPO_ROOT,
    stdoutLog: path.join(logsDir, `${launch.name}.stdout.log`),
    stderrLog: path.join(logsDir, `${launch.name}.stderr.log`),
  });
  console.log(`已启动${launch.label}，等待 ${launch.healthURL}`);
  await waitForHttpReady(launch.healthURL, launch.label);
}

async function main() {
  const args = parseArgs(process.argv);
  const logsDir = resolveLogsDir();
  fs.mkdirSync(logsDir, { recursive: true });

  for (const launch of buildBridgeLaunches(args)) {
    await ensureBridge(launch, logsDir);
  }

  console.log("Grok Build 文本与图片通道已就绪。");
  console.log(`  文本模型：${args.textModel} → http://127.0.0.1:${args.textPort}/v1`);
  console.log(`  图片模型：${args.imageModel} → http://127.0.0.1:${args.imagePort}/v1`);
  console.log(`  运行日志：${logsDir}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  });
}

module.exports = {
  READY_TIMEOUT_SECONDS,
  buildBridgeLaunches,
  ensureBridge,
  isHttpReady,
  main,
  parseArgs,
  resolveLogsDir,
  spawnDetached,
  waitForHttpReady,
};
