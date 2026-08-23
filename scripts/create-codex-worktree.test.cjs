const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { spawnSync } = require("node:child_process");

const repoRoot = path.resolve(__dirname, "..");
const {
  branchNameForTask,
  defaultWorktreePath,
  normalizeTaskSlug,
} = require("./create-codex-worktree.cjs");

function runGit(cwd, args, { expectSuccess = true } = {}) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8", windowsHide: true });
  if (expectSuccess) {
    assert.equal(result.status, 0, result.stderr || result.stdout);
  }
  return result;
}

function createRepository() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ai-novel-worktree-cli-"));
  runGit(directory, ["init", "-b", "main"]);
  runGit(directory, ["config", "user.name", "Worktree CLI Test"]);
  runGit(directory, ["config", "user.email", "worktree-cli@example.invalid"]);
  fs.writeFileSync(path.join(directory, "README.md"), "fixture\n");
  runGit(directory, ["add", "README.md"]);
  runGit(directory, ["commit", "-m", "initial"]);
  return directory;
}

function copyWorkflowFiles(directory) {
  fs.mkdirSync(path.join(directory, ".githooks"), { recursive: true });
  fs.mkdirSync(path.join(directory, "scripts"), { recursive: true });
  fs.copyFileSync(path.join(repoRoot, ".githooks", "pre-commit"), path.join(directory, ".githooks", "pre-commit"));
  fs.copyFileSync(path.join(repoRoot, ".githooks", "pre-merge-commit"), path.join(directory, ".githooks", "pre-merge-commit"));
  fs.copyFileSync(path.join(repoRoot, "scripts", "install-git-hooks.cjs"), path.join(directory, "scripts", "install-git-hooks.cjs"));
  fs.copyFileSync(path.join(repoRoot, "scripts", "git-workflow-guard.cjs"), path.join(directory, "scripts", "git-workflow-guard.cjs"));
  fs.copyFileSync(path.join(repoRoot, "scripts", "workspace-integrity-guard.cjs"), path.join(directory, "scripts", "workspace-integrity-guard.cjs"));
  fs.writeFileSync(
    path.join(directory, "package.json"),
    JSON.stringify({
      name: "worktree-cli-fixture",
      private: true,
      scripts: { "setup:git-hooks": "node scripts/install-git-hooks.cjs" },
    }, null, 2),
  );
  runGit(directory, ["add", ".githooks", "scripts", "package.json"]);
  runGit(directory, ["commit", "-m", "add workflow bootstrap"]);
}

test("normalizes task names to safe lowercase branch slugs", () => {
  assert.equal(normalizeTaskSlug("Character Aesthetic_v2"), "character-aesthetic-v2");
  assert.equal(branchNameForTask("Video 16x9"), "codex/video-16x9");
  assert.throws(() => normalizeTaskSlug("---"), /task slug|empty/i);
});

test("uses a sibling worktree path derived from the repository name", () => {
  assert.equal(
    path.normalize(defaultWorktreePath("D:/Github/AI-Novel-Writing-Assistant", "image-crop")),
    path.normalize("D:/Github/AI-Novel-Writing-Assistant-image-crop"),
  );
});

test("creates a sibling codex worktree and installs hooks", (t) => {
  const directory = createRepository();
  const target = defaultWorktreePath(directory, "workflow-fixture");
  t.after(() => {
    fs.rmSync(target, { recursive: true, force: true });
    fs.rmSync(directory, { recursive: true, force: true });
  });
  copyWorkflowFiles(directory);

  const result = spawnSync(process.execPath, [path.join(repoRoot, "scripts/create-codex-worktree.cjs"), "workflow-fixture"], {
    cwd: directory,
    encoding: "utf8",
    windowsHide: true,
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /codex\/workflow-fixture/);
  assert.equal(runGit(target, ["branch", "--show-current"]).stdout.trim(), "codex/workflow-fixture");
  assert.equal(runGit(target, ["config", "--local", "--get", "merge.ff"]).stdout.trim(), "false");
  assert.equal(
    path.normalize(runGit(target, ["config", "--local", "--get", "core.hooksPath"]).stdout.trim()),
    path.normalize(path.join(target, ".githooks")),
  );
});

test("refuses to create a worktree from a dirty main workspace", (t) => {
  const directory = createRepository();
  const target = defaultWorktreePath(directory, "dirty-main");
  t.after(() => {
    fs.rmSync(target, { recursive: true, force: true });
    fs.rmSync(directory, { recursive: true, force: true });
  });
  copyWorkflowFiles(directory);
  fs.writeFileSync(path.join(directory, "unfinished.ts"), "do not develop on main\n");

  const result = spawnSync(process.execPath, [path.join(repoRoot, "scripts/create-codex-worktree.cjs"), "dirty-main"], {
    cwd: directory,
    encoding: "utf8",
    windowsHide: true,
  });

  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, /main workspace|uncommitted/i);
  assert.equal(fs.existsSync(target), false);
});

test("refuses to create a worktree when the requested branch already exists", (t) => {
  const directory = createRepository();
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  copyWorkflowFiles(directory);
  runGit(directory, ["switch", "-c", "codex/already-exists"]);
  runGit(directory, ["switch", "main"]);

  const result = spawnSync(process.execPath, [path.join(repoRoot, "scripts/create-codex-worktree.cjs"), "already-exists"], {
    cwd: directory,
    encoding: "utf8",
    windowsHide: true,
  });

  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, /already exists|collision/i);
});
