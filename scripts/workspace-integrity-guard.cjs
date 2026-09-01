#!/usr/bin/env node

"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const {
  assertMainSourceIntegrity,
  assertWorktreeFilesystemIsolation,
} = require("./worktree-filesystem-safety.cjs");

const PROTECTED_BRANCH = "main";

function fail(message) {
  throw new Error(`[workspace-integrity-guard] ${message}`);
}

function git(cwd, args) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
}

function currentBranch(cwd) {
  try {
    return git(cwd, ["symbolic-ref", "--quiet", "--short", "HEAD"]);
  } catch {
    return "HEAD";
  }
}

function repositoryRoot(cwd) {
  return git(cwd, ["rev-parse", "--show-toplevel"]);
}

function mergeHeadPath(cwd) {
  const configuredPath = git(cwd, ["rev-parse", "--git-path", "MERGE_HEAD"]);
  return path.isAbsolute(configuredPath) ? configuredPath : path.resolve(cwd, configuredPath);
}

function hasMergeHead(cwd) {
  return fs.existsSync(mergeHeadPath(cwd));
}

function mainWorkspaceChanges(cwd) {
  const output = git(cwd, ["status", "--porcelain=v1", "--untracked-files=all"]);
  return output ? output.split(/\r?\n/).filter(Boolean) : [];
}

function configuredHooksPath(cwd) {
  try {
    return git(cwd, ["config", "--local", "--get", "core.hooksPath"]);
  } catch {
    return "";
  }
}

// 本文件会被测试夹具单文件拷贝使用，保持自包含、不要 require 仓库内其他脚本。
// core.hooksPath 是全仓库共享的单份配置，由主工作区持有。
// 主工作区要求指向自己的 .githooks；worktree 接受指向主工作区的 .githooks，
// 这样并行 worktree 的创建/删除不会反复劫持主区的提交与集成守卫。
function isMainWorkspaceCheckout(toplevel) {
  // 主工作区的 .git 是目录；worktree 的 .git 是指向真实 gitdir 的文件。
  try {
    return fs.statSync(path.join(toplevel, ".git")).isDirectory();
  } catch {
    return false;
  }
}

function mainWorkspaceRootForWorktree(cwd) {
  const toplevel = repositoryRoot(cwd);
  const gitPath = path.join(toplevel, ".git");
  let raw;
  try {
    raw = fs.readFileSync(gitPath, "utf8");
  } catch {
    return null;
  }
  const match = /^gitdir:\s*(.+)$/m.exec(raw);
  if (!match) {
    return null;
  }
  const configuredGitdir = match[1].trim();
  const gitdir = path.isAbsolute(configuredGitdir) ? configuredGitdir : path.resolve(toplevel, configuredGitdir);
  // gitdir 形如 <主工作区>/.git/worktrees/<name>，向上三级即主工作区。
  return path.resolve(gitdir, "..", "..", "..");
}

function assertHooksConfig(cwd) {
  const configuredPath = configuredHooksPath(cwd);
  const toplevel = repositoryRoot(cwd);
  const expectedPath = path.join(toplevel, ".githooks");
  const isMain = isMainWorkspaceCheckout(toplevel);
  const mainRoot = isMain ? null : mainWorkspaceRootForWorktree(cwd);
  const acceptablePaths = isMain
    ? [expectedPath]
    : [expectedPath, mainRoot ? path.join(mainRoot, ".githooks") : null].filter(Boolean);
  const resolvedConfiguredPath = configuredPath
    ? path.resolve(cwd, configuredPath)
    : "";
  const matchesExpected = acceptablePaths.some(
    (candidate) => path.normalize(resolvedConfiguredPath).toLowerCase() === path.normalize(candidate).toLowerCase(),
  );
  if (
    !configuredPath
    || !matchesExpected
    || !fs.existsSync(resolvedConfiguredPath)
  ) {
    fail([
      "Git hooks are not installed for this checkout.",
      `Expected core.hooksPath: ${acceptablePaths.join(" or ")}`,
      isMain
        ? "Run 'pnpm setup:git-hooks' in this checkout before developing."
        : "Run 'pnpm setup:git-hooks' in the main workspace before developing in this worktree.",
    ].join("\n"));
  }

  let mergeFf;
  try {
    mergeFf = git(cwd, ["config", "--local", "--get", "--bool", "merge.ff"]);
  } catch {
    mergeFf = "";
  }
  if (mergeFf !== "false") {
    fail(
      "Git merge.ff must be false in this checkout. Run 'pnpm setup:git-hooks' before developing so main integrations cannot fast-forward.",
    );
  }
}

