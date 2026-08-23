const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { assertSupervisorStartupIntegrity, runServiceGroup } = require("./dev-service-supervisor.cjs");

const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8"));

function runGit(cwd, args) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8", windowsHide: true });
  assert.equal(result.status, 0, result.stderr || result.stdout);
}

test("supervisor applies the main-workspace gate before starting services", () => {
  const directory = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "ai-novel-supervisor-"));
  try {
    runGit(directory, ["init", "-b", "main"]);
    runGit(directory, ["config", "user.name", "Supervisor Test"]);
    runGit(directory, ["config", "user.email", "supervisor@example.invalid"]);
    fs.writeFileSync(path.join(directory, "README.md"), "base\n");
    runGit(directory, ["add", "README.md"]);
    runGit(directory, ["commit", "-m", "initial"]);
    fs.writeFileSync(path.join(directory, "unfinished.ts"), "must move to a worktree\n");

    assert.throws(
      () => assertSupervisorStartupIntegrity({ cwd: directory }),
      /main workspace contains uncommitted development changes/i,
    );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("dev:raw delegates to the service supervisor instead of raw concurrently", () => {
  const script = packageJson.scripts?.["dev:raw"] ?? "";
  assert.match(script, /node scripts[\\/]dev-service-supervisor\.cjs/);
  assert.doesNotMatch(script, /concurrently/);
});

test("service supervisor restarts children independently and stops the group after persistent failure", async () => {
  const starts = new Map();
  const flakyCode = [
    "const attempt = Number(process.env.AI_NOVEL_SERVICE_RESTART_COUNT || 0);",
    "if (attempt < 2) process.exit(1);",
    "setTimeout(() => {}, 10000);",
  ].join(" ");
  const persistentCode = "process.exit(1);";

  const result = await runServiceGroup({
    maxRestarts: 2,
    restartDelayMs: 5,
    onServiceStart: ({ name }) => starts.set(name, (starts.get(name) ?? 0) + 1),
    services: [
      { name: "flaky", command: [process.execPath, "-e", flakyCode] },
      { name: "persistent", command: [process.execPath, "-e", persistentCode] },
    ],
  });

  assert.equal(result.exitCode, 1);
  assert.match(result.reason, /persistent/i);
  assert.equal(starts.get("flaky"), 3);
  assert.equal(starts.get("persistent"), 3);
});

test("service supervisor treats an unexpected clean child exit as a group failure", async () => {
  const result = await runServiceGroup({
    maxRestarts: 0,
    services: [{ name: "unexpected", command: [process.execPath, "-e", "process.exit(0);"] }],
  });

  assert.equal(result.exitCode, 1);
  assert.match(result.reason, /unexpected.*exit/i);
});
