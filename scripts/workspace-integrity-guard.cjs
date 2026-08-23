#!/usr/bin/env node

"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

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

function mainWorkspaceSharedChanges(cwd) {
  const output = git(cwd, ["status", "--porcelain=v1", "--untracked-files=all", "--", "shared"]);
  return output ? output.split(/\r?\n/).filter(Boolean) : [];
}

function assertMainWorkspaceSharedIntegrity({ cwd = process.cwd() } = {}) {
  if (currentBranch(cwd) !== PROTECTED_BRANCH) {
    return;
  }

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
  assertMainWorkspaceSharedIntegrity({ cwd });
  assertClientRuntimeIntegrity({ cwd });
}

function main() {
  const action = process.argv[2] ?? "startup";
  if (action !== "startup") {
    fail(`unknown action '${action}'. Use 'startup'.`);
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
  assertMainWorkspaceSharedIntegrity,
  assertStartupIntegrity,
  currentBranch,
  mainWorkspaceSharedChanges,
  viteRefreshRuntimePath,
};
