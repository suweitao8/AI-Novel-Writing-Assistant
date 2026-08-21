const test = require("node:test");
const assert = require("node:assert/strict");

const { resolveAssetImageProvider } = require("../dist/services/image/assetProviderRouting.js");
const { buildImageGenerationRequestBody } = require("../dist/services/image/provider.js");
const { getImageModelOptions } = require("../dist/services/settings/ProviderImageSettingsService.js");

test("base character, scene and prop assets use Grok Build without references", () => {
  assert.equal(resolveAssetImageProvider({ kind: "character", hasReference: false }), "grok_build");
  assert.equal(resolveAssetImageProvider({ kind: "scene", hasReference: false }), "grok_build");
  assert.equal(resolveAssetImageProvider({ kind: "prop", hasReference: false }), "grok_build");
});

test("reference-backed asset generation stays on the global image provider", () => {
  assert.equal(resolveAssetImageProvider({ kind: "character", hasReference: true }), "codex");
  assert.equal(resolveAssetImageProvider({ kind: "scene", hasReference: true }), "codex");
  assert.equal(resolveAssetImageProvider({ kind: "prop", hasReference: true }), "codex");
});

test("Grok Build image settings expose the fixed local image model", () => {
  assert.deepEqual(getImageModelOptions("grok_build"), ["grok-build-image"]);
});

test("Grok Build request body stays within its prompt-only image contract", () => {
  const body = buildImageGenerationRequestBody({
    sceneType: "character",
    provider: "grok_build",
    model: "grok-build-image",
    prompt: "cinematic character reference",
    size: "1536x1024",
    count: 1,
    quality: "high",
    refImages: [],
  });
  assert.deepEqual(body, {
    model: "grok-build-image",
    prompt: "cinematic character reference",
    n: 1,
    response_format: "b64_json",
  });
});
