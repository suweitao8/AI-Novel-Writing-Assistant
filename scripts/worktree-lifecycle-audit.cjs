#!/usr/bin/env node

"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { displayPath, isWithin } = require("./worktree-filesystem-safety.cjs");

const PROTECTED_BRANCH = "main";
const CODEX_BRANCH_PREFIX = "codex/";
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

function repositoryRoot(cwd = process.cwd()) {
  return path.resolve(runGit(cwd, ["rev-parse", "--show-toplevel"]));
}

function parseWorktreeList(output) {
  const entries = [];
  let current = null;
  for (const line of String(output).split(/\r?\n/)) {
    if (line.startsWith("worktree ")) {
      if (current) entries.push(current);
      current = { path: line.slice("worktree ".length) };
      continue;
    }
    if (!current) continue;
    if (line.startsWith("HEAD ")) current.head = line.slice("HEAD ".length);
    if (line.startsWith("branch ")) current.branch = line.slice("branch ".length);
    if (line === "detached") current.detached = true;
    if (line === "prunable") current.prunable = true;
  }
  if (current) entries.push(current);
  return entries;
}

function worktreeEntries(cwd) {
  return parseWorktreeList(runGit(cwd, ["worktree", "list", "--porcelain"]));
}

function primaryRepositoryRoot(cwd = process.cwd()) {
  const entries = worktreeEntries(cwd);
  const mainEntry = entries.find((entry) => entry.branch === "refs/heads/main") ?? entries[0];
  if (!mainEntry?.path) {
    throw new Error("Cannot resolve the primary repository worktree from Git's worktree list.");
  }
  return path.resolve(mainEntry.path);
}

function currentBranch(cwd = process.cwd()) {
  try {
    return runGit(cwd, ["symbolic-ref", "--quiet", "--short", "HEAD"]);
  } catch {
    return "HEAD";
  }
}

