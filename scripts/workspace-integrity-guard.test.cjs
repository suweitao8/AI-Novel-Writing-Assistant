const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { spawnSync } = require("node:child_process");

const {
  assertClientRuntimeIntegrity,
  assertDevelopmentWorkspaceIntegrity,
  assertMainWorkspaceSharedIntegrity,
  assertStartupIntegrity,
} = require("./workspace-integrity-guard.cjs");

function runGit(cwd, args) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8", windowsHide: true });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout;
}

function createRepository() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ai-novel-workspace-guard-"));
  runGit(directory, ["init", "-b", "main"]);
  runGit(directory, ["config", "user.name", "Workspace Guard Test"]);
  runGit(directory, ["config", "user.email", "workspace-guard@example.invalid"]);
  fs.mkdirSync(path.join(directory, ".githooks"), { recursive: true });
  runGit(directory, ["config", "core.hooksPath", path.join(directory, ".githooks")]);
  runGit(directory, ["config", "merge.ff", "false"]);
  return directory;
}

function writeFile(directory, fileName, contents) {
  const fullPath = path.join(directory, fileName);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, contents);
}

function createInitialCommit(directory) {
  writeFile(directory, "shared/types/example.ts", "export type Example = string;\n");
  writeFile(directory, ".gitignore", "client/node_modules/\n");
  runGit(directory, ["add", "shared/types/example.ts", ".gitignore"]);
  runGit(directory, ["commit", "-m", "initial shared contract"]);
}

function createClientRuntime(directory, { includeRuntime }) {
  writeFile(
    directory,
    "client/node_modules/@vitejs/plugin-react/package.json",
    JSON.stringify({ name: "@vitejs/plugin-react", version: "5.1.4" }),
  );
  if (includeRuntime) {
    writeFile(
      directory,
      "client/node_modules/@vitejs/plugin-react/dist/refresh-runtime.js",
      "export default {};\n",
    );
  }
}

test("main workspace rejects an unstaged deletion under shared", (t) => {
  const directory = createRepository();
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  createInitialCommit(directory);

  fs.rmSync(path.join(directory, "shared/types/example.ts"));

  assert.throws(
    () => assertMainWorkspaceSharedIntegrity({ cwd: directory }),
    /main workspace contains uncommitted shared changes[\s\S]*D\s+shared\/types\/example\.ts/i,
  );
});

test("feature worktree does not reject its own shared edit", (t) => {
  const directory = createRepository();
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  createInitialCommit(directory);
  runGit(directory, ["switch", "-c", "codex/shared-contract-test"]);

  writeFile(directory, "shared/types/example.ts", "export type Example = number;\n");

  assert.doesNotThrow(() => assertMainWorkspaceSharedIntegrity({ cwd: directory }));
});

test("main workspace rejects tracked edits outside shared before development starts", (t) => {
  const directory = createRepository();
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  createInitialCommit(directory);
  writeFile(directory, "client/App.tsx", "export default function App() { return null; }\n");
  runGit(directory, ["add", "client/App.tsx"]);

  assert.throws(
    () => assertDevelopmentWorkspaceIntegrity({ cwd: directory }),
    /main workspace contains uncommitted development changes[\s\S]*client\/App\.tsx/i,
  );
});

test("main workspace rejects untracked files before development starts", (t) => {
  const directory = createRepository();
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  createInitialCommit(directory);
  writeFile(directory, "notes-from-parallel-session.txt", "keep this out of main\n");

  assert.throws(
    () => assertDevelopmentWorkspaceIntegrity({ cwd: directory }),
    /main workspace contains uncommitted development changes[\s\S]*notes-from-parallel-session\.txt/i,
  );
});

test("feature worktree permits its own dirty development files", (t) => {
  const directory = createRepository();
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  createInitialCommit(directory);
  runGit(directory, ["switch", "-c", "codex/workflow-test"]);
  writeFile(directory, "client/App.tsx", "export default function App() { return null; }\n");

  assert.doesNotThrow(() => assertDevelopmentWorkspaceIntegrity({ cwd: directory }));
});

test("main workspace rejects an unfinished merge before development starts", (t) => {
  const directory = createRepository();
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  createInitialCommit(directory);
  const mergeHeadPath = runGit(directory, ["rev-parse", "--git-path", "MERGE_HEAD"]).trim();
  fs.writeFileSync(path.isAbsolute(mergeHeadPath) ? mergeHeadPath : path.join(directory, mergeHeadPath), `${"0".repeat(40)}\n`);

  assert.throws(
    () => assertDevelopmentWorkspaceIntegrity({ cwd: directory }),
    /unfinished merge|MERGE_HEAD/i,
  );
});

test("main workspace rejects a checkout with hooks pointed outside tracked .githooks", (t) => {
  const directory = createRepository();
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  createInitialCommit(directory);
  runGit(directory, ["config", "core.hooksPath", path.join(directory, "untrusted-hooks")]);

  assert.throws(
    () => assertDevelopmentWorkspaceIntegrity({ cwd: directory }),
    /core\.hooksPath|tracked \.githooks/i,
  );
});

test("clean main workspace passes the development integrity gate", (t) => {
  const directory = createRepository();
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  createInitialCommit(directory);

  assert.doesNotThrow(() => assertDevelopmentWorkspaceIntegrity({ cwd: directory }));
});

test("startup integrity check reports a missing Vite refresh runtime", (t) => {
  const directory = createRepository();
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  createInitialCommit(directory);
  createClientRuntime(directory, { includeRuntime: false });

  assert.throws(
    () => assertStartupIntegrity({ cwd: directory }),
    /Vite React refresh runtime is missing/i,
  );
});

test("client runtime check accepts an installed Vite refresh runtime", (t) => {
  const directory = createRepository();
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  createClientRuntime(directory, { includeRuntime: true });

  assert.doesNotThrow(() => assertClientRuntimeIntegrity({ cwd: directory }));
});

test("dependency preflight reports a missing Vite refresh runtime before starting services", (t) => {
  const directory = createRepository();
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  createInitialCommit(directory);
  runGit(directory, ["switch", "-c", "codex/dependency-preflight-test"]);
  writeFile(directory, "package.json", JSON.stringify({ name: "fixture", private: true }));
  writeFile(directory, "shared/package.json", JSON.stringify({ name: "shared" }));
  writeFile(directory, "server/package.json", JSON.stringify({ name: "server" }));
  writeFile(directory, "client/package.json", JSON.stringify({ name: "client" }));
  runGit(directory, ["add", "package.json", "shared/package.json", "server/package.json", "client/package.json"]);
  runGit(directory, ["commit", "-m", "add workspace manifests"]);
  fs.mkdirSync(path.join(directory, "scripts"), { recursive: true });
  fs.copyFileSync(path.join(__dirname, "check-deps.cjs"), path.join(directory, "scripts/check-deps.cjs"));
  fs.copyFileSync(
    path.join(__dirname, "workspace-integrity-guard.cjs"),
    path.join(directory, "scripts/workspace-integrity-guard.cjs"),
  );

  const result = spawnSync(process.execPath, ["scripts/check-deps.cjs"], {
    cwd: directory,
    encoding: "utf8",
    windowsHide: true,
  });

  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, /Vite React refresh runtime is missing/i);
});
