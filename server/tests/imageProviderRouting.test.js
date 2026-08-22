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

test("character and prop asset references stay on Codex for transparent output; scenes too for 2:1 panoramas", () => {
  // 2026-08-22：角色/道具参考图统一透明底，只有 Codex 通道稳定支持，不再按有无参考图分流。
  // 2026-08-23：场景全景要 2:1 等距柱状比例，grok_build 固定 1280x720 出不了，同样统一 Codex。
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
    model: "gpt-image-2",
    prompt: "transparent character board",
    size: "1536x1024",
    count: 1,
    background: "transparent",
    outputFormat: "png",
  });
  assert.equal(body.background, "transparent");
  assert.equal(body.output_format, "png");
});

test("reference-backed asset generation stays on the compatible image provider", () => {
  assert.equal(resolveAssetImageProvider({ kind: "character", hasReference: true }), "codex");
  assert.equal(resolveAssetImageProvider({ kind: "scene", hasReference: true }), "codex");
  assert.equal(resolveAssetImageProvider({ kind: "prop", hasReference: true }), "codex");
});

test("the image category defaults to Grok Build while references use the compatible fallback", () => {
  assert.equal(getImageModelProvider(), "grok_build");
  assert.equal(resolveImageProviderForReferences(false), "grok_build");
  assert.equal(resolveImageProviderForReferences(true), "codex");
  assert.equal(resolveImageProviderForReferences(false, "grok_build"), "grok_build");
  assert.equal(resolveImageProviderForReferences(true, "grok_build"), "codex");
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

test("Grok Build rejects reference images before building an edit request", () => {
  assert.throws(
    () => buildImageGenerationRequestBody({
      sceneType: "character",
      provider: "grok_build",
      model: "grok-build-image",
      prompt: "keep the same character",
      size: "1536x1024",
      count: 1,
      refImages: ["data:image/png;base64,AAAA"],
    }),
    /参考图/,
  );
});

test("Grok Build image requests use the local bearer by default", async () => {
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
      provider: "grok_build",
      model: "grok-build-image",
      prompt: "a base character reference",
      size: "1536x1024",
      count: 1,
    });
    assert.equal(request.url, "http://127.0.0.1:18767/v1/images/generations");
    assert.equal(request.options.headers.Authorization, "Bearer grok-bridge-local");
  } finally {
    global.fetch = originalFetch;
  }
});
