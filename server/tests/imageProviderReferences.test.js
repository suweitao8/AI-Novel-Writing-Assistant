const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const { generateImagesByProvider } = require("../dist/services/image/provider.js");

const PNG_DATA_URL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
const PNG_BYTES = Buffer.from(PNG_DATA_URL.split(",", 2)[1], "base64");

test("Codex reference generation downloads and uploads every ordered reference image", async () => {
  const originalFetch = global.fetch;
  const requests = [];
  global.fetch = async (url, options) => {
    if (String(url).startsWith("https://assets.test/")) {
      return new Response(PNG_BYTES, { status: 200, headers: { "content-type": "image/png" } });
    }
    requests.push({ url, options });
    return { ok: true, json: async () => ({ data: [{ b64_json: "AAAA" }] }) };
  };
  try {
    await generateImagesByProvider({
      sceneType: "chapter_illustration",
      provider: "codex",
      model: "gpt-image-2",
      prompt: "分镜首帧",
      size: "1536x864",
      count: 1,
      refImages: [
        "https://assets.test/yechen.png",
        "https://assets.test/yezhu.png",
        "https://assets.test/bedroom.png",
      ],
      referenceImages: [
        { kind: "asset", label: "叶晨 · 默认状态图" },
        { kind: "asset", label: "叶竹 · 默认状态图" },
        { kind: "scene", label: "叶晨大学出租屋 · 默认状态图" },
      ],
    });
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, "http://127.0.0.1:18766/v1/images/edits");
    assert.equal(requests[0].options.body.getAll("image").length, 3);
    assert.deepEqual(
      JSON.parse(requests[0].options.body.get("reference_labels")),
      ["叶晨 · 默认状态图", "叶竹 · 默认状态图", "叶晨大学出租屋 · 默认状态图"],
    );
  } finally {
    global.fetch = originalFetch;
  }
});

test("reference preparation failure aborts before a prompt-only request", async () => {
  const originalFetch = global.fetch;
  let called = false;
  global.fetch = async () => {
    called = true;
    return { ok: true, json: async () => ({ data: [{ b64_json: "AAAA" }] }) };
  };
  try {
    await assert.rejects(
      generateImagesByProvider({
        sceneType: "chapter_illustration",
        provider: "codex",
        model: "gpt-image-2",
        prompt: "分镜首帧",
        size: "1536x864",
        count: 1,
        refImagePaths: [path.join(os.tmpdir(), "ai-novel-missing-reference.png")],
      }),
      /参考图|reference/i,
    );
    assert.equal(called, false);
  } finally {
    global.fetch = originalFetch;
  }
});

test("local reference paths are uploaded as every image part", async () => {
  const originalFetch = global.fetch;
  const requests = [];
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-novel-reference-test-"));
  const paths = await Promise.all([1, 2, 3].map(async (index) => {
    const filePath = path.join(tempDir, `reference-${index}.png`);
    await fs.writeFile(filePath, Buffer.from("reference-image"));
    return filePath;
  }));
  global.fetch = async (url, options) => {
    requests.push({ url, options });
    return { ok: true, json: async () => ({ data: [{ b64_json: "AAAA" }] }) };
  };
  try {
    await generateImagesByProvider({
      sceneType: "chapter_illustration",
      provider: "codex",
      model: "gpt-image-2",
      prompt: "分镜首帧",
      size: "1536x864",
      count: 1,
      refImagePaths: paths,
    });
    assert.equal(requests[0].options.body.getAll("image").length, 3);
  } finally {
    global.fetch = originalFetch;
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("an explicitly unsupported provider rejects reference images", async () => {
  await assert.rejects(
    generateImagesByProvider({
      sceneType: "chapter_illustration",
      provider: "grok",
      model: "grok-image-1",
      prompt: "分镜首帧",
      size: "1536x864",
      count: 1,
      refImages: [PNG_DATA_URL],
    }),
    /不支持参考图|reference/i,
  );
});

test("reference labels must describe the same ordered attachment list", async () => {
  await assert.rejects(
    generateImagesByProvider({
      sceneType: "chapter_illustration",
      provider: "codex",
      model: "gpt-image-2",
      prompt: "分镜首帧",
      size: "1536x864",
      count: 1,
      refImages: [PNG_DATA_URL, PNG_DATA_URL],
      referenceImages: [{ kind: "scene", label: "场景" }],
    }),
    /标签数量.*附件数量/,
  );
});
