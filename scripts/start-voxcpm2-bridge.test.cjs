const test = require("node:test");
const assert = require("node:assert/strict");

const {
  isCanonicalBridgeHealth,
  parseArgs,
} = require("./start-voxcpm2-bridge.cjs");

test("启动参数默认使用项目约定的 18761 音频桥", () => {
  const args = parseArgs(["node", "start-voxcpm2-bridge.cjs"], {});
  assert.equal(args.port, 18761);
  assert.equal(args.root, "D:\\Github\\VoxCPM");
});

test("只把正式 VoxCPM2 健康响应视为可用", () => {
  assert.equal(isCanonicalBridgeHealth({ ready: true, worker_ready: true }), false);
  assert.equal(isCanonicalBridgeHealth({ status: "ok", model_loaded: true }), true);
  assert.equal(isCanonicalBridgeHealth({ status: "ok", model_loaded: false }), false);
});
