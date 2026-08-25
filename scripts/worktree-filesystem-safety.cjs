#!/usr/bin/env node

"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const SOURCE_DIRECTORIES = ["client", "server", "scripts"];
const DEPENDENCY_ROOTS = [
  "node_modules",
  "client/node_modules",
  "server/node_modules",
  "shared/node_modules",
  "site/node_modules",
  "video/node_modules",
];

function fail(message) {
  throw new Error(`[worktree-filesystem-safety] ${message}`);
}

function repositoryRoot(cwd = process.cwd()) {
  try {
    return path.resolve(
      execFileSync("git", ["rev-parse", "--show-toplevel"], {
        cwd,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
        windowsHide: true,
      }).trim(),
    );
  } catch (error) {
    fail(`cannot resolve the Git checkout for ${cwd}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function comparablePath(value) {
  const resolved = path.resolve(value);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function isWithin(root, candidate) {
  const relative = path.relative(comparablePath(root), comparablePath(candidate));
  return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

function realPath(filePath) {
  try {
    return fs.realpathSync.native(filePath);
  } catch (error) {
    if (error?.code === "ENOENT" || error?.code === "EINVAL") return null;
    throw error;
  }
}

function displayPath(filePath) {
  return path.normalize(path.resolve(filePath));
}

function linkTarget(linkPath, root, phase) {
  const target = realPath(linkPath);
  if (!target) {
    fail(`${phase}: broken link ${displayPath(linkPath)} has no resolvable target.`);
  }
  if (!isWithin(root, target)) {
    fail([
      `${phase}: external filesystem link detected`,
      `${displayPath(linkPath)} -> ${displayPath(target)}`,
      `The target must remain inside the current checkout ${displayPath(root)}.`,
    ].join("\n"));
  }
  return target;
}

function assertSourceDirectory(directoryPath, { required, phase, root }) {
  let stats;
  try {
    stats = fs.lstatSync(directoryPath);
  } catch (error) {
    if (error?.code === "ENOENT" && !required) return false;
    if (error?.code === "ENOENT") {
      fail(`${phase}: required source directory is missing: ${displayPath(directoryPath)}.`);
    }
    fail(`${phase}: cannot inspect source directory ${displayPath(directoryPath)}: ${error.message}`);
  }

  if (stats.isSymbolicLink()) {
    const root = path.dirname(path.dirname(directoryPath));
    const target = realPath(directoryPath);
    fail([
      `${phase}: source directory must be a real directory`,
      `${displayPath(directoryPath)} -> ${target ? displayPath(target) : "<broken link>"}`,
      `The source path cannot be shared through a Junction or symbolic link.`,
      `Checkout root: ${displayPath(root ?? path.dirname(directoryPath))}`,
    ].join("\n"));
  }
  if (!stats.isDirectory()) {
    fail(`${phase}: source path is not a directory: ${displayPath(directoryPath)}.`);
  }
  return true;
}

function inspectDependencyEntry(entryPath, root, phase) {
  let stats;
  try {
    stats = fs.lstatSync(entryPath);
  } catch (error) {
    if (error?.code === "ENOENT") return;
    fail(`${phase}: cannot inspect dependency entry ${displayPath(entryPath)}: ${error.message}`);
  }

  if (stats.isSymbolicLink()) {
    linkTarget(entryPath, root, phase);
    return;
  }
  if (!stats.isDirectory()) return;

  const entryName = path.basename(entryPath);
  if (!entryName.startsWith("@")) return;

  let children;
  try {
    children = fs.readdirSync(entryPath, { withFileTypes: true });
  } catch (error) {
    fail(`${phase}: cannot inspect scoped dependency directory ${displayPath(entryPath)}: ${error.message}`);
  }
  for (const child of children) {
    inspectDependencyEntry(path.join(entryPath, child.name), root, phase);
  }
}

function inspectDependencyRoot(dependencyRoot, root, phase) {
  let stats;
  try {
    stats = fs.lstatSync(dependencyRoot);
  } catch (error) {
    if (error?.code === "ENOENT") return;
    fail(`${phase}: cannot inspect dependency root ${displayPath(dependencyRoot)}: ${error.message}`);
  }

  if (stats.isSymbolicLink()) {
    linkTarget(dependencyRoot, root, phase);
    return;
  }
  if (!stats.isDirectory()) {
    fail(`${phase}: dependency root is not a directory: ${displayPath(dependencyRoot)}.`);
  }

  let entries;
  try {
    entries = fs.readdirSync(dependencyRoot, { withFileTypes: true });
  } catch (error) {
    fail(`${phase}: cannot inspect dependency root ${displayPath(dependencyRoot)}: ${error.message}`);
  }
  for (const entry of entries) {
    if (entry.name === ".pnpm") {
      inspectDependencyEntry(path.join(dependencyRoot, entry.name), root, phase);
      continue;
    }
    inspectDependencyEntry(path.join(dependencyRoot, entry.name), root, phase);
  }
}

function inspectReparsePoints({ cwd = process.cwd(), paths: candidatePaths } = {}) {
  const root = repositoryRoot(cwd);
  const pathsToInspect = candidatePaths ?? [
    path.join(root, "shared"),
    ...SOURCE_DIRECTORIES.map((directory) => path.join(root, directory)),
    ...DEPENDENCY_ROOTS.map((directory) => path.join(root, directory)),
  ];
  const links = [];
  for (const candidatePath of pathsToInspect) {
    let stats;
    try {
      stats = fs.lstatSync(candidatePath);
    } catch (error) {
      if (error?.code === "ENOENT") continue;
      fail(`filesystem inspection cannot read ${displayPath(candidatePath)}: ${error.message}`);
    }
    if (!stats.isSymbolicLink()) continue;
    const target = realPath(candidatePath);
    links.push({ path: displayPath(candidatePath), target: target ? displayPath(target) : null });
  }
  return links;
}

function assertWorktreeFilesystemIsolation({ cwd = process.cwd(), phase = "workspace" } = {}) {
  const root = repositoryRoot(cwd);
  assertSourceDirectory(path.join(root, "shared"), { required: true, phase, root });
  for (const directory of SOURCE_DIRECTORIES) {
    assertSourceDirectory(path.join(root, directory), { required: false, phase, root });
  }
  for (const dependencyRoot of DEPENDENCY_ROOTS) {
    inspectDependencyRoot(path.join(root, dependencyRoot), root, phase);
  }
  return { root };
}

function assertMainSourceIntegrity(options = {}) {
  return assertWorktreeFilesystemIsolation({ ...options, phase: options.phase ?? "main source" });
}

module.exports = {
  DEPENDENCY_ROOTS,
  SOURCE_DIRECTORIES,
  assertMainSourceIntegrity,
  assertWorktreeFilesystemIsolation,
  comparablePath,
  displayPath,
  inspectReparsePoints,
  isWithin,
  linkTarget,
  realPath,
  repositoryRoot,
};
