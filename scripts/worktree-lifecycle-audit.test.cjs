"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const { parseWorktreeList } = require("./cleanup-codex-worktree.cjs");
const {
  assertNoUnresolvedWorktreeLifecycleIssues,
  auditWorktreeLifecycle,
  expectedWorktreePath,
  primaryRepositoryRoot,
} = require("./worktree-lifecycle-audit.cjs");
const { recoverOrphanWorktree } = require("./recover-orphan-worktree.cjs");

function runGit(cwd, args, { expectSuccess = true } = {}) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8", windowsHide: true });
  if (expectSuccess) assert.equal(result.status, 0, result.stderr || result.stdout);
  return result;
}

function createRepository(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ai-novel-lifecycle-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  runGit(directory, ["init", "-b", "main"]);
  runGit(directory, ["config", "user.name", "Lifecycle Test"]);
  runGit(directory, ["config", "user.email", "lifecycle@example.invalid"]);
  fs.mkdirSync(path.join(directory, "shared", "types"), { recursive: true });
  fs.writeFileSync(path.join(directory, "README.md"), "base\n");
  fs.writeFileSync(path.join(directory, ".gitignore"), "node_modules/\n");
  fs.writeFileSync(path.join(directory, "shared", "types", "example.ts"), "export type Example = string;\n");
  runGit(directory, ["add", "."]);
  runGit(directory, ["commit", "-m", "initial"]);
  return directory;
}

function createOrphan(directory, branchName) {
  const target = expectedWorktreePath(directory, branchName);
  runGit(directory, ["worktree", "add", "-b", branchName, target, "main"]);
  runGit(directory, ["worktree", "remove", "--force", target]);
  fs.mkdirSync(path.join(target, "shared", "types"), { recursive: true });
  fs.writeFileSync(path.join(target, "README.md"), "base\n");
  fs.writeFileSync(path.join(target, ".gitignore"), "node_modules/\n");
  fs.writeFileSync(path.join(target, "shared", "types", "example.ts"), "export type Example = string;\n");
  return target;
}

function removeOrphan(directory, branchName, target) {
  fs.rmSync(target, { recursive: true, force: true });
  runGit(directory, ["branch", "-D", branchName], { expectSuccess: false });
}

test("parses prunable worktree registrations without treating them as clean", () => {
  const entries = parseWorktreeList([
    "worktree D:/repo-main",
    "HEAD abc123",
    "branch refs/heads/codex/example",
    "prunable",
    "",
  ].join("\n"));

  assert.equal(entries.length, 1);
  assert.equal(entries[0].prunable, true);
  assert.equal(entries[0].branch, "refs/heads/codex/example");
});

test("reports a branch whose convention-based directory is no longer registered", (t) => {
  const directory = createRepository(t);
  const branchName = "codex/orphan-report";
  const target = createOrphan(directory, branchName);
  t.after(() => removeOrphan(directory, branchName, target));

  const report = auditWorktreeLifecycle({ cwd: directory });

  assert.equal(primaryRepositoryRoot(directory), directory);
  assert.equal(
    report.issues.some((entry) => entry.kind === "orphan-worktree-directory" && entry.branch === branchName),
    true,
  );
  assert.throws(
    () => assertNoUnresolvedWorktreeLifecycleIssues({ cwd: directory, phase: "test" }),
    /unresolved worktree lifecycle issues|orphan-worktree-directory/i,
  );
});

test("dry-run validates an exact merged orphan without changing it, then apply removes only that orphan", (t) => {
  const directory = createRepository(t);
  const branchName = "codex/orphan-recover";
  const target = createOrphan(directory, branchName);
  t.after(() => removeOrphan(directory, branchName, target));

  const dryRun = recoverOrphanWorktree({ cwd: directory, branchName });
  assert.equal(dryRun.applied, false);
  assert.equal(dryRun.fileCount, 3);
  assert.equal(fs.existsSync(target), true);
  assert.equal(runGit(directory, ["show-ref", "--verify", `refs/heads/${branchName}`]).status, 0);

  const applied = recoverOrphanWorktree({ cwd: directory, branchName, apply: true });
  assert.equal(applied.applied, true);
  assert.equal(fs.existsSync(target), false);
  assert.notEqual(runGit(directory, ["show-ref", "--verify", `refs/heads/${branchName}`], { expectSuccess: false }).status, 0);
});

test("refuses recovery when orphan content has been modified", (t) => {
  const directory = createRepository(t);
  const branchName = "codex/orphan-modified";
  const target = createOrphan(directory, branchName);
  t.after(() => removeOrphan(directory, branchName, target));
  fs.writeFileSync(path.join(target, "README.md"), "user change\n");

  assert.throws(
    () => recoverOrphanWorktree({ cwd: directory, branchName, apply: true }),
    /modified tracked content|do not exactly match/i,
  );
  assert.equal(fs.existsSync(target), true);
  assert.equal(runGit(directory, ["show-ref", "--verify", `refs/heads/${branchName}`]).status, 0);
});
