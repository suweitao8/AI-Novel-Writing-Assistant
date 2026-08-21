const test = require("node:test");
const assert = require("node:assert/strict");
const sharp = require("sharp");

const {
  GROK_BUILD_ASPECT_RATIO,
  GROK_BUILD_IMAGE_HEIGHT,
  GROK_BUILD_IMAGE_WIDTH,
  buildGrokBuildPrompt,
  normalizeGrokBuildImage,
} = require("../../scripts/grok-build-image-core.cjs");
const { createGrokBuildImageBridgeServer } = require("../../scripts/grok-build-image-bridge.cjs");

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve(server.address().port);
    });
  });
}

function close(server) {
  return new Promise((resolve) => server.close(() => resolve()));
}

async function withBridge(options, run) {
  const server = createGrokBuildImageBridgeServer(options);
  const port = await listen(server);
  try {
    return await run(`http://127.0.0.1:${port}`);
  } finally {
    await close(server);
  }
}

test("Grok Build prompt forces one 16:9 image and disallows unrelated tools", () => {
  const prompt = buildGrokBuildPrompt("A character in a rainy alley");
  assert.match(prompt, /image_gen exactly once/);
  assert.match(prompt, new RegExp(`aspect_ratio: ${GROK_BUILD_ASPECT_RATIO}`));
  assert.match(prompt, /Do not use shell, code execution, file editing, web search/);
  assert.match(prompt, /A character in a rainy alley/);
});

test("Grok Build image normalization returns a fixed-size PNG", async () => {
  const source = await sharp({
    create: {
      width: 640,
      height: 360,
      channels: 3,
      background: { r: 10, g: 20, b: 30 },
    },
  }).jpeg().toBuffer();
  const output = await normalizeGrokBuildImage(source);
  const metadata = await sharp(output).metadata();
  assert.equal(metadata.format, "png");
  assert.equal(metadata.width, GROK_BUILD_IMAGE_WIDTH);
  assert.equal(metadata.height, GROK_BUILD_IMAGE_HEIGHT);
});

test("Grok Build image bridge requires its local bearer", async () => {
  await withBridge({
    apiKey: "test-image-token",
    generateImage: async () => Buffer.from("unused"),
  }, async (baseURL) => {
    const response = await fetch(`${baseURL}/v1/images/generations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "test" }),
    });
    assert.equal(response.status, 401);
  });
});

test("Grok Build image bridge returns normalized base64 images", async () => {
  const source = await sharp({
    create: {
      width: 320,
      height: 200,
      channels: 3,
      background: { r: 100, g: 120, b: 140 },
    },
  }).png().toBuffer();
  await withBridge({
    apiKey: "test-image-token",
    generateImage: async (input) => {
      assert.equal(input.model, "grok-build-image");
      assert.equal(input.prompt, "test prompt");
      return source;
    },
  }, async (baseURL) => {
    const response = await fetch(`${baseURL}/v1/images/generations`, {
      method: "POST",
      headers: {
        Authorization: "Bearer test-image-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: "grok-build-image", prompt: "test prompt", n: 1 }),
    });
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.data.length, 1);
    const decoded = Buffer.from(payload.data[0].b64_json, "base64");
    const metadata = await sharp(decoded).metadata();
    assert.equal(metadata.format, "png");
    assert.equal(metadata.width, 1280);
    assert.equal(metadata.height, 720);
  });
});

test("Grok Build image bridge rejects reference-image edits explicitly", async () => {
  await withBridge({
    apiKey: "test-image-token",
    generateImage: async () => Buffer.from("unused"),
  }, async (baseURL) => {
    const response = await fetch(`${baseURL}/v1/images/edits`, {
      method: "POST",
      headers: {
        Authorization: "Bearer test-image-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ prompt: "edit this reference" }),
    });
    assert.equal(response.status, 422);
    const payload = await response.json();
    assert.equal(payload.error.code, "reference_images_not_supported");
  });
});
