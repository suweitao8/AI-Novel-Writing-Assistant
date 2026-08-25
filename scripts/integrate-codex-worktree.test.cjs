const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { spawnSync } = require("node:child_process");

const repoRoot = path.resolve(__dirname, "..");
const scriptPath = path.join(repoRoot, "scripts", "integrate-codex-worktree.cjs");
const {
  acquireIntegrationLock,
  assertIntegrationPreconditions,
  hasMergeHead,
  parseArgs,
} = require("./integrate-codex-worktree.cjs");

function runGit(cwd, args, { expectSuccess = true } = {}) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8", windowsHide: true });
  if (expectSuccess) {
    assert.equal(result.status, 0, result.stderr || result.stdout);
  }
  return result;
}

function createRepository() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ai-novel-integration-cli-"));
  runGit(directory, ["init", "-b", "main"]);
  runGit(directory, ["config", "user.name", "Integration CLI Test"]);
  runGit(directory, ["config", "user.email", "integration-cli@example.invalid"]);
  fs.writeFileSync(path.join(directory, "README.md"), "base\n");
  fs.mkdirSync(path.join(directory, "shared", "types"), { recursive: true });
  fs.writeFileSync(path.join(directory, "shared", "types", "example.ts"), "export type Example = string;\n");
  runGit(directory, ["add", "README.md", "shared"]);
  runGit(directory, ["commit", "-m", "initial"]);
  return directory;
}

function createRemote(directory) {
  const remote = fs.mkdtempSync(path.join(os.tmpdir(), "ai-novel-integration-remote-"));
  runGit(remote, ["init", "--bare"]);
  runGit(directory, ["remote", "add", "origin", remote]);
  runGit(directory, ["push", "origin", "main:refs/heads/main"]);
  return remote;
}

function createFeatureWorktree(directory, branchName, fileName, contents) {
  const target = path.join(path.dirname(directory), `${path.basename(directory)}-${branchName.replace(/\//g, "-")}`);
  runGit(directory, ["worktree", "add", "-b", branchName, target, "main"]);
  const filePath = path.join(target, fileName);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, contents);
  runGit(target, ["add", fileName]);
  runGit(target, ["commit", "-m", "feature change"]);
  return target;
}

function cleanupRepository(directory, worktreePath, remotePath) {
  if (worktreePath) {
    runGit(directory, ["worktree", "remove", "--force", worktreePath], { expectSuccess: false });
  }
  fs.rmSync(directory, { recursive: true, force: true });
  if (remotePath) fs.rmSync(remotePath, { recursive: true, force: true });
  if (worktreePath) fs.rmSync(worktreePath, { recursive: true, force: true });
}

test("integration requires the protected main branch and a clean codex worktree", (t) => {
  const directory = createRepository();
  t.after(() => cleanupRepository(directory));
  runGit(directory, ["switch", "-c", "codex/not-main"]);

  assert.throws(
    () => assertIntegrationPreconditions({ cwd: directory, taskBranch: "codex/not-main" }),
    /protected main branch/i,
  );
});

test("integration refuses to change main while an orphan lifecycle issue exists", (t) => {
  const directory = createRepository();
  const source = createFeatureWorktree(directory, "codex/integration-with-orphan", "feature.txt", "feature\n");
  const orphanBranch = "codex/orphan-integration-blocker";
  const orphanPath = path.join(path.dirname(directory), `${path.basename(directory)}-orphan-integration-blocker`);
  runGit(directory, ["worktree", "add", "-b", orphanBranch, orphanPath, "main"]);
  runGit(directory, ["worktree", "remove", "--force", orphanPath]);
  fs.mkdirSync(path.join(orphanPath, "shared"), { recursive: true });
  t.after(() => {
    fs.rmSync(orphanPath, { recursive: true, force: true });
    runGit(directory, ["branch", "-D", orphanBranch], { expectSuccess: false });
    cleanupRepository(directory, source);
  });

  assert.throws(
    () => assertIntegrationPreconditions({ cwd: directory, taskBranch: "codex/integration-with-orphan" }),
    /unresolved worktree lifecycle|orphan-worktree-directory/i,
  );
  assert.equal(hasMergeHead(directory), false);
  assert.equal(runGit(directory, ["rev-parse", "HEAD"]).status, 0);
});

test("integration arguments require the source branch first and reject unknown options", () => {
  assert.deepEqual(parseArgs(["codex/example", "--push", "--verify", "node --test", "--repair-lifecycle"]), {
    allowLifecycleRepair: true,
    taskBranch: "codex/example",
    push: true,
    verifyCommand: "node --test",
  });
  assert.throws(() => parseArgs(["--push"]), /source branch first/i);
  assert.throws(() => parseArgs(["codex/example", "--verify"]), /requires one shell command/i);
  assert.throws(() => parseArgs(["codex/example", "--unexpected"]), /unknown integration option/i);
});

