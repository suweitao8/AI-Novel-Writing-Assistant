const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const { runCompositeImageGeneration } = require("../dist/services/image/runtime/compositeRunner.js");

test("runs every character view before composing and persists one final done state", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-novel-composite-runtime-"));
  const calls = [];
  const saved = [];
  const outputPath = path.join(tempDir, "image.png");
  const adapter = {
    kind: "story.asset.state:test",
    loadState: async () => ({ status: "done", version: 2, url: "/old.png", provider: "grok_build" }),
    saveState: async (state) => saved.push(state),
    diskPath: () => outputPath,
    publicUrl: () => "/api/state-images/test",
    cleanupOtherExts: async () => {},
  };

  try {
    const result = await runCompositeImageGeneration(adapter, {
      provider: "grok_build",
      prompt: "四视图角色状态设计稿",
      viewRequests: [
        { id: "front_portrait", prompt: "头像" },
        { id: "front_full_body", prompt: "正面全身" },
        { id: "side_full_body", prompt: "侧面全身" },
        { id: "back_full_body", prompt: "背面全身" },
      ],
      generateView: async ({ id, viewPath, provider, model }) => {
        calls.push({ id, provider, model, viewPath });
        await fs.writeFile(viewPath, id);
      },
      compose: async (viewPaths, finalPath) => {
        assert.deepEqual(Object.keys(viewPaths), [
          "front_portrait",
          "front_full_body",
          "side_full_body",
          "back_full_body",
        ]);
        await fs.writeFile(finalPath, "sheet");
      },
    });

    assert.equal(calls.length, 4);
    assert.deepEqual(calls.map((item) => item.id), [
      "front_portrait",
      "front_full_body",
      "side_full_body",
      "back_full_body",
    ]);
    assert.equal(saved[0].status, "generating");
    assert.equal(saved[0].version, 3);
    assert.equal(saved.at(-1).status, "done");
    assert.equal(saved.at(-1).url, "/api/state-images/test");
    assert.equal(saved.at(-1).provider, "grok_build");
    assert.equal(result.status, "done");
    assert.equal(await fs.readFile(outputPath, "utf8"), "sheet");
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("routes reference-backed composite generation away from Grok Build", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-novel-composite-reference-"));
  const providers = [];
  const adapter = {
    kind: "story.asset.state:reference",
    loadState: async () => ({ status: "idle" }),
    saveState: async () => {},
    diskPath: () => path.join(tempDir, "image.png"),
    publicUrl: () => "/state/reference",
  };

  try {
    await runCompositeImageGeneration(adapter, {
      provider: "grok_build",
      prompt: "参考图四视图",
      referenceImages: [{ kind: "asset", label: "上一状态", url: "/state/previous" }],
      refImages: ["/state/previous"],
      viewRequests: [{ id: "front_portrait", prompt: "头像" }],
      generateView: async ({ provider, viewPath }) => {
        providers.push(provider);
        await fs.writeFile(viewPath, "view");
      },
      compose: async (_viewPaths, finalPath) => fs.writeFile(finalPath, "sheet"),
    });

    assert.deepEqual(providers, ["codex"]);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});
