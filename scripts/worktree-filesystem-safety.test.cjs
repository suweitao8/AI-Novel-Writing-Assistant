"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const { assertWorktreeFilesystemIsolation } = require("./worktree-filesystem-safety.cjs");

function runGit(cwd, args) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8", windowsHide: true });
  assert.equal(result.status, 0, result.stderr || result.stdout);
}

function writeFile(directory, relativePath, contents) {
  const filePath = path.join(directory, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, contents);
}

function createFixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ai-novel-worktree-safety-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));

  runGit(directory, ["init", "-b", "main"]);
  runGit(directory, ["config", "user.name", "Filesystem Safety Test"]);
  runGit(directory, ["config", "user.email", "filesystem-safety@example.invalid"]);
  writeFile(directory, "shared/types/example.ts", "export type Example = string;\n");
  fs.mkdirSync(path.join(directory, "client"), { recursive: true });
  fs.mkdirSync(path.join(directory, "server"), { recursive: true });
  fs.mkdirSync(path.join(directory, "scripts"), { recursive: true });
  runGit(directory, ["add", "shared", "client", "server", "scripts"]);
  runGit(directory, ["commit", "-m", "initial checkout"]);
  return directory;
}

function linkDirectory(target, linkPath) {
  fs.mkdirSync(path.dirname(linkPath), { recursive: true });
  fs.symlinkSync(target, linkPath, process.platform === "win32" ? "junction" : "dir");
}

test("accepts a checkout whose source and dependency roots are local", (t) => {
  const fixture = createFixture(t);
  fs.mkdirSync(path.join(fixture, "node_modules"), { recursive: true });

  assert.doesNotThrow(() => assertWorktreeFilesystemIsolation({ cwd: fixture }));
});

test("rejects shared when it is a junction to another checkout", (t) => {
  const fixture = createFixture(t);
  const other = createFixture(t);
  fs.rmSync(path.join(fixture, "shared"), { recursive: true, force: true });
  linkDirectory(path.join(other, "shared"), path.join(fixture, "shared"));

  assert.throws(
    () => assertWorktreeFilesystemIsolation({ cwd: fixture }),
    /shared[\s\S]*(outside|->)/i,
  );
});

test("rejects a dependency root that resolves to another checkout", (t) => {
  const fixture = createFixture(t);
  const other = createFixture(t);
  fs.mkdirSync(path.join(other, "node_modules"), { recursive: true });
  linkDirectory(path.join(other, "node_modules"), path.join(fixture, "node_modules"));

  assert.throws(
    () => assertWorktreeFilesystemIsolation({ cwd: fixture }),
    /node_modules[\s\S]*(outside|->)/i,
  );
});

test("rejects a site dependency root that resolves to another checkout", (t) => {
  const fixture = createFixture(t);
  const other = createFixture(t);
  fs.mkdirSync(path.join(other, "site", "node_modules"), { recursive: true });
  linkDirectory(path.join(other, "site", "node_modules"), path.join(fixture, "site", "node_modules"));

  assert.throws(
    () => assertWorktreeFilesystemIsolation({ cwd: fixture }),
    /external filesystem link|node_modules/i,
  );
});

test("rejects a missing shared source directory", (t) => {
  const fixture = createFixture(t);
  fs.rmSync(path.join(fixture, "shared"), { recursive: true, force: true });

  assert.throws(() => assertWorktreeFilesystemIsolation({ cwd: fixture }), /required source directory is missing.*shared/i);
});
