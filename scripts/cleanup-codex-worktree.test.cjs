"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const { cleanupCodexWorktree } = require("./cleanup-codex-worktree.cjs");

function runGit(cwd, args, { expectSuccess = true } = {}) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8", windowsHide: true });
  if (expectSuccess) assert.equal(result.status, 0, result.stderr || result.stdout);
  return result;
}

function createRepository(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ai-novel-cleanup-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  runGit(directory, ["init", "-b", "main"]);
  runGit(directory, ["config", "user.name", "Cleanup Test"]);
  runGit(directory, ["config", "user.email", "cleanup@example.invalid"]);
  fs.mkdirSync(path.join(directory, "shared", "types"), { recursive: true });
  fs.writeFileSync(path.join(directory, "shared", "types", "example.ts"), "export type Example = string;\n");
  fs.writeFileSync(path.join(directory, "README.md"), "base\n");
  runGit(directory, ["add", "README.md", "shared"]);
  runGit(directory, ["commit", "-m", "initial"]);
  return directory;
}

function createFeatureWorktree(directory, branchName) {
  const target = path.join(path.dirname(directory), `${path.basename(directory)}-${branchName.replace(/\//g, "-")}`);
  runGit(directory, ["worktree", "add", "-b", branchName, target, "main"]);
  fs.writeFileSync(path.join(target, "feature.txt"), "feature\n");
  runGit(target, ["add", "feature.txt"]);
  runGit(target, ["commit", "-m", "feature"]);
  return target;
}

function removeRegisteredWorktree(directory, target) {
  runGit(directory, ["worktree", "remove", "--force", target]);
}

test("refuses to clean a codex worktree before its branch is merged", (t) => {
  const directory = createRepository(t);
  const branch = "codex/not-merged";
  const target = createFeatureWorktree(directory, branch);

  assert.throws(
    () => cleanupCodexWorktree({ cwd: directory, target: branch }),
    /not.*merged|merge.*main/i,
  );
  assert.equal(fs.existsSync(target), true);
  assert.equal(runGit(directory, ["show-ref", "--verify", `refs/heads/${branch}`]).status, 0);
  removeRegisteredWorktree(directory, target);
});

test("refuses to clean a dirty codex worktree even after its branch is merged", (t) => {
  const directory = createRepository(t);
  const branch = "codex/dirty-cleanup";
  const target = createFeatureWorktree(directory, branch);
  runGit(directory, ["merge", "--no-ff", "--no-edit", branch]);
  fs.writeFileSync(path.join(target, "unfinished.txt"), "keep\n");

  assert.throws(() => cleanupCodexWorktree({ cwd: directory, target: branch }), /not clean|uncommitted/i);
  assert.equal(fs.existsSync(target), true);
  removeRegisteredWorktree(directory, target);
});

test("keeps the worktree and branch when controlled removal fails", (t) => {
  const directory = createRepository(t);
  const branch = "codex/remove-failure";
  const target = createFeatureWorktree(directory, branch);
  runGit(directory, ["merge", "--no-ff", "--no-edit", branch]);

  assert.throws(
    () => cleanupCodexWorktree({
      cwd: directory,
      target: branch,
      removeWorktree: () => {
        throw new Error("simulated controlled removal failure");
      },
    }),
    /simulated controlled removal failure/i,
  );
  assert.equal(fs.existsSync(target), true);
  assert.equal(runGit(directory, ["show-ref", "--verify", `refs/heads/${branch}`]).status, 0);
  removeRegisteredWorktree(directory, target);
});

test("removes an already merged and clean codex worktree before deleting its branch", (t) => {
  const directory = createRepository(t);
  const branch = "codex/cleaned";
  const target = createFeatureWorktree(directory, branch);
  runGit(directory, ["merge", "--no-ff", "--no-edit", branch]);

  cleanupCodexWorktree({ cwd: directory, target: branch });

  assert.equal(fs.existsSync(target), false);
  assert.notEqual(runGit(directory, ["show-ref", "--verify", `refs/heads/${branch}`], { expectSuccess: false }).status, 0);
  assert.doesNotMatch(runGit(directory, ["worktree", "list", "--porcelain"]).stdout, /codex\/cleaned/);
});
