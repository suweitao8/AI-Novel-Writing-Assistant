#!/usr/bin/env node

"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync, spawnSync } = require("node:child_process");

const PROTECTED_BRANCH = "main";
const CODEX_BRANCH_PATTERN = /^codex\/[a-z0-9][a-z0-9-]*$/;
const INTEGRATION_LOCK_NAME = "codex-main-integration.lock";

function gitErrorMessage(error, args) {
  const stdout = error?.stdout ? String(error.stdout).trim() : "";
  const stderr = error?.stderr ? String(error.stderr).trim() : "";
  const detail = [stderr, stdout].filter(Boolean).join("\n");
  return `git ${args.join(" ")} failed${detail ? `:\n${detail}` : "."}`;
}

function runGit(cwd, args, { inherit = false } = {}) {
  try {
    const output = execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: inherit ? "inherit" : ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    return typeof output === "string" ? output.trim() : "";
  } catch (error) {
    throw new Error(gitErrorMessage(error, args));
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

function gitCommonDir(cwd) {
  const raw = runGit(cwd, ["rev-parse", "--git-common-dir"]);
  return path.resolve(cwd, raw);
}

function mergeHeadPath(cwd) {
  const raw = runGit(cwd, ["rev-parse", "--git-path", "MERGE_HEAD"]);
  return path.isAbsolute(raw) ? raw : path.resolve(cwd, raw);
}

function hasMergeHead(cwd) {
  return fs.existsSync(mergeHeadPath(cwd));
}

function workspaceChanges(cwd) {
  const output = runGit(cwd, ["status", "--porcelain=v1", "--untracked-files=all"]);
  return output ? output.split(/\r?\n/).filter(Boolean) : [];
}

function branchExists(cwd, branchName) {
  return tryGit(cwd, ["show-ref", "--verify", "--quiet", `refs/heads/${branchName}`]).ok;
}

function worktreeEntries(cwd) {
  const output = runGit(cwd, ["worktree", "list", "--porcelain"]);
  const entries = [];
  let current = null;
  for (const line of output.split(/\r?\n/)) {
    if (line.startsWith("worktree ")) {
      if (current) entries.push(current);
      current = { path: line.slice("worktree ".length) };
      continue;
    }
    if (!current) continue;
    if (line.startsWith("HEAD ")) current.head = line.slice("HEAD ".length);
    if (line.startsWith("branch ")) current.branch = line.slice("branch ".length);
    if (line === "detached") current.detached = true;
  }
  if (current) entries.push(current);
  return entries;
}

function findWorktreeForBranch(cwd, branchName) {
  const ref = `refs/heads/${branchName}`;
  return worktreeEntries(cwd).find((entry) => entry.branch === ref) ?? null;
}

function assertIntegrationPreconditions({ cwd = process.cwd(), taskBranch } = {}) {
  if (currentBranch(cwd) !== PROTECTED_BRANCH) {
    throw new Error("Integration must run from the protected main branch workspace.");
  }
  if (!CODEX_BRANCH_PATTERN.test(taskBranch ?? "")) {
    throw new Error("Integration source must be a local codex/<lowercase-task> branch.");
  }
  if (workspaceChanges(cwd).length > 0) {
    throw new Error("main workspace is not clean; refuse to integrate over uncommitted changes.");
  }
  if (hasMergeHead(cwd)) {
    throw new Error("main workspace already has MERGE_HEAD; resolve or abort the existing merge first.");
  }
  if (!branchExists(cwd, taskBranch)) {
    throw new Error(`Integration source branch does not exist locally: ${taskBranch}`);
  }
  const sourceWorktree = findWorktreeForBranch(cwd, taskBranch);
  if (!sourceWorktree) {
    throw new Error(`Integration source ${taskBranch} is not checked out in a worktree.`);
  }
  if (path.normalize(sourceWorktree.path).toLowerCase() === path.normalize(repositoryRoot(cwd)).toLowerCase()) {
    throw new Error("Integration source must be checked out in a separate worktree, not the main workspace.");
  }
  const sourceChanges = workspaceChanges(sourceWorktree.path);
  if (sourceChanges.length > 0) {
    throw new Error([
      `source worktree ${sourceWorktree.path} is not clean; commit or deliberately recover it before integration.`,
      ...sourceChanges,
    ].join("\n"));
  }
  return { sourceWorktree, sourceBranch: taskBranch };
}

function processIsAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function readLock(lockPath) {
  try {
    return JSON.parse(fs.readFileSync(lockPath, "utf8"));
  } catch {
    return null;
  }
}

function acquireIntegrationLock({ gitCommonDir, branch }) {
  const lockPath = path.join(gitCommonDir, INTEGRATION_LOCK_NAME);
  fs.mkdirSync(gitCommonDir, { recursive: true });
  const token = crypto.randomUUID();
  const payload = {
    branch,
    createdAt: new Date().toISOString(),
    pid: process.pid,
    token,
  };

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const handle = fs.openSync(lockPath, "wx");
      fs.writeFileSync(handle, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
      fs.closeSync(handle);
      return {
        lockPath,
        release() {
          const current = readLock(lockPath);
          if (current?.token === token) fs.rmSync(lockPath, { force: true });
        },
      };
    } catch (error) {
      if (error?.code !== "EEXIST" || attempt === 1) {
        throw new Error(`Could not acquire main integration lock at ${lockPath}.`);
      }
      const owner = readLock(lockPath);
      if (processIsAlive(owner?.pid)) {
        throw new Error([
          `main integration lock is held by pid ${owner.pid}.`,
          `branch=${owner.branch ?? "unknown"}`,
          `createdAt=${owner.createdAt ?? "unknown"}`,
          "Do not bypass the lock; wait for that integration to finish.",
        ].join("\n"));
      }
      fs.rmSync(lockPath, { force: true });
    }
  }

  throw new Error("Could not acquire main integration lock.");
}

function runVerification(command, cwd) {
  if (!command) return;
  const result = spawnSync(command, {
    cwd,
    shell: true,
    stdio: "inherit",
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`verification command failed with exit code ${result.status}.`);
}

function integrateCodexWorktree({ cwd = process.cwd(), taskBranch, push = false, verifyCommand } = {}) {
  const repoRoot = repositoryRoot(cwd);
  const lock = acquireIntegrationLock({ gitCommonDir: gitCommonDir(repoRoot), branch: taskBranch });
  let mergeAttempted = false;
  let commitCreated = false;
  try {
    assertIntegrationPreconditions({ cwd: repoRoot, taskBranch });
    mergeAttempted = true;
    runGit(repoRoot, ["merge", "--no-ff", "--no-commit", taskBranch]);
    runGit(repoRoot, ["diff", "--cached", "--check"]);
    runVerification(verifyCommand, repoRoot);
    runGit(repoRoot, ["commit", "-s", "--no-edit"]);
    commitCreated = true;
    if (push) runGit(repoRoot, ["push", "origin", "main"], { inherit: true });
    return { commitCreated, pushed: push, taskBranch };
  } catch (error) {
    if (mergeAttempted && !commitCreated && hasMergeHead(repoRoot)) {
      try {
        runGit(repoRoot, ["merge", "--abort"]);
      } catch (abortError) {
        throw new Error(`${error.message}\nAdditionally failed to abort prepared merge: ${abortError.message}`);
      }
    }
    throw error;
  } finally {
    lock.release();
  }
}

function parseArgs(argv) {
  const [taskBranch, ...optionArgs] = argv;
  if (!taskBranch || taskBranch.startsWith("--")) {
    throw new Error("Integration requires the codex/<task> source branch first.");
  }

  let push = false;
  let verifyCommand;
  for (let index = 0; index < optionArgs.length; index += 1) {
    const argument = optionArgs[index];
    if (argument === "--push") {
      push = true;
      continue;
    }
    if (argument === "--verify") {
      verifyCommand = optionArgs[index + 1];
      if (!verifyCommand || verifyCommand.startsWith("--")) {
        throw new Error("--verify requires one shell command argument.");
      }
      index += 1;
      continue;
    }
    throw new Error(`Unknown integration option: ${argument}`);
  }
  return { taskBranch, push, verifyCommand };
}

function printHelp() {
  console.log("Usage: pnpm workflow:integrate codex/<task> [--push] [--verify \"command\"]");
  console.log("Runs a locked, reviewed no-ff merge from a clean codex worktree into main.");
}

function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    printHelp();
    if (args.length === 0) process.exitCode = 1;
    return;
  }
  const options = parseArgs(args);
  const result = integrateCodexWorktree({ cwd: process.cwd(), ...options });
  console.log(`Integrated ${result.taskBranch} into main.`);
  if (result.pushed) console.log("Pushed refs/heads/main to origin.");
}

try {
  if (require.main === module) main();
} catch (error) {
  console.error(`[workflow:integrate] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}

module.exports = {
  CODEX_BRANCH_PATTERN,
  INTEGRATION_LOCK_NAME,
  PROTECTED_BRANCH,
  acquireIntegrationLock,
  assertIntegrationPreconditions,
  currentBranch,
  findWorktreeForBranch,
  gitCommonDir,
  hasMergeHead,
  integrateCodexWorktree,
  parseArgs,
  processIsAlive,
  repositoryRoot,
  workspaceChanges,
  worktreeEntries,
};
