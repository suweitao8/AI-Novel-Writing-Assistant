const test = require("node:test");
const assert = require("node:assert/strict");

const {
  resolveAssetImageProvider,
  resolveImageProviderForReferences,
} = require("../dist/services/image/assetProviderRouting.js");
const { getImageModelProvider } = require("../dist/llm/modelCategories.js");
const {
  buildImageGenerationRequestBody,
  generateImagesByProvider,
} = require("../dist/services/image/provider.js");
const { getImageModelOptions } = require("../dist/services/settings/ProviderImageSettingsService.js");

test("all asset image kinds route to the Codex subscription channel", () => {
  // 角色/道具参考图要透明底、场景全景要 2:1 等距柱状比例，统一由 Codex 承载。
  assert.equal(resolveAssetImageProvider({ kind: "character", hasReference: false }), "codex");
  assert.equal(resolveAssetImageProvider({ kind: "character", hasReference: true }), "codex");
  assert.equal(resolveAssetImageProvider({ kind: "prop", hasReference: false }), "codex");
  assert.equal(resolveAssetImageProvider({ kind: "prop", hasReference: true }), "codex");
  assert.equal(resolveAssetImageProvider({ kind: "scene", hasReference: false }), "codex");
  assert.equal(resolveAssetImageProvider({ kind: "scene", hasReference: true }), "codex");
});

test("Codex request body carries transparent background and png output format", () => {
  const body = buildImageGenerationRequestBody({
    sceneType: "character",
    provider: "codex",
    model: "gpt-5.6-luna",
    prompt: "transparent character board",
    size: "1536x864",
    count: 1,
    background: "transparent",
    outputFormat: "png",
  });
  assert.equal(body.background, "transparent");
  assert.equal(body.output_format, "png");
});

test("explicit providers are honored while the default falls back to Codex", () => {
  assert.equal(resolveImageProviderForReferences(false), "codex");
  assert.equal(resolveImageProviderForReferences(true), "codex");
  assert.equal(resolveImageProviderForReferences(false, "openai"), "openai");
  assert.equal(getImageModelProvider(), "codex");
});

test("Codex image settings expose the luna-driven image model option", () => {
  assert.deepEqual(getImageModelOptions("codex"), ["gpt-5.6-luna"]);
});

test("image generation requests use the local bridge bearer by default", async () => {
  const originalFetch = global.fetch;
  let request;
  global.fetch = async (url, options) => {
    request = { url, options };
    return {
      ok: true,
      json: async () => ({ data: [{ b64_json: "AAAA" }] }),
    };
  };
  try {
    await generateImagesByProvider({
      sceneType: "character",
      provider: "codex",
      model: "gpt-5.6-luna",
      prompt: "a base character reference",
      size: "1536x864",
      count: 1,
    });
    assert.equal(request.url, "http://127.0.0.1:18766/v1/images/generations");
    assert.equal(request.options.headers.Authorization, "Bearer codex-bridge-local");
  } finally {
    global.fetch = originalFetch;
  }
});
