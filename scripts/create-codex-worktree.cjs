#!/usr/bin/env node

"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { assertMainSourceIntegrity, assertWorktreeFilesystemIsolation } = require("./worktree-filesystem-safety.cjs");
const { assertNoUnresolvedWorktreeLifecycleIssues } = require("./worktree-lifecycle-audit.cjs");
const { applyLanePortsToEnvFile, resolveDevLane } = require("./dev-ports.cjs");

const PROTECTED_BRANCH = "main";
const CODEX_BRANCH_PREFIX = "codex/";

function runGit(cwd, args, { inherit = false } = {}) {
  const output = execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: inherit ? "inherit" : ["ignore", "pipe", "pipe"],
  });
  return typeof output === "string" ? output.trim() : "";
}

function currentBranch(cwd) {
  try {
    return runGit(cwd, ["symbolic-ref", "--quiet", "--short", "HEAD"]);
  } catch {
    return "HEAD";
  }
}

function hasMergeHead(cwd) {
  const mergeHead = runGit(cwd, ["rev-parse", "--git-path", "MERGE_HEAD"]);
  const mergeHeadPath = path.isAbsolute(mergeHead) ? mergeHead : path.resolve(cwd, mergeHead);
  return fs.existsSync(mergeHeadPath);
}

function workspaceChanges(cwd) {
  const output = runGit(cwd, ["status", "--porcelain=v1", "--untracked-files=all"]);
  return output ? output.split(/\r?\n/).filter(Boolean) : [];
}

function normalizeTaskSlug(value) {
  const slug = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!slug) {
    throw new Error("A non-empty task name is required; it must contain at least one letter or number.");
  }
  return slug;
}

function branchNameForTask(task) {
  return `${CODEX_BRANCH_PREFIX}${normalizeTaskSlug(task)}`;
}

function defaultWorktreePath(repoRoot, taskOrSlug) {
  const slug = normalizeTaskSlug(taskOrSlug);
  return path.join(path.dirname(repoRoot), `${path.basename(repoRoot)}-${slug}`);
}

function branchExists(cwd, branchName) {
  try {
    runGit(cwd, ["show-ref", "--verify", "--quiet", `refs/heads/${branchName}`]);
    return true;
  } catch {
    return false;
  }
}

function assertMainWorkspaceReady(cwd, { allowLifecycleRepair = false } = {}) {
  assertMainSourceIntegrity({ cwd, phase: "worktree creation" });
  if (!allowLifecycleRepair) {
    assertNoUnresolvedWorktreeLifecycleIssues({ cwd, phase: "worktree creation" });
  }

  if (currentBranch(cwd) !== PROTECTED_BRANCH) {
    throw new Error("Worktree creation must start from the protected main branch.");
  }
  const changes = workspaceChanges(cwd);
  if (changes.length > 0) {
    throw new Error([
      "main workspace is not clean; do not create a task from an unfinished main edit.",
      ...changes,
      "Finish or deliberately recover the main state, then run this command again.",
    ].join("\n"));
  }
  if (hasMergeHead(cwd)) {
    throw new Error("main workspace has an unfinished merge (MERGE_HEAD); complete or abort it before creating a worktree.");
  }
}

