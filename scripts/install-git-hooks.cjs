#!/usr/bin/env node

"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

function runGit(args) {
  return execFileSync("git", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

const repoRoot = path.resolve(runGit(["rev-parse", "--show-toplevel"]));
const hooksPath = path.join(repoRoot, ".githooks");
const guardScript = path.join(repoRoot, "scripts", "git-workflow-guard.cjs");

if (!fs.existsSync(hooksPath) || !fs.existsSync(guardScript)) {
  throw new Error("The tracked Git workflow guard files are missing from this checkout.");
}

runGit(["config", "--local", "core.hooksPath", hooksPath]);
runGit(["config", "--local", "merge.ff", "false"]);
console.log(`[git-workflow-guard] installed repository hooks at ${hooksPath}`);
console.log("[git-workflow-guard] direct commits, fast-forward merges, and pushes from main are now protected");
