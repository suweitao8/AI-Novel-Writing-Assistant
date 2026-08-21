const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { runImageGeneration } = require("../dist/services/image/runtime/runner.js");

test("successful image generation clears a stale error from the persisted state", async () => {
  const originalFetch = global.fetch;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-novel-image-runtime-"));
  let savedState;
  global.fetch = async (url) => {
    assert.equal(url, "http://127.0.0.1:18767/v1/images/generations");
    return {
      ok: true,
      json: async () => ({ data: [{ b64_json: "AAAA" }] }),
    };
  };

  try {
    const result = await runImageGeneration({
      kind: "test.image-runtime",
      loadState: async () => ({ status: "error", error: "stale 404" }),
      saveState: async (state) => {
        savedState = state;
      },
      diskPath: (extension) => path.join(tempDir, `image.${extension}`),
      publicUrl: () => "/test-image",
    }, {
      provider: "grok_build",
      prompt: "test image",
    });

    assert.equal(result.status, "done");
    assert.equal(result.error, undefined);
    assert.equal(savedState.error, undefined);
  } finally {
    global.fetch = originalFetch;
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
