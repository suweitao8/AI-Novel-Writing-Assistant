"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const net = require("node:net");

const {
  MAIN_LANE_API_PORT,
  MAIN_LANE_CLIENT_PORT,
  WORKTREE_API_PORT_BASE,
  WORKTREE_CLIENT_PORT_BASE,
  applyLanePortsToEnvFile,
  hashCheckoutPath,
  isPortLikelyFree,
  lanePortsForWorktree,
  readLanePortsFromEnvFile,
  resolveDevLane,
} = require("./dev-ports.cjs");

function makeTempCheckout({ asWorktree }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "dev-lane-"));
  if (asWorktree) {
    fs.writeFileSync(path.join(root, ".git"), "gitdir: ../ somewhere/main/.git/worktrees/demo\n");
  } else {
    fs.mkdirSync(path.join(root, ".git"));
  }
  return root;
}

test("main workspace checkout keeps the fixed user-facing lane", () => {
  const mainCheckout = makeTempCheckout({ asWorktree: false });
  const lane = resolveDevLane(mainCheckout);
  assert.equal(lane.isMainLane, true);
  assert.equal(lane.apiPort, MAIN_LANE_API_PORT);
  assert.equal(lane.clientPort, MAIN_LANE_CLIENT_PORT);
  assert.equal(lane.apiPort, 3100);
  assert.equal(lane.clientPort, 5174);
});

test("worktree checkout resolves a deterministic in-range lane", () => {
  const worktree = makeTempCheckout({ asWorktree: true });
  const first = resolveDevLane(worktree);
  const second = resolveDevLane(worktree);
  assert.equal(first.isMainLane, false);
  assert.equal(first.apiPort, second.apiPort);
  assert.equal(first.clientPort, second.clientPort);
  assert.ok(first.apiPort >= WORKTREE_API_PORT_BASE && first.apiPort < WORKTREE_API_PORT_BASE + 99);
  assert.ok(first.clientPort >= WORKTREE_CLIENT_PORT_BASE && first.clientPort < WORKTREE_CLIENT_PORT_BASE + 200);
});

test("lane ports derive purely from the checkout path", () => {
  const sample = "D:/Github/repo-some-task";
  const hash = hashCheckoutPath(sample);
  const ports = lanePortsForWorktree(sample);
  assert.equal(ports.apiPort, WORKTREE_API_PORT_BASE + (hash % 99));
  assert.equal(ports.clientPort, WORKTREE_CLIENT_PORT_BASE + (hash % 200));
});

test("env application replaces active PORT and appends CLIENT_PORT idempotently", () => {
  const envPath = path.join(os.tmpdir(), `dev-lane-env-${Date.now()}.env`);
  fs.writeFileSync(envPath, "# DATABASE_URL=postgresql://postgres@127.0.0.1:5432/ai_novel\nPORT=3100\n# PORT=3200\n", "utf8");
  applyLanePortsToEnvFile(envPath, { apiPort: 3142, clientPort: 5233 });
  const afterFirst = fs.readFileSync(envPath, "utf8");
  assert.match(afterFirst, /^PORT=3142$/m);
  assert.match(afterFirst, /^CLIENT_PORT=5233$/m);
  assert.match(afterFirst, /^# PORT=3200$/m);
  applyLanePortsToEnvFile(envPath, { apiPort: 3142, clientPort: 5233 });
  const afterSecond = fs.readFileSync(envPath, "utf8");
  assert.equal(afterSecond.split(/^CLIENT_PORT=/m).length, 2);
  const ports = readLanePortsFromEnvFile(envPath);
  assert.deepEqual(ports, { apiPort: 3142, clientPort: 5233 });
  fs.rmSync(envPath, { force: true });
});

test("readLanePortsFromEnvFile returns null for missing or incomplete env", () => {
  assert.equal(readLanePortsFromEnvFile(path.join(os.tmpdir(), "definitely-missing.env")), null);
  const envPath = path.join(os.tmpdir(), `dev-lane-env-partial-${Date.now()}.env`);
  fs.writeFileSync(envPath, "PORT=3199\n", "utf8");
  assert.equal(readLanePortsFromEnvFile(envPath), null);
  fs.rmSync(envPath, { force: true });
});

test("port probe distinguishes a listening port from a free one", () => {
  const server = net.createServer();
  const busyPort = new Promise((resolve) => {
    server.once("listening", () => resolve(server.address().port));
  });
  server.listen(0, "127.0.0.1");
  return busyPort.then((port) => {
    assert.equal(isPortLikelyFree(port), false);
    assert.equal(isPortLikelyFree(port + 1), true);
    server.close();
  });
});
