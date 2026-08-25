#!/usr/bin/env node

"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const {
  DEPENDENCY_ROOTS,
  assertFilesystemIsolationAtRoot,
  displayPath,
  isWithin,
  realPath,
} = require("./worktree-filesystem-safety.cjs");
const { removeLocalDependencyRoots, worktreeEntries } = require("./cleanup-codex-worktree.cjs");
const {
  CODEX_BRANCH_PATTERN,
  assertRecoveryPath,
  auditWorktreeLifecycle,
  expectedWorktreePath,
  normalizedPath,
  primaryRepositoryRoot,
} = require("./worktree-lifecycle-audit.cjs");

const PROTECTED_BRANCH = "main";

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

function currentBranch(cwd) {
  try {
    return runGit(cwd, ["symbolic-ref", "--quiet", "--short", "HEAD"]);
  } catch {
    return "HEAD";
  }
}

function workspaceChanges(cwd) {
  const output = runGit(cwd, ["status", "--porcelain=v1", "--untracked-files=all"]);
  return output ? output.split(/\r?\n/).filter(Boolean) : [];
}

function mergeHeadPath(cwd) {
  const raw = runGit(cwd, ["rev-parse", "--git-path", "MERGE_HEAD"]);
  return path.isAbsolute(raw) ? raw : path.resolve(cwd, raw);
}

function assertMainReady(cwd) {
  if (currentBranch(cwd) !== PROTECTED_BRANCH) {
    throw new Error("Orphan recovery must run from the protected main branch workspace.");
  }
  if (workspaceChanges(cwd).length > 0) {
    throw new Error("main workspace is not clean; orphan recovery is stopped.");
  }
  if (fs.existsSync(mergeHeadPath(cwd))) {
    throw new Error("main workspace has MERGE_HEAD; finish or abort the merge before orphan recovery.");
  }
  assertFilesystemIsolationAtRoot({
    root: primaryRepositoryRoot(cwd),
    phase: "orphan recovery main",
  });
}

