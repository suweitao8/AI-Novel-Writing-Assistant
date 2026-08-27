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
    assert.equal(url, "http://127.0.0.1:18766/v1/images/generations");
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
      provider: "codex",
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

test("character runtime persists the same constrained prompt that it sends to the provider", async () => {
  const originalFetch = global.fetch;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-novel-character-runtime-"));
  let savedState;
  let requestBody;
  global.fetch = async (_url, init) => {
    requestBody = JSON.parse(String(init?.body));
    return {
      ok: true,
      json: async () => ({ data: [{ b64_json: "AAAA" }] }),
    };
  };

  try {
    await runImageGeneration({
      kind: "test.character-runtime",
      loadState: async () => ({ status: "idle" }),
      saveState: async (state) => {
        savedState = state;
      },
      diskPath: (extension) => path.join(tempDir, `image.${extension}`),
      publicUrl: () => "/test-character-image",
    }, {
      provider: "codex",
      sceneType: "character",
      prompt: "用户自定义角色提示词",
    });

    assert.match(savedState.prompt, /HUMAN CHARACTER ETHNICITY LOCK/);
    assert.equal(savedState.prompt, requestBody.prompt);
  } finally {
    global.fetch = originalFetch;
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("生成结果与参考图完全相同时不保存为 done", async () => {
  const originalFetch = global.fetch;
  const originalCodexApiKey = process.env.CODEX_API_KEY;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-novel-image-reference-passthrough-"));
  let savedState;
  process.env.CODEX_API_KEY = "test-codex-key";
  global.fetch = async (url) => {
    assert.match(String(url), /\/images\/edits$/);
    return {
      ok: true,
      json: async () => ({ data: [{ b64_json: "AAAA" }] }),
    };
  };

  try {
    await assert.rejects(
      () => runImageGeneration({
        kind: "test.image-reference-passthrough",
        loadState: async () => ({ status: "idle" }),
        saveState: async (state) => {
          savedState = state;
        },
        diskPath: (extension) => path.join(tempDir, `image.${extension}`),
        publicUrl: () => "/test-reference-passthrough-image",
      }, {
        provider: "codex",
        prompt: "test image",
        refImages: ["data:image/png;base64,AAAA"],
      }),
      /参考图完全相同/,
    );

    assert.equal(savedState.status, "error");
    assert.match(savedState.error, /参考图完全相同/);
    assert.equal(fs.readdirSync(tempDir).length, 0);
  } finally {
    global.fetch = originalFetch;
    if (originalCodexApiKey === undefined) delete process.env.CODEX_API_KEY;
    else process.env.CODEX_API_KEY = originalCodexApiKey;
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
