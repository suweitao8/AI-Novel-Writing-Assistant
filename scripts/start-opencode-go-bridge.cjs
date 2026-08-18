#!/usr/bin/env node
// 启动 OpenCode Go 文本桥接：确保本地 opencode serve + OpenAI 兼容桥都在运行。
// 已就绪的服务会被复用，因此 mydrama 项目先启动的同一套服务也能直接共用。
//
// 用法：node scripts/start-opencode-go-bridge.cjs
// 可选参数：--bridge-port 18762 --opencode-port 18763 --model opencode-go/mimo-v2.5 --timeout-seconds 900

"use strict";

const { execSync, spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const REPO_ROOT = path.resolve(__dirname, "..");
const BRIDGE_SCRIPT = path.join(__dirname, "opencode-go-bridge.cjs");
const AGENT_CONFIG_SOURCE = path.join(__dirname, "opencode-go-text-agent.json");
const READY_TIMEOUT_SECONDS = 120;

function parseArgs(argv) {
  const args = {
    bridgePort: Number(process.env.OPENCODE_TEXT_BRIDGE_PORT || 18762),
    opencodePort: Number(process.env.OPENCODE_SERVER_PORT || 18763),
    model: process.env.OPENCODE_TEXT_MODEL || "opencode-go/mimo-v2.5",
    timeoutSeconds: Number(process.env.OPENCODE_TEXT_TIMEOUT_SECONDS || 900),
  };
  for (let i = 2; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];
    if (value === undefined) {
      throw new Error(`缺少参数值：${key}`);
    }
    switch (key) {
      case "--bridge-port": args.bridgePort = Number(value); i += 1; break;
      case "--opencode-port": args.opencodePort = Number(value); i += 1; break;
      case "--model": args.model = value; i += 1; break;
      case "--timeout-seconds": args.timeoutSeconds = Number(value); i += 1; break;
      default:
        throw new Error(`未知参数：${key}`);
    }
  }
  return args;
}

function resolveRuntimeRoot() {
  if (process.env.LOCALAPPDATA) {
    return path.join(process.env.LOCALAPPDATA, "AINovel", "opencode-go-bridge");
  }
  return path.join(REPO_ROOT, "runtime", "opencode-go-bridge");
}

async function isHttpReady(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(3000) });
    if (!response.ok) {
      return false;
    }
    const payload = await response.json().catch(() => null);
    return Boolean(payload && (payload.ready === true || payload.healthy === true));
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

function resolveOpenCodeCommand() {
  // Windows 上 npm 全局命令是 opencode.cmd，直接 spawn "opencode" 会找不到。
  try {
    const lines = execSync("where opencode", { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    const cmd = lines.find((line) => line.toLowerCase().endsWith(".cmd")) || lines[0];
    if (cmd) {
      return cmd;
    }
  } catch {
    // fall through
  }
  return "opencode";
}

function quoteCommandArg(value) {
  const text = String(value);
  return /[\s"]/.test(text) ? `"${text.replace(/"/g, '\\"')}"` : text;
}

function spawnDetached(command, args, options) {
  const out = fs.openSync(options.stdoutLog, "a");
  const err = fs.openSync(options.stderrLog, "a");
  // Node 在 Windows 上直接 spawn .cmd/.bat 会抛 EINVAL（CVE-2024-27980 修复后的行为），
  // npm 全局命令都是 .cmd 垫片，所以统一经由 cmd.exe 启动。
  const launchers = process.platform === "win32"
    ? ["cmd.exe", ["/c", [command, ...args].map(quoteCommandArg).join(" ")]]
    : [command, args];
  const child = spawn(launchers[0], launchers[1], {
    cwd: options.cwd,
    detached: true,
    stdio: ["ignore", out, err],
    windowsHide: true,
  });
  child.unref();
  return child;
}

async function main() {
  const args = parseArgs(process.argv);
  const runtimeRoot = resolveRuntimeRoot();
  const workspaceDir = path.join(runtimeRoot, "workspace");
  const logsDir = path.join(runtimeRoot, "logs");
  fs.mkdirSync(workspaceDir, { recursive: true });
  fs.mkdirSync(logsDir, { recursive: true });
  if (!fs.existsSync(AGENT_CONFIG_SOURCE)) {
    throw new Error(`找不到文本 agent 配置：${AGENT_CONFIG_SOURCE}`);
  }
  fs.copyFileSync(AGENT_CONFIG_SOURCE, path.join(workspaceDir, "opencode.json"));

  const opencodeUrl = `http://127.0.0.1:${args.opencodePort}`;
  const bridgeHealthUrl = `http://127.0.0.1:${args.bridgePort}/health`;

  if (await isHttpReady(`${opencodeUrl}/global/health`)) {
    console.log(`OpenCode 服务已在运行：${opencodeUrl}/global/health`);
  } else {
    spawnDetached(resolveOpenCodeCommand(), ["serve", "--hostname", "127.0.0.1", "--port", String(args.opencodePort)], {
      cwd: workspaceDir,
      stdoutLog: path.join(logsDir, "opencode.stdout.log"),
      stderrLog: path.join(logsDir, "opencode.stderr.log"),
    });
    console.log(`已启动 OpenCode 服务，等待 ${opencodeUrl}/global/health`);
    await waitForHttpReady(`${opencodeUrl}/global/health`, "OpenCode 服务");
  }

  if (await isHttpReady(bridgeHealthUrl)) {
    console.log(`OpenCode Go 桥接已在运行：${bridgeHealthUrl}`);
  } else {
    // 绑定 0.0.0.0 与 mydrama 桥接保持一致：Docker 容器要通过 host.docker.internal 访问。
    spawnDetached(process.execPath, [
      BRIDGE_SCRIPT,
      "--host", "0.0.0.0",
      "--port", String(args.bridgePort),
      "--opencode-url", opencodeUrl,
      "--directory", workspaceDir,
      "--model", args.model,
      "--timeout-seconds", String(args.timeoutSeconds),
    ], {
      cwd: REPO_ROOT,
      stdoutLog: path.join(logsDir, "bridge.stdout.log"),
      stderrLog: path.join(logsDir, "bridge.stderr.log"),
    });
    console.log(`已启动 OpenCode Go 桥接，等待 ${bridgeHealthUrl}`);
    await waitForHttpReady(bridgeHealthUrl, "OpenCode Go 桥接");
  }

  console.log("OpenCode Go 文本通道已就绪。");
  console.log(`  模型：${args.model}`);
  console.log(`  API 地址：http://127.0.0.1:${args.bridgePort}/v1`);
  console.log(`  运行日志：${logsDir}`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