function mainWorkspaceSharedChanges(cwd) {
  const output = git(cwd, ["status", "--porcelain=v1", "--untracked-files=all", "--", "shared"]);
  return output ? output.split(/\r?\n/).filter(Boolean) : [];
}

function assertMainWorkspaceSharedIntegrity({ cwd = process.cwd() } = {}) {
  if (currentBranch(cwd) !== PROTECTED_BRANCH) {
    return;
  }

  assertMainSourceIntegrity({ cwd, phase: "main shared integrity" });

  const changes = mainWorkspaceSharedChanges(cwd);
  if (changes.length === 0) {
    return;
  }

  fail([
    "main workspace contains uncommitted shared changes. Stop here: do not develop or restore files in the shared main workspace.",
    ...changes,
    "Use the owning codex/* worktree to finish the change, or inspect and recover the files deliberately before starting services.",
  ].join("\n"));
}

function assertDevelopmentWorkspaceIntegrity({ cwd = process.cwd() } = {}) {
  assertWorktreeFilesystemIsolation({ cwd, phase: "development startup" });

  if (currentBranch(cwd) !== PROTECTED_BRANCH) {
    return;
  }

  const changes = mainWorkspaceChanges(cwd);
  if (changes.length > 0) {
    fail([
      "main workspace contains uncommitted development changes. Stop here: develop only in a sibling codex/* worktree.",
      ...changes,
      "Run 'pnpm workflow:worktree <task>' from a clean main workspace, then continue in the printed worktree path.",
    ].join("\n"));
  }

  if (hasMergeHead(cwd)) {
    fail([
      "main workspace has an unfinished merge (MERGE_HEAD).",
      "Finish it only through the controlled integration workflow, or run 'git merge --abort' after confirming no intended integration work is being discarded.",
    ].join("\n"));
  }

  assertHooksConfig(cwd);
}

function viteRefreshRuntimePath(cwd) {
  const packageJson = path.join(cwd, "client", "node_modules", "@vitejs", "plugin-react", "package.json");
  return path.join(path.dirname(packageJson), "dist", "refresh-runtime.js");
}

function assertClientRuntimeIntegrity({ cwd = process.cwd() } = {}) {
  const runtimePath = viteRefreshRuntimePath(cwd);
  if (fs.existsSync(runtimePath)) {
    return;
  }

  fail([
    "Vite React refresh runtime is missing.",
    `Expected: ${runtimePath}`,
    "Reinstall the locked dependencies with 'pnpm install --force --frozen-lockfile', then restart the project development services.",
  ].join("\n"));
}

function assertStartupIntegrity({ cwd = process.cwd() } = {}) {
  assertDevelopmentWorkspaceIntegrity({ cwd });
  assertClientRuntimeIntegrity({ cwd });
}

function main() {
  const action = process.argv[2] ?? "startup";
  if (action === "development") {
    assertDevelopmentWorkspaceIntegrity({ cwd: process.cwd() });
    return;
  }
  if (action !== "startup") {
    fail(`unknown action '${action}'. Use 'startup' or 'development'.`);
  }
  assertStartupIntegrity();
}

try {
  if (require.main === module) {
    main();
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

module.exports = {
  PROTECTED_BRANCH,
  assertClientRuntimeIntegrity,
  assertDevelopmentWorkspaceIntegrity,
  assertMainWorkspaceSharedIntegrity,
  assertStartupIntegrity,
  assertHooksConfig,
  configuredHooksPath,
  currentBranch,
  hasMergeHead,
  mainWorkspaceChanges,
  mainWorkspaceSharedChanges,
  mergeHeadPath,
  repositoryRoot,
  viteRefreshRuntimePath,
};
