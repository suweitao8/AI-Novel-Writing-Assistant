const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { spawnSync } = require("node:child_process");

const repoRoot = path.resolve(__dirname, "..");
const {
  assertMainWorkspaceReady,
  branchNameForTask,
  defaultWorktreePath,
  normalizeTaskSlug,
  parseArgs,
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
  fs.mkdirSync(path.join(directory, "shared", "types"), { recursive: true });
  fs.writeFileSync(path.join(directory, "shared", "types", "example.ts"), "export type Example = string;\n");
  runGit(directory, ["add", "README.md", "shared"]);
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
  fs.copyFileSync(path.join(repoRoot, "scripts", "worktree-filesystem-safety.cjs"), path.join(directory, "scripts", "worktree-filesystem-safety.cjs"));
  fs.writeFileSync(
    path.join(directory, "package.json"),
    JSON.stringify({
      name: "worktree-cli-fixture",
      private: true,
      scripts: { "setup:git-hooks": "node scripts/install-git-hooks.cjs" },
    }, null, 2),
  );
  fs.writeFileSync(
    path.join(directory, "pnpm-lock.yaml"),
    "lockfileVersion: '9.0'\nsettings:\n  autoInstallPeers: true\n  excludeLinksFromLockfile: false\nimporters:\n  .: {}\n",
  );
  runGit(directory, ["add", ".githooks", "scripts", "package.json", "pnpm-lock.yaml"]);
  runGit(directory, ["commit", "-m", "add workflow bootstrap"]);
}

test("normalizes task names to safe lowercase branch slugs", () => {
  assert.equal(normalizeTaskSlug("Character Aesthetic_v2"), "character-aesthetic-v2");
  assert.equal(branchNameForTask("Video 16x9"), "codex/video-16x9");
  assert.throws(() => normalizeTaskSlug("---"), /task slug|empty/i);
  assert.deepEqual(parseArgs(["lifecycle-repair", "--repair-lifecycle"]), {
    allowLifecycleRepair: true,
    task: "lifecycle-repair",
  });
  assert.throws(() => parseArgs(["lifecycle-repair", "--unknown"]), /unknown worktree creation option/i);
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

test("refuses to create a worktree while an unregistered orphan directory remains", (t) => {
  const directory = createRepository();
  const orphanBranch = "codex/orphan-blocker";
  const orphanPath = path.join(path.dirname(directory), `${path.basename(directory)}-orphan-blocker`);
  const target = defaultWorktreePath(directory, "new-worktree");
  t.after(() => {
    fs.rmSync(orphanPath, { recursive: true, force: true });
    runGit(directory, ["branch", "-D", orphanBranch], { expectSuccess: false });
    fs.rmSync(target, { recursive: true, force: true });
    fs.rmSync(directory, { recursive: true, force: true });
  });
  copyWorkflowFiles(directory);
  runGit(directory, ["worktree", "add", "-b", orphanBranch, orphanPath, "main"]);
  runGit(directory, ["worktree", "remove", "--force", orphanPath]);
  fs.mkdirSync(path.join(orphanPath, "shared"), { recursive: true });

  const result = spawnSync(process.execPath, [path.join(repoRoot, "scripts/create-codex-worktree.cjs"), "new-worktree"], {
    cwd: directory,
    encoding: "utf8",
    windowsHide: true,
  });

  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, /unresolved worktree lifecycle|orphan-worktree-directory/i);
  assert.equal(fs.existsSync(target), false);
});

test("repair mode can pass the lifecycle gate without relaxing main cleanliness", (t) => {
  const directory = createRepository();
  const orphanBranch = "codex/repair-mode-orphan";
  const orphanPath = path.join(path.dirname(directory), `${path.basename(directory)}-repair-mode-orphan`);
  t.after(() => {
    fs.rmSync(orphanPath, { recursive: true, force: true });
    if (fs.existsSync(directory)) runGit(directory, ["branch", "-D", orphanBranch], { expectSuccess: false });
    fs.rmSync(directory, { recursive: true, force: true });
  });
  copyWorkflowFiles(directory);
  runGit(directory, ["worktree", "add", "-b", orphanBranch, orphanPath, "main"]);
  runGit(directory, ["worktree", "remove", "--force", orphanPath]);
  fs.mkdirSync(path.join(orphanPath, "shared"), { recursive: true });

  assert.doesNotThrow(() => assertMainWorkspaceReady(directory, { allowLifecycleRepair: true }));
  fs.writeFileSync(path.join(directory, "unfinished.ts"), "dirty main\n");
  assert.throws(
    () => assertMainWorkspaceReady(directory, { allowLifecycleRepair: true }),
    /main workspace is not clean|unfinished\.ts/i,
  );
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

test("refuses to create a worktree when main shared resolves outside the checkout", (t) => {
  const directory = createRepository();
  const other = createRepository();
  const target = defaultWorktreePath(directory, "external-shared");
  t.after(() => {
    fs.rmSync(target, { recursive: true, force: true });
    fs.rmSync(directory, { recursive: true, force: true });
    fs.rmSync(other, { recursive: true, force: true });
  });
  copyWorkflowFiles(directory);
  fs.rmSync(path.join(directory, "shared"), { recursive: true, force: true });
  fs.symlinkSync(
    path.join(other, "shared"),
    path.join(directory, "shared"),
    process.platform === "win32" ? "junction" : "dir",
  );

  const result = spawnSync(process.execPath, [path.join(repoRoot, "scripts/create-codex-worktree.cjs"), "external-shared"], {
    cwd: directory,
    encoding: "utf8",
    windowsHide: true,
  });

  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, /external filesystem link|shared[\s\S]*->/i);
  assert.equal(fs.existsSync(target), false);
});
