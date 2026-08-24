const assert = require("node:assert/strict");
const test = require("node:test");
const {
  DEFAULT_PORT,
  DEFAULT_ROOT,
  isIndexTTS25Health,
  isHttpReady,
  parseArgs,
  resolvePaths,
} = require("./start-indextts25-api.cjs");

test("IndexTTS 2.5 API launcher uses the supplied root and port", () => {
  const args = parseArgs(["node", "start-indextts25-api.cjs", "--root", "D:\\Tools\\index", "--port", "9015"]);
  assert.equal(args.root, "D:\\Tools\\index");
  assert.equal(args.port, 9015);
  const paths = resolvePaths(args);
  assert.equal(paths.python, "D:\\Tools\\index\\.venv\\Scripts\\python.exe");
  assert.equal(paths.script, "D:\\Tools\\index\\app_api.py");
  assert.equal(paths.webuiLauncher, "D:\\Tools\\index\\启动.bat");
});

test("IndexTTS 2.5 health accepts lazy model loading", () => {
  assert.equal(isIndexTTS25Health({ status: "ok", model_loaded: false }), true);
  assert.equal(isIndexTTS25Health({ status: "error", model_loaded: true }), false);
  assert.equal(isIndexTTS25Health(null), false);
});

test("IndexTTS 2.5 readiness only requires the API health contract", async () => {
  assert.equal(DEFAULT_PORT, 9005);
  assert.equal(DEFAULT_ROOT, "D:\\Tools\\yzy-index-tts-2.5-260824");
  const calls = [];
  const ready = await isHttpReady("http://127.0.0.1:9005/health", async (url) => {
    calls.push(url);
    return {
      ok: true,
      async json() {
        return { status: "ok", model_loaded: false };
      },
    };
  });
  assert.equal(ready, true);
  assert.deepEqual(calls, ["http://127.0.0.1:9005/health"]);
});