test("lifecycle repair mode allows only the guarded workflow path scope", (t) => {
  const directory = createRepository();
  const source = createFeatureWorktree(directory, "codex/lifecycle-repair", "scripts/worktree-lifecycle-audit.cjs", "repair\n");
  const orphanBranch = "codex/lifecycle-repair-blocker";
  const orphanPath = path.join(path.dirname(directory), `${path.basename(directory)}-lifecycle-repair-blocker`);
  runGit(directory, ["worktree", "add", "-b", orphanBranch, orphanPath, "main"]);
  runGit(directory, ["worktree", "remove", "--force", orphanPath]);
  fs.mkdirSync(path.join(orphanPath, "shared"), { recursive: true });
  t.after(() => {
    fs.rmSync(orphanPath, { recursive: true, force: true });
    if (fs.existsSync(directory)) {
      runGit(directory, ["branch", "-D", orphanBranch], { expectSuccess: false });
    }
    cleanupRepository(directory, source);
  });

  assert.doesNotThrow(() => assertIntegrationPreconditions({
    cwd: directory,
    taskBranch: "codex/lifecycle-repair",
    allowLifecycleRepair: true,
  }));
});

test("lifecycle repair mode rejects a branch that changes product files", (t) => {
  const directory = createRepository();
  const source = createFeatureWorktree(directory, "codex/lifecycle-repair-product", "feature.txt", "not a guard\n");
  t.after(() => cleanupRepository(directory, source));

  assert.throws(
    () => assertIntegrationPreconditions({
      cwd: directory,
      taskBranch: "codex/lifecycle-repair-product",
      allowLifecycleRepair: true,
    }),
    /outside the guarded workflow scope|feature\.txt/i,
  );
});

test("integration lock rejects a second active owner and releases safely", (t) => {
  const commonDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-novel-integration-lock-"));
  t.after(() => fs.rmSync(commonDir, { recursive: true, force: true }));
  const first = acquireIntegrationLock({ gitCommonDir: commonDir, branch: "codex/first" });

  assert.throws(
    () => acquireIntegrationLock({ gitCommonDir: commonDir, branch: "codex/second" }),
    /integration lock is held|pid/i,
  );
  first.release();
  const second = acquireIntegrationLock({ gitCommonDir: commonDir, branch: "codex/second" });
  second.release();
});

test("clean integration creates a merge commit and pushes only main", (t) => {
  const directory = createRepository();
  const remote = createRemote(directory);
  const source = createFeatureWorktree(directory, "codex/integration-success", "feature.txt", "feature\n");
  t.after(() => cleanupRepository(directory, source, remote));

  const result = spawnSync(process.execPath, [scriptPath, "codex/integration-success", "--push"], {
    cwd: directory,
    encoding: "utf8",
    windowsHide: true,
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(runGit(directory, ["rev-list", "--parents", "-n", "1", "HEAD"]).stdout.trim().split(/\s+/).length, 3);
  assert.equal(
    runGit(directory, ["rev-parse", "HEAD"]).stdout.trim(),
    runGit(remote, ["rev-parse", "refs/heads/main"]).stdout.trim(),
  );
  assert.equal(hasMergeHead(directory), false);
});

test("dirty source worktree is rejected before main is changed", (t) => {
  const directory = createRepository();
  const source = createFeatureWorktree(directory, "codex/dirty-source", "feature.txt", "feature\n");
  t.after(() => cleanupRepository(directory, source));
  fs.writeFileSync(path.join(source, "unfinished.txt"), "parallel work\n");
  const before = runGit(directory, ["rev-parse", "HEAD"]).stdout.trim();

  const result = spawnSync(process.execPath, [scriptPath, "codex/dirty-source"], {
    cwd: directory,
    encoding: "utf8",
    windowsHide: true,
  });

  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, /source worktree.*not clean|uncommitted/i);
  assert.equal(runGit(directory, ["rev-parse", "HEAD"]).stdout.trim(), before);
});

test("merge conflict is aborted so main does not retain MERGE_HEAD", (t) => {
  const directory = createRepository();
  const source = createFeatureWorktree(directory, "codex/conflict-source", "conflict.txt", "feature\n");
  t.after(() => cleanupRepository(directory, source));
  fs.writeFileSync(path.join(directory, "conflict.txt"), "main\n");
  runGit(directory, ["add", "conflict.txt"]);
  runGit(directory, ["commit", "-m", "main conflict change"]);

  const result = spawnSync(process.execPath, [scriptPath, "codex/conflict-source"], {
    cwd: directory,
    encoding: "utf8",
    windowsHide: true,
  });

  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, /merge|conflict/i);
  assert.equal(hasMergeHead(directory), false);
  assert.equal(runGit(directory, ["status", "--porcelain"]).stdout.trim(), "");
});

test("integration rejects a source worktree whose shared directory resolves outside", (t) => {
  const directory = createRepository();
  const source = createFeatureWorktree(directory, "codex/external-source", "feature.txt", "feature\n");
  const other = createRepository();
  t.after(() => {
    cleanupRepository(directory, source, null);
    fs.rmSync(other, { recursive: true, force: true });
  });
  fs.rmSync(path.join(source, "shared"), { recursive: true, force: true });
  fs.symlinkSync(
    path.join(other, "shared"),
    path.join(source, "shared"),
    process.platform === "win32" ? "junction" : "dir",
  );

  const result = spawnSync(process.execPath, [scriptPath, "codex/external-source"], {
    cwd: directory,
    encoding: "utf8",
    windowsHide: true,
  });

  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, /external filesystem link|shared[\s\S]*->/i);
  assert.equal(hasMergeHead(directory), false);
});
