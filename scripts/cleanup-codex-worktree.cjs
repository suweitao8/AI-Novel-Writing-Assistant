#!/usr/bin/env node

"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const {
  DEPENDENCY_ROOTS,
  assertWorktreeFilesystemIsolation,
  displayPath,
  isWithin,
  realPath,
} = require("./worktree-filesystem-safety.cjs");
const {
  assertLifecycleRepairScope,
  assertNoUnresolvedWorktreeLifecycleIssues,
  parseWorktreeList,
} = require("./worktree-lifecycle-audit.cjs");

const PROTECTED_BRANCH = "main";
const CODEX_BRANCH_PATTERN = /^codex\/[a-z0-9][a-z0-9-]*$/;

function runGit(cwd, args) {
  try {
    const output = execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    return typeof output === "string" ? output.trim() : "";
  } catch (error) {
    const stdout = error?.stdout ? String(error.stdout).trim() : "";
    const stderr = error?.stderr ? String(error.stderr).trim() : "";
    const detail = [stderr, stdout].filter(Boolean).join("\n");
    throw new Error(`git ${args.join(" ")} failed${detail ? `:\n${detail}` : "."}`);
  }
}

function tryGit(cwd, args) {
  try {
    return { ok: true, output: runGit(cwd, args) };
  } catch {
    return { ok: false, output: "" };
  }
}

function currentBranch(cwd) {
  return tryGit(cwd, ["symbolic-ref", "--quiet", "--short", "HEAD"]).output;
}

function repositoryRoot(cwd) {
  return path.resolve(runGit(cwd, ["rev-parse", "--show-toplevel"]));
}

function workspaceChanges(cwd) {
  const output = runGit(cwd, ["status", "--porcelain=v1", "--untracked-files=all"]);
  return output ? output.split(/\r?\n/).filter(Boolean) : [];
}

function worktreeEntries(cwd) {
  return parseWorktreeList(runGit(cwd, ["worktree", "list", "--porcelain"]));
}