function gitTreeEntries(cwd, branchName) {
  const output = execFileSync("git", ["ls-tree", "-r", "-z", "--full-tree", branchName], {
    cwd,
    encoding: "buffer",
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  const entries = [];
  for (const rawEntry of output.toString("utf8").split("\0")) {
    if (!rawEntry) continue;
    const separator = rawEntry.indexOf("\t");
    if (separator < 0) throw new Error(`Cannot parse Git tree entry for ${branchName}.`);
    const [mode, type, object] = rawEntry.slice(0, separator).split(/\s+/);
    const relativePath = rawEntry.slice(separator + 1).replace(/\\/g, "/");
    entries.push({ mode, object, path: relativePath, type });
  }
  return entries;
}

function keyForRelativePath(relativePath) {
  const normalized = relativePath.replace(/\\/g, "/");
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

function isDependencyRoot(relativePath) {
  const normalized = keyForRelativePath(relativePath);
  return DEPENDENCY_ROOTS.some((dependencyRoot) => {
    const root = keyForRelativePath(dependencyRoot);
    return normalized === root || normalized.startsWith(`${root}/`);
  });
}

function collectActualFiles(root) {
  const files = new Map();
  const unexpectedLinks = [];

  function visit(directory, relativeDirectory) {
    const entries = fs.readdirSync(directory, { withFileTypes: true });
    for (const entry of entries) {
      const relativePath = relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name;
      if (isDependencyRoot(relativePath)) continue;
      const absolutePath = path.join(directory, entry.name);
      const stats = fs.lstatSync(absolutePath);
      if (stats.isSymbolicLink()) {
        unexpectedLinks.push(absolutePath);
        continue;
      }
      if (stats.isDirectory()) {
        visit(absolutePath, relativePath);
        continue;
      }
      if (!stats.isFile()) {
        throw new Error(`Unsupported filesystem entry in orphan directory: ${displayPath(absolutePath)}`);
      }
      files.set(keyForRelativePath(relativePath), { absolutePath, relativePath });
    }
  }

  visit(root, "");
  if (unexpectedLinks.length > 0) {
    throw new Error([
      "Orphan recovery refuses untracked filesystem links outside the known dependency roots.",
      ...unexpectedLinks.map((entry) => displayPath(entry)),
    ].join("\n"));
  }
  return files;
}

function gitBlobHash(filePath) {
  const content = fs.readFileSync(filePath);
  return crypto
    .createHash("sha1")
    .update(`blob ${content.length}\0`, "utf8")
    .update(content)
    .digest("hex");
}

function assertGitTreeMatchesDirectory({ cwd, branchName, root }) {
  const expectedEntries = gitTreeEntries(cwd, branchName);
  const expectedFiles = new Map();
  for (const entry of expectedEntries) {
    if (entry.type !== "blob") {
      throw new Error(`Orphan recovery refuses non-file Git tree entry ${entry.path} (${entry.type}).`);
    }
    expectedFiles.set(keyForRelativePath(entry.path), entry);
  }

  const actualFiles = collectActualFiles(root);
  const missing = [];
  const extra = [];
  for (const [key, entry] of expectedFiles) {
    const actual = actualFiles.get(key);
    if (!actual) {
      missing.push(entry.path);
      continue;
    }
    const stats = fs.lstatSync(actual.absolutePath);
    if (!stats.isFile() || stats.isSymbolicLink()) {
      throw new Error(`Orphan recovery found a non-regular tracked file: ${displayPath(actual.absolutePath)}`);
    }
    if (gitBlobHash(actual.absolutePath) !== entry.object) {
      throw new Error(`Orphan recovery found modified tracked content: ${displayPath(actual.absolutePath)}`);
    }
  }
  for (const [key, actual] of actualFiles) {
    if (!expectedFiles.has(key)) extra.push(actual.relativePath);
  }
  if (missing.length > 0 || extra.length > 0) {
    const details = [];
    if (missing.length > 0) details.push(`Missing tracked files:\n${missing.slice(0, 20).map((entry) => `- ${entry}`).join("\n")}`);
    if (extra.length > 0) details.push(`Unexpected files:\n${extra.slice(0, 20).map((entry) => `- ${entry}`).join("\n")}`);
    throw new Error(["Orphan recovery refuses a directory whose files do not exactly match the branch Git tree.", ...details].join("\n"));
  }
  return { fileCount: expectedFiles.size };
}

function assertOrphanRecoveryPreconditions({ cwd = process.cwd(), branchName } = {}) {
  assertMainReady(cwd);
  if (!CODEX_BRANCH_PATTERN.test(branchName ?? "")) {
    throw new Error("Recovery requires a local codex/<lowercase-task> branch.");
  }
  const report = auditWorktreeLifecycle({ cwd });
  const candidate = report.issues.find(
    (entry) => entry.kind === "orphan-worktree-directory" && entry.branch === branchName,
  );
  if (!candidate) {
    throw new Error(`No unregistered orphan directory was found for ${branchName}. Run 'pnpm workflow:audit' first.`);
  }
  const { root, expectedPath } = assertRecoveryPath({ cwd, branchName, targetPath: candidate.path });
  const registered = worktreeEntries(cwd).find(
    (entry) => entry.branch === `refs/heads/${branchName}` || normalizedPath(entry.path) === normalizedPath(expectedPath),
  );
  if (registered) {
    throw new Error(`Recovery refuses a path that Git still registers: ${displayPath(expectedPath)}`);
  }
  if (!fs.existsSync(expectedPath)) {
    throw new Error(`Orphan directory disappeared before recovery: ${displayPath(expectedPath)}`);
  }
  const rootStats = fs.lstatSync(expectedPath);
  if (!rootStats.isDirectory() || rootStats.isSymbolicLink()) {
    throw new Error(`Recovery target must be a real directory: ${displayPath(expectedPath)}`);
  }
  const resolvedRoot = realPath(expectedPath);
  if (!resolvedRoot || !isWithin(path.dirname(root), resolvedRoot)) {
    throw new Error(`Recovery target resolves outside the repository sibling boundary: ${displayPath(expectedPath)}`);
  }
  if (fs.existsSync(path.join(expectedPath, ".git"))) {
    throw new Error(`Recovery refuses a directory with .git metadata: ${displayPath(expectedPath)}`);
  }
  try {
    runGit(cwd, ["merge-base", "--is-ancestor", branchName, PROTECTED_BRANCH]);
  } catch {
    throw new Error(`Recovery refuses ${branchName}: its tip is not merged into main.`);
  }
  assertFilesystemIsolationAtRoot({ root: expectedPath, phase: "orphan recovery source" });
  const tree = assertGitTreeMatchesDirectory({ cwd, branchName, root: expectedPath });
  return { branchName, root, path: expectedPath, fileCount: tree.fileCount };
}

function recoverOrphanWorktree({ cwd = process.cwd(), branchName, apply = false } = {}) {
  const candidate = assertOrphanRecoveryPreconditions({ cwd, branchName });
  if (!apply) return { ...candidate, applied: false, removedDependencies: [] };

  const removedDependencies = removeLocalDependencyRoots(candidate.path);
  fs.rmSync(candidate.path, { recursive: true, force: true });
  if (fs.existsSync(candidate.path)) {
    throw new Error(`Recovery removed dependencies but could not remove the exact orphan directory: ${displayPath(candidate.path)}`);
  }
  try {
    runGit(cwd, ["branch", "-d", candidate.branchName]);
  } catch (error) {
    throw new Error([
      `Orphan directory was removed, but the merged branch could not be deleted: ${candidate.branchName}`,
      error instanceof Error ? error.message : String(error),
    ].join("\n"));
  }
  return { ...candidate, applied: true, removedDependencies };
}

function parseArgs(argv) {
  const [branchName, ...options] = argv;
  if (!branchName || branchName.startsWith("--")) {
    throw new Error("Recovery requires the codex/<task> branch first.");
  }
  let apply = false;
  for (const option of options) {
    if (option === "--apply") {
      apply = true;
      continue;
    }
    throw new Error(`Unknown recovery option: ${option}`);
  }
  return { branchName, apply };
}

function printHelp() {
  console.log("Usage: pnpm workflow:recover-worktree codex/<task> [--apply]");
  console.log("Audits one unregistered merged orphan worktree; --apply is required to remove a proven exact copy.");
}

function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    printHelp();
    if (args.length === 0) process.exitCode = 1;
    return;
  }
  const result = recoverOrphanWorktree({ ...parseArgs(args) });
  if (!result.applied) {
    console.log(`Validated orphan ${result.branchName}: ${result.path}`);
    console.log(`Tracked files matched: ${result.fileCount}`);
    console.log("Dry run only. Add --apply after reviewing this exact target to remove it.");
    return;
  }
  console.log(`Recovered orphan ${result.branchName}: ${result.path}`);
}

try {
  if (require.main === module) main();
} catch (error) {
  console.error(`[workflow:recover-worktree] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}

module.exports = {
  assertGitTreeMatchesDirectory,
  assertOrphanRecoveryPreconditions,
  collectActualFiles,
  gitBlobHash,
  parseArgs,
  recoverOrphanWorktree,
};