function runSetup(worktreePath) {
  try {
    if (process.platform === "win32") {
      execFileSync(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", "pnpm setup:git-hooks"], {
        cwd: worktreePath,
        stdio: "inherit",
        windowsHide: true,
      });
    } else {
      execFileSync("pnpm", ["setup:git-hooks"], { cwd: worktreePath, stdio: "inherit" });
    }
  } catch (error) {
    throw new Error(
      `pnpm setup:git-hooks failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function runPnpmCommand(cwd, command, failureLabel) {
  try {
    if (process.platform === "win32") {
      execFileSync(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", command], {
        cwd,
        stdio: "inherit",
        windowsHide: true,
      });
    } else {
      execFileSync("pnpm", command.split(/\s+/), { cwd, stdio: "inherit" });
    }
  } catch (error) {
    throw new Error(`${failureLabel} failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// 为新 worktree 开一条独立 dev 车道：端口确定性推导后写入其 server/.env，
// 主工作区车道（3100/5174）与其他 worktree 车道互不抢占。
function provisionWorktreeDevLane(repoRoot, worktreePath) {
  const mainEnvPath = path.join(repoRoot, "server", ".env");
  const worktreeEnvPath = path.join(worktreePath, "server", ".env");
  if (fs.existsSync(mainEnvPath) && !fs.existsSync(worktreeEnvPath)) {
    fs.copyFileSync(mainEnvPath, worktreeEnvPath);
  }
  const lane = resolveDevLane(worktreePath);
  fs.mkdirSync(path.dirname(worktreeEnvPath), { recursive: true });
  applyLanePortsToEnvFile(worktreeEnvPath, { apiPort: lane.apiPort, clientPort: lane.clientPort });
  return lane;
}

// core.hooksPath 是整个仓库（含所有 worktree）共享的单份配置；
// 只有主工作区应该持有它，worktree 创建不得抢占，否则主区提交/集成守卫失效。
function installGitHooks(repoRoot) {
  runPnpmCommand(repoRoot, "pnpm setup:git-hooks", "pnpm setup:git-hooks (main workspace)");
}

function runInstall(worktreePath) {
  try {
    if (process.platform === "win32") {
      execFileSync(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", "pnpm install --frozen-lockfile"], {
        cwd: worktreePath,
        stdio: "inherit",
        windowsHide: true,
      });
    } else {
      execFileSync("pnpm", ["install", "--frozen-lockfile"], {
        cwd: worktreePath,
        stdio: "inherit",
      });
    }
  } catch (error) {
    throw new Error(
      `pnpm install --frozen-lockfile failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function removeCreatedWorktree(cwd, targetPath, branchName) {
  try {
    runGit(cwd, ["worktree", "remove", targetPath]);
  } catch (error) {
    // 创建流程自身会写入未跟踪文件（如 server/.env 车道端口），此时用 --force 才能移除。
    // 该 worktree 刚刚创建、只含本脚本生成的内容，强制移除是安全的。
    try {
      runGit(cwd, ["worktree", "remove", "--force", targetPath]);
    } catch (forceError) {
      return {
        removed: false,
        error: new Error([
          `Created worktree was kept because controlled removal failed: ${targetPath}`,
          forceError instanceof Error ? forceError.message : String(forceError),
          `Do not recursively delete it. Inspect it, then use 'pnpm workflow:cleanup' only after the branch is intentionally integrated.`,
        ].join("\n")),
      };
    }
  }
  try {
    runGit(cwd, ["branch", "-D", branchName]);
  } catch (error) {
    return {
      removed: true,
      error: new Error([
        `Created worktree was removed but branch deletion failed: ${branchName}`,
        error instanceof Error ? error.message : String(error),
      ].join("\n")),
    };
  }
  return { removed: true, error: null };
}

function createWorktree({ cwd = process.cwd(), task, targetPath, allowLifecycleRepair = false } = {}) {
  const repoRoot = path.resolve(runGit(cwd, ["rev-parse", "--show-toplevel"]));
  const slug = normalizeTaskSlug(task);
  const branchName = `${CODEX_BRANCH_PREFIX}${slug}`;
  const resolvedTarget = path.resolve(targetPath ?? defaultWorktreePath(repoRoot, slug));

  assertMainWorkspaceReady(repoRoot, { allowLifecycleRepair });
  if (branchExists(repoRoot, branchName)) {
    throw new Error(`Branch collision: ${branchName} already exists.`);
  }
  if (fs.existsSync(resolvedTarget)) {
    throw new Error(`Worktree path collision: ${resolvedTarget} already exists.`);
  }

  runGit(repoRoot, ["worktree", "add", "-b", branchName, resolvedTarget, PROTECTED_BRANCH], { inherit: true });
  let lane = null;
  try {
    runInstall(resolvedTarget);
    assertWorktreeFilesystemIsolation({ cwd: resolvedTarget, phase: "worktree creation" });
    installGitHooks(repoRoot);
    // 车道端口写在最后：此后失败时 worktree 已带未跟踪的 server/.env，需要强制移除。
    lane = provisionWorktreeDevLane(repoRoot, resolvedTarget);
  } catch (error) {
    const cleanup = removeCreatedWorktree(repoRoot, resolvedTarget, branchName);
    if (cleanup.error) {
      throw new Error(`${error instanceof Error ? error.message : String(error)}\n${cleanup.error.message}`);
    }
    throw error;
  }

  return { branchName, lane, repoRoot, slug, worktreePath: resolvedTarget };
}

function printHelp() {
  console.log("Usage: pnpm workflow:worktree <task-name>");
  console.log("Creates a sibling codex/<task-name> worktree from a clean main workspace, provisions its isolated dev ports, and keeps Git hooks owned by the main workspace.");
  console.log("Use --repair-lifecycle only for an isolated workflow-guard repair when workflow:audit reports a blocker.");
}

function parseArgs(argv) {
  const [task, ...options] = argv;
  if (!task || task.startsWith("--")) {
    throw new Error("Worktree creation requires a task name first.");
  }
  let allowLifecycleRepair = false;
  for (const option of options) {
    if (option === "--repair-lifecycle") {
      allowLifecycleRepair = true;
      continue;
    }
    throw new Error(`Unknown worktree creation option: ${option}`);
  }
  return { allowLifecycleRepair, task };
}

function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    printHelp();
    if (args.length === 0) process.exitCode = 1;
    return;
  }

  const result = createWorktree({ ...parseArgs(args), cwd: process.cwd() });
  console.log(`Worktree ready: ${result.worktreePath}`);
  console.log(`Branch: ${result.branchName}`);
  if (result.lane) {
    console.log(`Dev lane: API http://127.0.0.1:${result.lane.apiPort} / Web http://127.0.0.1:${result.lane.clientPort} (written to server/.env; main workspace keeps 3100/5174)`);
  }
  console.log(`Continue development from: ${result.worktreePath}`);
}

try {
  if (require.main === module) {
    main();
  }
} catch (error) {
  console.error(`[workflow:worktree] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}

module.exports = {
  PROTECTED_BRANCH,
  CODEX_BRANCH_PREFIX,
  assertMainWorkspaceReady,
  branchExists,
  branchNameForTask,
  createWorktree,
  currentBranch,
  defaultWorktreePath,
  hasMergeHead,
  installGitHooks,
  normalizeTaskSlug,
  parseArgs,
  provisionWorktreeDevLane,
  removeCreatedWorktree,
  runInstall,
  runSetup,
  workspaceChanges,
};
