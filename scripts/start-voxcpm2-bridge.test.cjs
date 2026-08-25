const assert = require("node:assert/strict");
const test = require("node:test");
const {
  DEFAULT_PORT,
  DEFAULT_ROOT,
  isCanonicalBridgeHealth,
  isHttpReady,
  parseArgs,
  resolvePaths,
} = require("./start-voxcpm2-bridge.cjs");

test("VoxCPM2 bridge launcher uses the supplied root and port", () => {
  const args = parseArgs(["node", "start-voxcpm2-bridge.cjs", "--root", "D:\\Tools\\vox", "--port", "19001"]);
  assert.equal(args.root, "D:\\Tools\\vox");
  assert.equal(args.port, 19001);
  const paths = resolvePaths(args);
  assert.equal(paths.python, "D:\\Tools\\vox\\.venv\\Scripts\\python.exe");
  assert.equal(paths.script, "D:\\Tools\\vox\\openai_speech_server.py");
});

test("only the canonical VoxCPM2 health response is considered loaded", () => {
  assert.equal(isCanonicalBridgeHealth({ ready: true, worker_ready: true }), false);
  assert.equal(isCanonicalBridgeHealth({ status: "ok", model_loaded: true }), true);
  assert.equal(isCanonicalBridgeHealth({ status: "ok", model_loaded: false }), false);
});

test("VoxCPM2 readiness requires health and the voxcpm2 model listing", async () => {
  assert.equal(DEFAULT_PORT, 18761);
  assert.equal(DEFAULT_ROOT, "D:\\Github\\VoxCPM");
  const calls = [];
  const ready = await isHttpReady("http://127.0.0.1:18761/health", async (url) => {
    calls.push(url);
    return {
      ok: true,
      async json() {
        return url.endsWith("/health")
          ? { status: "ok", model_loaded: true }
          : { data: [{ id: "voxcpm2" }] };
      },
    };
  });
  assert.equal(ready, true);
  assert.deepEqual(calls, [
    "http://127.0.0.1:18761/health",
    "http://127.0.0.1:18761/v1/models",
  ]);
});
