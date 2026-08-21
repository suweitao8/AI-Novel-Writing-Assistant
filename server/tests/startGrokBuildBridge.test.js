const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildBridgeLaunches,
  parseArgs,
  resolveLogsDir,
} = require("../../scripts/start-grok-build-bridge.cjs");

test("Grok Build starter defaults to the two local subscription bridge ports", () => {
  const args = parseArgs(["node", "start-grok-build-bridge.cjs"]);
  assert.equal(args.textPort, 18764);
  assert.equal(args.imagePort, 18767);
  assert.equal(args.textModel, "grok-cli/grok-4.6");
  assert.equal(args.imageModel, "grok-build-image");
  assert.equal(args.timeoutSeconds, 600);
});

test("Grok Build starter passes one CLI path and separate models to both bridges", () => {
  const args = parseArgs([
    "node",
    "start-grok-build-bridge.cjs",
    "--text-port",
    "19064",
    "--image-port",
    "19067",
    "--text-model",
    "grok-cli/custom",
    "--image-model",
    "grok-build-custom",
    "--timeout-seconds",
    "42",
    "--cli-path",
    "C:\\Users\\su\\.grok\\bin\\grok.exe",
  ]);
  const launches = buildBridgeLaunches(args);
  assert.deepEqual(launches.map((item) => item.port), [19064, 19067]);
  assert.deepEqual(launches.map((item) => item.model), ["grok-cli/custom", "grok-build-custom"]);
  for (const launch of launches) {
    assert.ok(launch.args.includes("--cli-path"));
    assert.ok(launch.args.includes("C:\\Users\\su\\.grok\\bin\\grok.exe"));
    assert.ok(launch.args.includes("--timeout-seconds"));
    assert.ok(launch.args.includes("42"));
  }
});

test("Grok Build starter keeps logs outside the repository by default", () => {
  const logsDir = resolveLogsDir({ LOCALAPPDATA: "C:\\Users\\su\\AppData\\Local" });
  assert.equal(logsDir, "C:\\Users\\su\\AppData\\Local\\AINovel\\grok-build-bridge\\logs");
});
