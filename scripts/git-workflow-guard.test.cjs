const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { spawnSync } = require("node:child_process");

const repoRoot = path.resolve(__dirname, "..");

function runGit(cwd, args, input = "") {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    input,
    windowsHide: true,
  });

  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

function createRepository() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ai-novel-git-guard-"));
  assert.equal(runGit(directory, ["init", "-b", "main"]).status, 0);
  assert.equal(runGit(directory, ["config", "user.name", "Git Workflow Test"]).status, 0);
  assert.equal(runGit(directory, ["config", "user.email", "git-workflow-test@example.invalid"]).status, 0);
  return directory;
}

function installTestHooks(directory) {
  const hooksPath = path.join(directory, ".githooks");
  fs.cpSync(path.join(repoRoot, ".githooks"), hooksPath, { recursive: true });
  fs.mkdirSync(path.join(directory, "scripts"), { recursive: true });
  fs.copyFileSync(
    path.join(repoRoot, "scripts", "git-workflow-guard.cjs"),
    path.join(directory, "scripts", "git-workflow-guard.cjs"),
  );
  fs.copyFileSync(
    path.join(repoRoot, "scripts", "install-git-hooks.cjs"),
    path.join(directory, "scripts", "install-git-hooks.cjs"),
  );
  const installer = spawnSync(process.execPath, [path.join(directory, "scripts", "install-git-hooks.cjs")], {
    cwd: directory,
    encoding: "utf8",
    windowsHide: true,
  });
  assert.equal(installer.status, 0, installer.stderr || installer.stdout);
  assert.equal(runGit(directory, ["config", "--get", "merge.ff"]).stdout.trim(), "false");
}

function writeAndStage(directory, fileName, contents) {
  fs.writeFileSync(path.join(directory, fileName), contents);
  assert.equal(runGit(directory, ["add", fileName]).status, 0);
}

function commitWithoutHooks(directory, message) {
  const result = runGit(directory, ["commit", "--no-verify", "-m", message]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
}

test("a direct commit on main is blocked while feature commits remain available", (t) => {
  assert.ok(fs.existsSync(path.join(repoRoot, ".githooks", "pre-commit")));
  assert.ok(fs.existsSync(path.join(repoRoot, "scripts", "git-workflow-guard.cjs")));

  const directory = createRepository();
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  installTestHooks(directory);

  writeAndStage(directory, "README.md", "initial\n");
  commitWithoutHooks(directory, "initial");

  writeAndStage(directory, "main-change.txt", "must stay off main\n");
  const headBeforeBlockedCommit = runGit(directory, ["rev-parse", "HEAD"]).stdout.trim();
  const blocked = runGit(directory, ["commit", "-m", "direct main commit"]);
  assert.notEqual(blocked.status, 0);
  assert.match(`${blocked.stdout}\n${blocked.stderr}`, /main.*(blocked|protected)|protected.*main/i);
  assert.equal(runGit(directory, ["rev-parse", "HEAD"]).stdout.trim(), headBeforeBlockedCommit);

  assert.equal(runGit(directory, ["switch", "-c", "codex/guard-test"]).status, 0);
  const featureCommit = runGit(directory, ["commit", "-m", "feature commit"]);
  assert.equal(featureCommit.status, 0, featureCommit.stderr || featureCommit.stdout);
});

test("a merge commit on main is allowed, but a second direct commit is still blocked", (t) => {
  const directory = createRepository();
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  installTestHooks(directory);

  writeAndStage(directory, "README.md", "initial\n");
  commitWithoutHooks(directory, "initial");
  assert.equal(runGit(directory, ["switch", "-c", "codex/merge-test"]).status, 0);
  writeAndStage(directory, "feature.txt", "feature\n");
  assert.equal(runGit(directory, ["commit", "-m", "feature commit"]).status, 0);
  assert.equal(runGit(directory, ["switch", "main"]).status, 0);

  const merge = runGit(directory, ["merge", "--no-edit", "codex/merge-test"]);
  assert.equal(merge.status, 0, merge.stderr || merge.stdout);
  assert.equal(runGit(directory, ["rev-list", "--parents", "-n", "1", "HEAD"]).stdout.trim().split(/\s+/).length, 3);

  writeAndStage(directory, "main-change.txt", "still protected\n");
  const blocked = runGit(directory, ["commit", "-m", "direct main commit after merge"]);
  assert.notEqual(blocked.status, 0);
  assert.match(`${blocked.stdout}\n${blocked.stderr}`, /main.*(blocked|protected)|protected.*main/i);
});

test("feature branches cannot be pushed directly to a remote", (t) => {
  const directory = createRepository();
  const remote = fs.mkdtempSync(path.join(os.tmpdir(), "ai-novel-git-guard-remote-"));
  t.after(() => {
    fs.rmSync(directory, { recursive: true, force: true });
    fs.rmSync(remote, { recursive: true, force: true });
  });
  installTestHooks(directory);
  assert.equal(runGit(remote, ["init", "--bare"]).status, 0);
  assert.equal(runGit(directory, ["remote", "add", "origin", remote]).status, 0);

  writeAndStage(directory, "README.md", "initial\n");
  commitWithoutHooks(directory, "initial");
  assert.equal(runGit(directory, ["push", "origin", "main:refs/heads/main"]).status, 0);
  assert.equal(runGit(directory, ["switch", "-c", "codex/push-test"]).status, 0);
  writeAndStage(directory, "feature.txt", "feature\n");

  const featureCommit = runGit(directory, ["commit", "-m", "feature commit"]);
  assert.equal(featureCommit.status, 0, featureCommit.stderr || featureCommit.stdout);
  const blockedPush = runGit(directory, ["push", "origin", "codex/push-test:refs/heads/codex/push-test"]);
  assert.notEqual(blockedPush.status, 0);
  assert.match(`${blockedPush.stdout}\n${blockedPush.stderr}`, /push.*(main|protected)|protected.*push/i);
});

test("pre-push catches a direct main commit even when pre-commit was bypassed", (t) => {
  const directory = createRepository();
  const remote = fs.mkdtempSync(path.join(os.tmpdir(), "ai-novel-git-guard-remote-"));
  t.after(() => {
    fs.rmSync(directory, { recursive: true, force: true });
    fs.rmSync(remote, { recursive: true, force: true });
  });
  installTestHooks(directory);
  assert.equal(runGit(remote, ["init", "--bare"]).status, 0);
  assert.equal(runGit(directory, ["remote", "add", "origin", remote]).status, 0);

  writeAndStage(directory, "README.md", "initial\n");
  commitWithoutHooks(directory, "initial");
  assert.equal(runGit(directory, ["push", "origin", "main:refs/heads/main"]).status, 0);

  writeAndStage(directory, "bypassed-main-change.txt", "must still stay off main\n");
  const bypassedCommit = runGit(directory, ["commit", "--no-verify", "-m", "bypassed direct main commit"]);
  assert.equal(bypassedCommit.status, 0, bypassedCommit.stderr || bypassedCommit.stdout);
  const blockedPush = runGit(directory, ["push", "origin", "main:refs/heads/main"]);
  assert.notEqual(blockedPush.status, 0);
  assert.match(`${blockedPush.stdout}\n${blockedPush.stderr}`, /direct commit|merge commit|main history/i);
});