function normalizedPath(value) {
  const resolved = path.resolve(value);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function findCandidate(cwd, target) {
  const entries = worktreeEntries(cwd);
  const requested = String(target ?? "").trim();
  if (!requested) throw new Error("Cleanup requires a codex/<task> branch or a registered worktree path.");

  const branchMatch = requested.startsWith("codex/")
    ? entries.find((entry) => entry.branch === `refs/heads/${requested}`)
    : null;
  const pathMatch = branchMatch
    ?? entries.find((entry) => normalizedPath(entry.path) === normalizedPath(requested));
  if (!pathMatch) {
    throw new Error(`Cleanup target is not a registered worktree: ${requested}`);
  }
  if (pathMatch.detached || !pathMatch.branch) {
    throw new Error("Cleanup refuses detached worktrees; provide a checked-out codex/* branch.");
  }

  const branchName = pathMatch.branch.replace(/^refs\/heads\//, "");
  if (branchName === PROTECTED_BRANCH || !CODEX_BRANCH_PATTERN.test(branchName)) {
    throw new Error(`Cleanup only accepts a registered codex/* worktree, received ${branchName}.`);
  }

  const root = repositoryRoot(cwd);
  if (normalizedPath(pathMatch.path) === normalizedPath(root)) {
    throw new Error("Cleanup refuses the protected main workspace.");
  }

  return {
    branchName,
    path: path.resolve(pathMatch.path),
    entry: pathMatch,
  };
}

function assertBranchMerged(cwd, branchName) {
  if (!tryGit(cwd, ["merge-base", "--is-ancestor", branchName, PROTECTED_BRANCH]).ok) {
    throw new Error(`Cleanup refuses ${branchName}: its tip is not merged into main.`);
  }
}

function assertCleanupPreconditions({ cwd = process.cwd(), target, allowLifecycleRepair = false } = {}) {
  if (currentBranch(cwd) !== PROTECTED_BRANCH) {
    throw new Error("Cleanup must run from the protected main branch workspace.");
  }
  assertWorktreeFilesystemIsolation({ cwd, phase: "cleanup main" });
  const mainChanges = workspaceChanges(cwd);
  if (mainChanges.length > 0) {
    throw new Error(["main workspace is not clean; cleanup is stopped.", ...mainChanges].join("\n"));
  }

  const candidate = findCandidate(cwd, target);
  if (allowLifecycleRepair) {
    assertLifecycleRepairScope({ cwd, branchName: candidate.branchName });
  } else {
    assertNoUnresolvedWorktreeLifecycleIssues({ cwd, phase: "cleanup main" });
  }
  if (!fs.existsSync(candidate.path)) {
    throw new Error(`Registered cleanup worktree path is missing: ${candidate.path}`);
  }
  assertWorktreeFilesystemIsolation({ cwd: candidate.path, phase: "cleanup source" });
  const sourceChanges = workspaceChanges(candidate.path);
  if (sourceChanges.length > 0) {
    throw new Error([
      `Cleanup refuses ${candidate.branchName}: source worktree is not clean.`,
      ...sourceChanges,
    ].join("\n"));
  }
  assertBranchMerged(cwd, candidate.branchName);
  return candidate;
}

function assertDependencyTreeIsLocal(directoryPath, checkoutRoot) {
  const pending = [directoryPath];
  while (pending.length > 0) {
    const current = pending.pop();
    let stats;
    try {
      stats = fs.lstatSync(current);
    } catch (error) {
      if (error?.code === "ENOENT") continue;
      throw new Error(`Cannot inspect dependency path before cleanup: ${displayPath(current)}: ${error.message}`);
    }

    if (stats.isSymbolicLink()) {
      const target = realPath(current);
      if (!target) throw new Error(`Broken dependency link cannot be cleaned safely: ${displayPath(current)}`);
      if (!isWithin(checkoutRoot, target)) {
        throw new Error([
          "Cleanup refused an external dependency link.",
          `${displayPath(current)} -> ${displayPath(target)}`,
          `The target must remain inside ${displayPath(checkoutRoot)}.`,
        ].join("\n"));
      }
      continue;
    }
    if (!stats.isDirectory()) continue;
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      pending.push(path.join(current, entry.name));
    }
  }
}

function removeLocalDependencyRoots(worktreePath) {
  const candidates = [];
  for (const relativePath of DEPENDENCY_ROOTS) {
    const dependencyPath = path.join(worktreePath, relativePath);
    let stats;
    try {
      stats = fs.lstatSync(dependencyPath);
    } catch (error) {
      if (error?.code === "ENOENT") continue;
      throw new Error(`Cannot inspect dependency root before cleanup: ${displayPath(dependencyPath)}: ${error.message}`);
    }

    if (stats.isSymbolicLink()) {
      const target = realPath(dependencyPath);
      if (!target) throw new Error(`Broken dependency root cannot be cleaned safely: ${displayPath(dependencyPath)}`);
      if (!isWithin(worktreePath, target)) {
        throw new Error([
          "Cleanup refused an external dependency root.",
          `${displayPath(dependencyPath)} -> ${displayPath(target)}`,
        ].join("\n"));
      }
      candidates.push({ dependencyPath, symbolicLink: true });
      continue;
    }
    if (!stats.isDirectory()) {
      throw new Error(`Dependency root is not a directory: ${displayPath(dependencyPath)}`);
    }

    const target = realPath(dependencyPath);
    if (!target || !isWithin(worktreePath, target)) {
      throw new Error(`Dependency root resolves outside the worktree: ${displayPath(dependencyPath)}`);
    }
    assertDependencyTreeIsLocal(dependencyPath, worktreePath);
    candidates.push({ dependencyPath, symbolicLink: false });
  }

  const removed = [];
  for (const candidate of candidates) {
    fs.rmSync(candidate.dependencyPath, {
      force: true,
      ...(candidate.symbolicLink ? {} : { recursive: true }),
    });
    removed.push(candidate.dependencyPath);
  }
  return removed;
}

function removeRegisteredWorktree({ cwd, candidate }) {
  runGit(cwd, ["worktree", "remove", "--force", candidate.path]);
  return candidate;
}

function assertWorktreeWasRemoved(cwd, candidate) {
  const remaining = worktreeEntries(cwd).some(
    (entry) => normalizedPath(entry.path) === normalizedPath(candidate.path),
  );
  if (remaining) {
    throw new Error(`Git still registers the cleanup worktree after removal: ${candidate.path}`);
  }
  if (fs.existsSync(candidate.path)) {
    throw new Error(`Cleanup removed the Git registration but left the directory in place: ${candidate.path}`);
  }
}

function cleanupCodexWorktree({ cwd = process.cwd(), target, removeWorktree = removeRegisteredWorktree, allowLifecycleRepair = false } = {}) {
  const candidate = assertCleanupPreconditions({ cwd, target, allowLifecycleRepair });
  removeLocalDependencyRoots(candidate.path);
  removeWorktree({ cwd, candidate });
  assertWorktreeWasRemoved(cwd, candidate);
  runGit(cwd, ["branch", "-d", candidate.branchName]);
  return candidate;
}

function printHelp() {
  console.log("Usage: pnpm workflow:cleanup codex/<task> [--repair-lifecycle]");
  console.log("Removes one clean, already merged codex worktree and then deletes its local branch.");
}

function parseArgs(argv) {
  const [target, ...options] = argv;
  if (!target || target.startsWith("--")) {
    throw new Error("Cleanup requires a codex/<task> target first.");
  }
  let allowLifecycleRepair = false;
  for (const option of options) {
    if (option === "--repair-lifecycle") {
      allowLifecycleRepair = true;
      continue;
    }
    throw new Error(`Unknown cleanup option: ${option}`);
  }
  return { allowLifecycleRepair, target };
}

function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    printHelp();
    if (args.length === 0) process.exitCode = 1;
    return;
  }
  const candidate = cleanupCodexWorktree(parseArgs(args));
  console.log(`Cleaned ${candidate.branchName}: ${candidate.path}`);
}

try {
  if (require.main === module) main();
} catch (error) {
  console.error(`[workflow:cleanup] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}

module.exports = {
  CODEX_BRANCH_PATTERN,
  PROTECTED_BRANCH,
  assertCleanupPreconditions,
  assertWorktreeWasRemoved,
  cleanupCodexWorktree,
  currentBranch,
  findCandidate,
  parseArgs,
  parseWorktreeList,
  removeLocalDependencyRoots,
  removeRegisteredWorktree,
  repositoryRoot,
  worktreeEntries,
  workspaceChanges,
};
