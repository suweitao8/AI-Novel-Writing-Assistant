"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const { cleanupCodexWorktree, parseArgs } = require("./cleanup-codex-worktree.cjs");

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
  fs.writeFileSync(path.join(directory, ".gitignore"), "node_modules/\n");
  runGit(directory, ["add", "README.md", ".gitignore", "shared"]);
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

function linkDirectory(target, linkPath) {
  fs.mkdirSync(path.dirname(linkPath), { recursive: true });
  fs.symlinkSync(target, linkPath, process.platform === "win32" ? "junction" : "dir");
}

test("cleanup arguments support the explicit lifecycle repair mode", () => {
  assert.deepEqual(parseArgs(["codex/guard", "--repair-lifecycle"]), {
    allowLifecycleRepair: true,
    target: "codex/guard",
  });
  assert.throws(() => parseArgs(["codex/guard", "--unknown"]), /unknown cleanup option/i);
});

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

test("refuses cleanup while another unregistered orphan exists", (t) => {
  const directory = createRepository(t);
  const targetBranch = "codex/cleanup-target";
  const target = createFeatureWorktree(directory, targetBranch);
  runGit(directory, ["merge", "--no-ff", "--no-edit", targetBranch]);
  const orphanBranch = "codex/cleanup-orphan-blocker";
  const orphanPath = path.join(path.dirname(directory), `${path.basename(directory)}-cleanup-orphan-blocker`);
  runGit(directory, ["worktree", "add", "-b", orphanBranch, orphanPath, "main"]);
  runGit(directory, ["worktree", "remove", "--force", orphanPath]);
  fs.mkdirSync(path.join(orphanPath, "shared"), { recursive: true });
  t.after(() => {
    fs.rmSync(orphanPath, { recursive: true, force: true });
    if (fs.existsSync(directory)) {
      runGit(directory, ["branch", "-D", orphanBranch], { expectSuccess: false });
      removeRegisteredWorktree(directory, target);
    } else {
      fs.rmSync(target, { recursive: true, force: true });
    }
  });

  assert.throws(
    () => cleanupCodexWorktree({ cwd: directory, target: targetBranch }),
    /unresolved worktree lifecycle|orphan-worktree-directory/i,
  );
  assert.equal(fs.existsSync(target), true);
  assert.equal(runGit(directory, ["show-ref", "--verify", `refs/heads/${targetBranch}`]).status, 0);
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

test("removes local dependency directories before deleting a merged worktree", (t) => {
  const directory = createRepository(t);
  const branch = "codex/with-dependencies";
  const target = createFeatureWorktree(directory, branch);
  runGit(directory, ["merge", "--no-ff", "--no-edit", branch]);
  fs.mkdirSync(path.join(target, "node_modules", ".pnpm", "fixture"), { recursive: true });
  const dependencyRoot = path.join(target, "node_modules");
  const siteDependencyRoot = path.join(target, "site", "node_modules");
  fs.writeFileSync(path.join(dependencyRoot, ".pnpm", "fixture", "package.json"), "{}\n");
  fs.mkdirSync(path.join(siteDependencyRoot, ".pnpm", "fixture"), { recursive: true });
  fs.writeFileSync(path.join(siteDependencyRoot, ".pnpm", "fixture", "package.json"), "{}\n");

  cleanupCodexWorktree({
    cwd: directory,
    target: branch,
    removeWorktree: ({ cwd, candidate }) => {
      assert.equal(fs.existsSync(dependencyRoot), false);
      assert.equal(fs.existsSync(siteDependencyRoot), false);
      runGit(cwd, ["worktree", "remove", "--force", candidate.path]);
    },
  });

  assert.equal(fs.existsSync(target), false);
  assert.notEqual(runGit(directory, ["show-ref", "--verify", `refs/heads/${branch}`], { expectSuccess: false }).status, 0);
});

test("validates all dependency roots before removing any of them", (t) => {
  const directory = createRepository(t);
  const branch = "codex/two-phase-cleanup";
  const target = createFeatureWorktree(directory, branch);
  runGit(directory, ["merge", "--no-ff", "--no-edit", branch]);
  const rootDependency = path.join(target, "node_modules");
  const clientDependency = path.join(target, "client", "node_modules");
  fs.mkdirSync(path.join(rootDependency, ".pnpm", "fixture"), { recursive: true });
  fs.writeFileSync(path.join(rootDependency, ".pnpm", "fixture", "package.json"), "{}\n");
  linkDirectory(rootDependency, clientDependency);

  cleanupCodexWorktree({
    cwd: directory,
    target: branch,
    removeWorktree: ({ cwd, candidate }) => {
      assert.equal(fs.existsSync(rootDependency), false);
      assert.equal(fs.existsSync(clientDependency), false);
      runGit(cwd, ["worktree", "remove", "--force", candidate.path]);
    },
  });
  assert.equal(fs.existsSync(target), false);
});
