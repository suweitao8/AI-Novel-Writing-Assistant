#!/usr/bin/env node

"use strict";

const { spawn, spawnSync } = require("node:child_process");
const { assertStartupIntegrity } = require("./workspace-integrity-guard.cjs");

const DEFAULT_MAX_RESTARTS = 3;
const DEFAULT_RESTART_DELAY_MS = 1000;
const SHUTDOWN_TIMEOUT_MS = 2000;
const DEFAULT_SERVICES = [
  { name: "shared", script: "dev:shared" },
  { name: "server", script: "dev:server" },
  { name: "client", script: "dev:client" },
];

function delayForRestart(restartNumber, restartDelayMs) {
  return restartDelayMs * 2 ** Math.max(0, restartNumber - 1);
}

function commandForService(service) {
  if (Array.isArray(service.command) && service.command.length > 0) {
    return { file: service.command[0], args: service.command.slice(1) };
  }
  if (!service.script) throw new Error(`Service ${service.name ?? "unknown"} has no command or script.`);
  if (process.platform === "win32") {
    return {
      file: process.env.ComSpec || "cmd.exe",
      args: ["/d", "/s", "/c", `pnpm ${service.script}`],
    };
  }
  return { file: "pnpm", args: [service.script] };
}

function terminateChild(child) {
  if (!child || child.exitCode !== null || child.killed) return;
  if (process.platform === "win32" && child.pid) {
    spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
    });
    return;
  }
  child.kill("SIGTERM");
}

function runServiceGroup({
  cwd = process.cwd(),
  env = process.env,
  handleSignals = false,
  maxRestarts = DEFAULT_MAX_RESTARTS,
  onServiceStart,
  restartDelayMs = DEFAULT_RESTART_DELAY_MS,
  services = DEFAULT_SERVICES,
  spawnProcess = spawn,
} = {}) {
  if (!Array.isArray(services) || services.length === 0) {
    return Promise.resolve({ exitCode: 0, reason: "no services configured" });
  }

  return new Promise((resolve) => {
    const states = services.map((service) => ({ service, restartCount: 0 }));
    const active = new Map();
    const restartTimers = new Set();
    let shuttingDown = false;
    let settled = false;
    let shutdownTimer = null;
    let failureReason = "";
    const signalHandlers = new Map();

    function cleanupSignals() {
      for (const [signal, handler] of signalHandlers) process.removeListener(signal, handler);
      signalHandlers.clear();
    }

    function settle(exitCode, reason) {
      if (settled) return;
      settled = true;
      if (shutdownTimer) clearTimeout(shutdownTimer);
      cleanupSignals();
      resolve({ exitCode, reason });
    }

    function finishShutdown() {
      if (active.size === 0) settle(1, failureReason);
    }

    function shutdown(reason, exitCode = 1) {
      if (shuttingDown) return;
      shuttingDown = true;
      failureReason = reason;
      for (const timer of restartTimers) clearTimeout(timer);
      restartTimers.clear();
      for (const child of active.values()) terminateChild(child);
      if (active.size === 0) {
        settle(exitCode, reason);
        return;
      }
      shutdownTimer = setTimeout(() => settle(exitCode, reason), SHUTDOWN_TIMEOUT_MS);
    }

    function handleChildExit(state, child, code, signal, error) {
      if (active.get(state.service.name) !== child) return;
      active.delete(state.service.name);
      if (shuttingDown) {
        finishShutdown();
        return;
      }

      const normalExit = !error && code === 0 && !signal;
      if (normalExit) {
        shutdown(`service ${state.service.name} exited unexpectedly with code 0`);
        return;
      }

      if (state.restartCount < maxRestarts) {
        state.restartCount += 1;
        const timer = setTimeout(() => {
          restartTimers.delete(timer);
          if (!shuttingDown) spawnService(state);
        }, delayForRestart(state.restartCount, restartDelayMs));
        restartTimers.add(timer);
        return;
      }

      const detail = error ? error.message : `code=${code ?? "null"} signal=${signal ?? "none"}`;
      shutdown(`service ${state.service.name} failed after ${state.restartCount} restarts (${detail})`);
    }

    function spawnService(state) {
      const command = commandForService(state.service);
      const childEnv = {
        ...env,
        AI_NOVEL_SERVICE_NAME: state.service.name,
        AI_NOVEL_SERVICE_RESTART_COUNT: String(state.restartCount),
      };
      const child = spawnProcess(command.file, command.args, {
        cwd,
        env: childEnv,
        shell: false,
        stdio: "inherit",
        windowsHide: true,
      });
      active.set(state.service.name, child);
      if (onServiceStart) onServiceStart({ name: state.service.name, restartCount: state.restartCount });
      let handled = false;
      const handleOnce = (code, signal, error) => {
        if (handled) return;
        handled = true;
        handleChildExit(state, child, code, signal, error);
      };
      child.once("error", (error) => handleOnce(null, null, error));
      child.once("exit", (code, signal) => handleOnce(code, signal, null));
    }

    if (handleSignals) {
      for (const signal of ["SIGINT", "SIGTERM"]) {
        const handler = () => shutdown(`received ${signal}`, 130);
        signalHandlers.set(signal, handler);
        process.once(signal, handler);
      }
    }

    for (const state of states) spawnService(state);
  });
}

