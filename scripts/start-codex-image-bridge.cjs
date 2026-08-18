#!/usr/bin/env node
// 启动 Codex 图片桥接：确保本机 18766 端口上的 OpenAI Images 兼容桥在运行。
// 已就绪的桥会被复用，因此 mydrama 项目先启动的同一套桥也能直接共用。
//
// 用法：node scripts/start-codex-image-bridge.cjs
// 可选参数：--port 18766

"use strict";

const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const REPO_ROOT = path.resolve(__dirname, "..");
const BRIDGE_SCRIPT = path.join(__dirname, "codex-image-bridge.cjs");
const READY_TIMEOUT_SECONDS = 120;

function parseArgs(argv) {
  const args = {
    port: Number(process.env.CODEX_IMAGE_BRIDGE_PORT || 18766),
  };
  for (let i = 2; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];
    if (value === undefined) {
      throw new Error(`缺少参数值：${key}`);
    }
    switch (key) {
      case "--port": args.port = Number(value); i += 1; break;
      default:
        throw new Error(`未知参数：${key}`);
    }
  }
  return args;
}

function resolveLogsDir() {
  if (process.env.LOCALAPPDATA) {
    return path.join(process.env.LOCALAPPDATA, "AINovel", "codex-image-bridge", "logs");
  }
  return path.join(REPO_ROOT, "runtime", "codex-image-bridge", "logs");
}

async function isHttpReady(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(3000) });
    if (!response.ok) {
      return false;
    }
    const payload = await response.json().catch(() => null);
    return Boolean(payload && payload.ready === true);
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

async function main() {
  const args = parseArgs(process.argv);
  const logsDir = resolveLogsDir();
  fs.mkdirSync(logsDir, { recursive: true });
  const healthUrl = `http://127.0.0.1:${args.port}/health`;

  if (await isHttpReady(healthUrl)) {
    console.log(`Codex 图片桥已在运行：${healthUrl}`);
  } else {
    const out = fs.openSync(path.join(logsDir, "bridge.stdout.log"), "a");
    const err = fs.openSync(path.join(logsDir, "bridge.stderr.log"), "a");
    // 绑定 0.0.0.0 与 mydrama 桥保持一致：Docker 容器要通过 host.docker.internal 访问。
    const child = spawn(process.execPath, [BRIDGE_SCRIPT, "--host", "0.0.0.0", "--port", String(args.port)], {
      cwd: REPO_ROOT,
      detached: true,
      stdio: ["ignore", out, err],
      windowsHide: true,
    });
    child.unref();
    console.log(`已启动 Codex 图片桥，等待 ${healthUrl}`);
    await waitForHttpReady(healthUrl, "Codex 图片桥");
  }

  console.log("Codex 图片通道已就绪。");
  console.log("  模型：gpt-image-2（Codex 订阅内置图片生成）");
  console.log(`  API 地址：http://127.0.0.1:${args.port}/v1`);
  console.log(`  运行日志：${logsDir}`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