function normalizedPath(value) {
  const resolved = path.resolve(value);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function branchNameFromRef(ref) {
  return String(ref ?? "").replace(/^refs\/heads\//, "");
}

function expectedWorktreePath(repoRoot, branchName) {
  if (!CODEX_BRANCH_PATTERN.test(branchName)) {
    throw new Error(`Expected a local codex/<lowercase-task> branch, received ${branchName}.`);
  }
  const slug = branchName.slice(CODEX_BRANCH_PREFIX.length);
  return path.join(path.dirname(repoRoot), `${path.basename(repoRoot)}-${slug}`);
}

function localCodexBranches(cwd) {
  const output = runGit(cwd, [
    "for-each-ref",
    "refs/heads/codex/",
    "--format=%(refname:short)",
  ]);
  return output
    ? output.split(/\r?\n/).map((branch) => branch.trim()).filter(Boolean).filter((branch) => CODEX_BRANCH_PATTERN.test(branch))
    : [];
}

function issue(kind, details) {
  return { kind, ...details };
}

function pathExists(candidatePath) {
  try {
    fs.lstatSync(candidatePath);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

function auditWorktreeLifecycle({ cwd = process.cwd() } = {}) {
  const root = primaryRepositoryRoot(cwd);
  const entries = worktreeEntries(cwd).map((entry) => ({
    ...entry,
    path: path.resolve(entry.path),
    branchName: branchNameFromRef(entry.branch),
  }));
  const branches = localCodexBranches(cwd);
  const entriesByBranch = new Map(
    entries
      .filter((entry) => CODEX_BRANCH_PATTERN.test(entry.branchName))
      .map((entry) => [entry.branchName, entry]),
  );
  const issues = [];
  const observations = [];

  for (const entry of entries) {
    if (entry.prunable) {
      issues.push(issue("prunable-worktree-registration", {
        branch: entry.branchName || null,
        path: entry.path,
        message: "Git has marked this worktree registration as prunable; resolve it before topology-changing workflow steps.",
      }));
    }
    if (entry.detached) {
      observations.push({
        kind: "detached-worktree",
        branch: null,
        path: entry.path,
        message: "Detached worktree is reported for inspection and is not automatically changed.",
      });
    }
    if (entry.branchName && CODEX_BRANCH_PATTERN.test(entry.branchName) && !pathExists(entry.path)) {
      issues.push(issue("registered-worktree-path-missing", {
        branch: entry.branchName,
        path: entry.path,
        message: "Git still registers this branch, but its worktree path is missing.",
      }));
    }
  }

  for (const branch of branches) {
    const expectedPath = path.resolve(expectedWorktreePath(root, branch));
    const entry = entriesByBranch.get(branch);
    if (entry) continue;
    if (!pathExists(expectedPath)) continue;
    const registeredAtPath = entries.find((entry) => normalizedPath(entry.path) === normalizedPath(expectedPath));
    if (registeredAtPath) {
      issues.push(issue("branch-path-collision", {
        branch,
        path: expectedPath,
        registeredBranch: registeredAtPath.branchName || null,
        message: "A codex branch's convention-based path is occupied by a different registered worktree.",
      }));
      continue;
    }
    issues.push(issue("orphan-worktree-directory", {
      branch,
      path: expectedPath,
      message: "A codex branch has its convention-based sibling directory, but Git no longer registers it as a worktree.",
    }));
  }

  return {
    root,
    currentBranch: currentBranch(cwd),
    entries,
    branches,
    observations,
    issues,
    hasUnresolvedIssues: issues.length > 0,
  };
}

function formatAuditReport(report) {
  const lines = [
    `[workflow:audit] repository: ${displayPath(report.root)}`,
    `[workflow:audit] registered worktrees: ${report.entries.length}`,
    `[workflow:audit] local codex branches: ${report.branches.length}`,
  ];
  if (report.observations.length > 0) {
    lines.push("[workflow:audit] observations:");
    for (const observation of report.observations) {
      lines.push(`- ${observation.kind}: ${displayPath(observation.path)} — ${observation.message}`);
    }
  }
  if (report.issues.length === 0) {
    lines.push("[workflow:audit] unresolved lifecycle issues: none");
    return lines.join("\n");
  }
  lines.push("[workflow:audit] unresolved lifecycle issues:");
  for (const item of report.issues) {
    const branch = item.branch ? ` branch=${item.branch}` : "";
    const target = item.path ? ` path=${displayPath(item.path)}` : "";
    lines.push(`- ${item.kind}:${branch}${target} — ${item.message}`);
  }
  return lines.join("\n");
}

function assertNoUnresolvedWorktreeLifecycleIssues({ cwd = process.cwd(), phase = "workflow" } = {}) {
  const report = auditWorktreeLifecycle({ cwd });
  if (!report.hasUnresolvedIssues) return report;
  throw new Error([
    `${phase}: unresolved worktree lifecycle issues; stop before changing worktree topology.`,
    formatAuditReport(report),
    "Run 'pnpm workflow:audit' for the read-only report, then use the explicit recovery workflow for a proven orphan.",
  ].join("\n"));
}

function assertRecoveryPath({ cwd = process.cwd(), branchName, targetPath } = {}) {
  const root = primaryRepositoryRoot(cwd);
  const expectedPath = path.resolve(expectedWorktreePath(root, branchName));
  const resolvedTarget = path.resolve(targetPath);
  if (normalizedPath(resolvedTarget) !== normalizedPath(expectedPath)) {
    throw new Error([
      "Recovery path does not match the convention-based worktree path.",
      `Expected: ${displayPath(expectedPath)}`,
      `Received: ${displayPath(resolvedTarget)}`,
    ].join("\n"));
  }
  if (!isWithin(path.dirname(root), resolvedTarget) || normalizedPath(resolvedTarget) === normalizedPath(root)) {
    throw new Error(`Recovery target is outside the repository sibling boundary: ${displayPath(resolvedTarget)}`);
  }
  return { root, expectedPath };
}

module.exports = {
  CODEX_BRANCH_PATTERN,
  CODEX_BRANCH_PREFIX,
  PROTECTED_BRANCH,
  assertNoUnresolvedWorktreeLifecycleIssues,
  assertRecoveryPath,
  auditWorktreeLifecycle,
  branchNameFromRef,
  currentBranch,
  expectedWorktreePath,
  formatAuditReport,
  localCodexBranches,
  normalizedPath,
  parseWorktreeList,
  primaryRepositoryRoot,
  repositoryRoot,
  worktreeEntries,
};

function main() {
  const report = auditWorktreeLifecycle();
  console.log(formatAuditReport(report));
  if (report.hasUnresolvedIssues) process.exitCode = 1;
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`[workflow:audit] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