function assertSupervisorStartupIntegrity({ cwd = process.cwd() } = {}) {
  assertStartupIntegrity({ cwd });
}

// core.hooksPath 是全仓库（含所有 worktree）共享的单份 git 配置，由主工作区持有。
// 这里只在主工作区启动 dev 时自愈：被其他 checkout 的安装动作劫持或丢失时修复回本 checkout。
// worktree 启动 dev 时绝不改写，避免与主区以及其他 worktree 互相抢占。
function repairMainWorkspaceHooksPath({ cwd = process.cwd() } = {}) {
  if (!isMainWorkspaceCheckout(cwd)) {
    return false;
  }
  const toplevelResult = spawnSync("git", ["rev-parse", "--show-toplevel"], {
    cwd,
    encoding: "utf8",
    windowsHide: true,
  });
  if (toplevelResult.status !== 0) {
    return false;
  }
  const toplevel = path.resolve(toplevelResult.stdout.trim());
  const expectedHooksPath = path.join(toplevel, ".githooks");
  const currentResult = spawnSync("git", ["config", "--local", "--get", "core.hooksPath"], {
    cwd: toplevel,
    encoding: "utf8",
    windowsHide: true,
  });
  const currentHooksPath = currentResult.status === 0 ? currentResult.stdout.trim() : "";
  if (currentHooksPath && path.resolve(currentHooksPath) === expectedHooksPath) {
    return false;
  }
  const repair = spawnSync(
    process.execPath,
    [path.join(toplevel, "scripts", "install-git-hooks.cjs")],
    { cwd: toplevel, encoding: "utf8", windowsHide: true },
  );
  if (repair.status !== 0) {
    console.error(`[dev-supervisor] hooks path repair failed: ${repair.stderr || "unknown error"}`);
    return false;
  }
  console.error("[dev-supervisor] repaired main workspace core.hooksPath back to this checkout's .githooks.");
  return true;
}

async function main() {
  const cwd = process.cwd();
  repairMainWorkspaceHooksPath({ cwd });
  assertSupervisorStartupIntegrity({ cwd });
  const result = await runServiceGroup({ handleSignals: true });
  if (result.reason) console.error(`[dev-supervisor] ${result.reason}`);
  process.exitCode = result.exitCode;
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`[dev-supervisor] ${error.message || error}`);
    process.exitCode = 1;
  });
}

module.exports = {
  DEFAULT_MAX_RESTARTS,
  DEFAULT_RESTART_DELAY_MS,
  DEFAULT_SERVICES,
  commandForService,
  delayForRestart,
  assertSupervisorStartupIntegrity,
  repairMainWorkspaceHooksPath,
  runServiceGroup,
  terminateChild,
};
