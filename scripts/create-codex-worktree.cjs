#!/usr/bin/env node

"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { assertMainSourceIntegrity, assertWorktreeFilesystemIsolation } = require("./worktree-filesystem-safety.cjs");
const { assertNoUnresolvedWorktreeLifecycleIssues } = require("./worktree-lifecycle-audit.cjs");

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

function assertMainWorkspaceReady(cwd) {
  assertMainSourceIntegrity({ cwd, phase: "worktree creation" });
  assertNoUnresolvedWorktreeLifecycleIssues({ cwd, phase: "worktree creation" });

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
    return {
      removed: false,
      error: new Error([
        `Created worktree was kept because controlled removal failed: ${targetPath}`,
        error instanceof Error ? error.message : String(error),
        `Do not recursively delete it. Inspect it, then use 'pnpm workflow:cleanup' only after the branch is intentionally integrated.`,
      ].join("\n")),
    };
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

function createWorktree({ cwd = process.cwd(), task, targetPath } = {}) {
  const repoRoot = path.resolve(runGit(cwd, ["rev-parse", "--show-toplevel"]));
  const slug = normalizeTaskSlug(task);
  const branchName = `${CODEX_BRANCH_PREFIX}${slug}`;
  const resolvedTarget = path.resolve(targetPath ?? defaultWorktreePath(repoRoot, slug));

  assertMainWorkspaceReady(repoRoot);
  if (branchExists(repoRoot, branchName)) {
    throw new Error(`Branch collision: ${branchName} already exists.`);
  }
  if (fs.existsSync(resolvedTarget)) {
    throw new Error(`Worktree path collision: ${resolvedTarget} already exists.`);
  }

  runGit(repoRoot, ["worktree", "add", "-b", branchName, resolvedTarget, PROTECTED_BRANCH], { inherit: true });
  try {
    runInstall(resolvedTarget);
    runSetup(resolvedTarget);
    assertWorktreeFilesystemIsolation({ cwd: resolvedTarget, phase: "worktree creation" });
  } catch (error) {
    const cleanup = removeCreatedWorktree(repoRoot, resolvedTarget, branchName);
    if (cleanup.error) {
      throw new Error(`${error instanceof Error ? error.message : String(error)}\n${cleanup.error.message}`);
    }
    throw error;
  }

  return { branchName, repoRoot, slug, worktreePath: resolvedTarget };
}

function printHelp() {
  console.log("Usage: pnpm workflow:worktree <task-name>");
  console.log("Creates a sibling codex/<task-name> worktree from a clean main workspace and installs Git hooks.");
}

function main() {
  const task = process.argv[2];
  if (!task || task === "--help" || task === "-h") {
    printHelp();
    if (!task || task === "--help" || task === "-h") {
      if (!task) process.exitCode = 1;
      return;
    }
  }

  const result = createWorktree({ task, cwd: process.cwd() });
  console.log(`Worktree ready: ${result.worktreePath}`);
  console.log(`Branch: ${result.branchName}`);
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
  normalizeTaskSlug,
  removeCreatedWorktree,
  runInstall,
  runSetup,
  workspaceChanges,
};
