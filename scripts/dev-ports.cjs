#!/usr/bin/env node

"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

// 多会话并行开发的车道（lane）端口模型：
// - 主工作区是用户面对的固定车道：API 3100 / Web 5174，永不漂移；
// - 每个 codex/* worktree 是一条独立车道，端口由 checkout 路径确定性推导，
//   并在 worktree 创建时写入其 server/.env（PORT= / CLIENT_PORT=）。
// 因此并行会话各自启动 dev 服务互不抢占，stop-stale 清理也只作用于本 checkout。
const MAIN_LANE_API_PORT = 3100;
const MAIN_LANE_CLIENT_PORT = 5174;
const WORKTREE_API_PORT_BASE = 3101;
const WORKTREE_API_PORT_SPAN = 99;
const WORKTREE_CLIENT_PORT_BASE = 5180;
const WORKTREE_CLIENT_PORT_SPAN = 200;

function isMainWorkspaceCheckout(checkoutPath) {
  // 主工作区的 .git 是目录；worktree 的 .git 是指向真实 gitdir 的文件。
  const gitPath = path.join(path.resolve(checkoutPath), ".git");
  try {
    return fs.statSync(gitPath).isDirectory();
  } catch {
    return false;
  }
}

function hashCheckoutPath(checkoutPath) {
  const normalized = path.resolve(checkoutPath).toLowerCase().replace(/\\/g, "/");
  let hash = 0x811c9dc5;
  for (let index = 0; index < normalized.length; index += 1) {
    hash ^= normalized.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

function lanePortsForWorktree(checkoutPath) {
  const hash = hashCheckoutPath(checkoutPath);
  return {
    apiPort: WORKTREE_API_PORT_BASE + (hash % WORKTREE_API_PORT_SPAN),
    clientPort: WORKTREE_CLIENT_PORT_BASE + (hash % WORKTREE_CLIENT_PORT_SPAN),
  };
}

function isPortLikelyFree(port) {
  const probe = [
    "const net = require('node:net');",
    `const server = net.createServer();`,
    `server.once('error', () => { console.log('busy'); });`,
    `server.once('listening', () => { server.close(() => console.log('free')); });`,
    `server.listen(${Number(port)}, '127.0.0.1');`,
  ].join("");
  try {
    const output = execFileSync(process.execPath, ["-e", probe], {
      encoding: "utf8",
      timeout: 5000,
      stdio: ["ignore", "pipe", "ignore"],
      windowsHide: true,
    }).trim();
    return output === "free";
  } catch {
    // 探测失败按占用处理，让端口选择继续向后找。
    return false;
  }
}

function pickFreeLanePort(preferredPort, spanBase, spanSize) {
  let candidate = preferredPort;
  for (let attempt = 0; attempt < spanSize; attempt += 1) {
    if (isPortLikelyFree(candidate)) {
      return candidate;
    }
    const offset = candidate + 1 - spanBase;
    candidate = spanBase + (offset % spanSize);
  }
  return preferredPort;
}

function resolveDevLane(checkoutPath) {
  const root = path.resolve(checkoutPath);
  if (isMainWorkspaceCheckout(root)) {
    return {
      isMainLane: true,
      apiPort: MAIN_LANE_API_PORT,
      clientPort: MAIN_LANE_CLIENT_PORT,
    };
  }
  const preferred = lanePortsForWorktree(root);
  return {
    isMainLane: false,
    apiPort: pickFreeLanePort(preferred.apiPort, WORKTREE_API_PORT_BASE, WORKTREE_API_PORT_SPAN),
    clientPort: pickFreeLanePort(preferred.clientPort, WORKTREE_CLIENT_PORT_BASE, WORKTREE_CLIENT_PORT_SPAN),
  };
}

function applyLanePortsToEnvFile(envPath, { apiPort, clientPort }) {
  const desired = [
    { key: "PORT", value: String(apiPort) },
    { key: "CLIENT_PORT", value: String(clientPort) },
  ];
  const raw = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
  const lines = raw ? raw.split(/\r?\n/) : [];
  for (const entry of desired) {
    const activePattern = new RegExp(`^${entry.key}=(.*)$`);
    const activeIndex = lines.findIndex((line) => activePattern.test(line));
    if (activeIndex >= 0) {
      lines[activeIndex] = `${entry.key}=${entry.value}`;
    } else {
      lines.push(`${entry.key}=${entry.value}`);
    }
  }
  fs.writeFileSync(envPath, lines.join("\n"), "utf8");
}

function readLanePortsFromEnvFile(envPath) {
  if (!fs.existsSync(envPath)) {
    return null;
  }
  const raw = fs.readFileSync(envPath, "utf8");
  const readPort = (key) => {
    const match = new RegExp(`^${key}=(\\d+)\\s*$`, "m").exec(raw);
    return match ? Number(match[1]) : null;
  };
  const apiPort = readPort("PORT");
  const clientPort = readPort("CLIENT_PORT");
  if (!apiPort || !clientPort) {
    return null;
  }
  return { apiPort, clientPort };
}

module.exports = {
  MAIN_LANE_API_PORT,
  MAIN_LANE_CLIENT_PORT,
  WORKTREE_API_PORT_BASE,
  WORKTREE_API_PORT_SPAN,
  WORKTREE_CLIENT_PORT_BASE,
  WORKTREE_CLIENT_PORT_SPAN,
  applyLanePortsToEnvFile,
  hashCheckoutPath,
  isMainWorkspaceCheckout,
  isPortLikelyFree,
  lanePortsForWorktree,
  pickFreeLanePort,
  readLanePortsFromEnvFile,
  resolveDevLane,
};
