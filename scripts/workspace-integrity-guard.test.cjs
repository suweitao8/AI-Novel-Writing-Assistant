const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { spawnSync } = require("node:child_process");

const {
  assertClientRuntimeIntegrity,
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
  return directory;
}

function writeFile(directory, fileName, contents) {
  const fullPath = path.join(directory, fileName);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, contents);
}

function createInitialCommit(directory) {
  writeFile(directory, "shared/types/example.ts", "export type Example = string;\n");
  runGit(directory, ["add", "shared/types/example.ts"]);
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
