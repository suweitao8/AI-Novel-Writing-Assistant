const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const { runServiceGroup } = require("./dev-service-supervisor.cjs");

const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8"));

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
