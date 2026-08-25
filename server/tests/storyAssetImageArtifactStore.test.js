const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const {
  StoryAssetImageArtifactStore,
  buildStoryAssetImageArtifactStorageKey,
  isStoryAssetImageArtifactStorageKeyForTarget,
} = require("../dist/modules/novel/story-settings/application/StoryAssetImageArtifactStore.js");

async function withTempRoot(fn) {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "story-asset-artifact-"));
  try {
    return await fn(rootDir);
  } finally {
    await fs.rm(rootDir, { recursive: true, force: true });
  }
}

const pngBytes = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
]);

test("generates different storage keys and generation directories for assets sharing the initial state", async () => {
  await withTempRoot(async (rootDir) => {
    const store = new StoryAssetImageArtifactStore({ rootDir });
    const first = store.buildLocation({
      novelId: "novel-1",
      kind: "character",
      assetId: "asset-a",
      stateId: "initial",
      generationId: "gen-a",
      extension: "png",
    });
    const second = store.buildLocation({
      novelId: "novel-1",
      kind: "character",
      assetId: "asset-b",
      stateId: "initial",
      generationId: "gen-b",
      extension: "png",
    });

    assert.notEqual(first.storageKey, second.storageKey);
    assert.notEqual(first.finalPath, second.finalPath);
    assert.match(first.storageKey, /id-novel-1\/character\/id-asset-a\/id-initial\/generations\/id-gen-a\/image\.png$/);
    assert.match(second.storageKey, /id-novel-1\/character\/id-asset-b\/id-initial\/generations\/id-gen-b\/image\.png$/);
    assert.ok(first.finalPath.startsWith(rootDir));
    assert.ok(second.finalPath.startsWith(rootDir));
  });
});

test("只接受与完整资产归属完全匹配的 committed storageKey", () => {
  const target = {
    novelId: "novel-1",
    kind: "character",
    assetId: "asset-a",
    stateId: "initial",
    generationId: "gen-a",
    extension: "png",
  };
  const validKey = buildStoryAssetImageArtifactStorageKey(target);

  assert.equal(isStoryAssetImageArtifactStorageKeyForTarget(validKey, target), true);
  assert.equal(
    isStoryAssetImageArtifactStorageKeyForTarget(
      buildStoryAssetImageArtifactStorageKey({ ...target, assetId: "asset-b" }),
      target,
    ),
    false,
  );
  assert.equal(
    isStoryAssetImageArtifactStorageKeyForTarget("story-state-images/initial/image.png", target),
    false,
  );
  assert.equal(
    isStoryAssetImageArtifactStorageKeyForTarget("../story-state-images/id-novel-1/character/id-asset-a/id-initial/image.png", target),
    false,
  );
});

test("writes artifacts through an exclusive .part file and verifies metadata without overwriting older generations", async () => {
  await withTempRoot(async (rootDir) => {
    const store = new StoryAssetImageArtifactStore({ rootDir });
    const target = {
      novelId: "novel-1",
      kind: "scene",
      assetId: "scene-1",
      stateId: "initial",
      generationId: "gen-1",
      extension: "png",
      mimeType: "image/png",
    };
    const expectedSha = crypto.createHash("sha256").update(pngBytes).digest("hex");

    const artifact = await store.writeArtifactBytes({ ...target, bytes: pngBytes });
    const finalBytes = await fs.readFile(artifact.finalPath);
    const tempExists = await fs.access(artifact.tempPath).then(() => true, () => false);

    assert.equal(Buffer.compare(finalBytes, pngBytes), 0);
    assert.equal(tempExists, false);
    assert.equal(artifact.sha256, expectedSha);
    assert.equal(artifact.byteSize, pngBytes.length);
    assert.equal(artifact.mimeType, "image/png");
    assert.equal(artifact.extension, "png");

    const verified = await store.verifyCurrentArtifact(artifact);
    assert.deepEqual(verified, {
      exists: true,
      valid: true,
      storageKey: artifact.storageKey,
      finalPath: artifact.finalPath,
      sha256: expectedSha,
      byteSize: pngBytes.length,
      mimeType: "image/png",
      extension: "png",
    });

    const next = await store.writeArtifactBytes({
      ...target,
      generationId: "gen-2",
      bytes: Buffer.from([...pngBytes, 0x01]),
    });

    assert.notEqual(next.storageKey, artifact.storageKey);
    assert.equal(await fs.readFile(artifact.finalPath, "hex"), pngBytes.toString("hex"));
  });
});

test("does not expose an interrupted .part write as a readable final artifact", async () => {
  await withTempRoot(async (rootDir) => {
    const store = new StoryAssetImageArtifactStore({ rootDir });
    const location = store.buildLocation({
      novelId: "novel-1",
      kind: "prop",
      assetId: "prop-1",
      stateId: "initial",
      generationId: "gen-1",
      extension: "png",
    });

    await store.writePartFile(location, pngBytes);
    const verified = await store.verifyCurrentArtifact({
      storageKey: location.storageKey,
      finalPath: location.finalPath,
      sha256: crypto.createHash("sha256").update(pngBytes).digest("hex"),
      byteSize: pngBytes.length,
      mimeType: "image/png",
      extension: "png",
    });

    assert.equal(await fs.access(location.tempPath).then(() => true, () => false), true);
    assert.equal(await fs.access(location.finalPath).then(() => true, () => false), false);
    assert.deepEqual(verified, {
      exists: false,
      valid: false,
      storageKey: location.storageKey,
      finalPath: location.finalPath,
      reason: "missing",
    });
  });
});

test("refuses to reuse an existing .part file for the same generation", async () => {
  await withTempRoot(async (rootDir) => {
    const store = new StoryAssetImageArtifactStore({ rootDir });
    const location = store.buildLocation({
      novelId: "novel-1",
      kind: "prop",
      assetId: "prop-1",
      stateId: "initial",
      generationId: "gen-1",
      extension: "png",
    });

    await store.writePartFile(location, pngBytes);
    await assert.rejects(
      () => store.writePartFile(location, pngBytes),
      { code: "EEXIST" },
    );
  });
});

test("rejects mismatched MIME and extension before creating a final artifact", async () => {
  await withTempRoot(async (rootDir) => {
    const store = new StoryAssetImageArtifactStore({ rootDir });
    await assert.rejects(
      () => store.writeArtifactBytes({
        novelId: "novel-1",
        kind: "character",
        assetId: "asset-a",
        stateId: "initial",
        generationId: "gen-1",
        extension: "jpg",
        mimeType: "image/png",
        bytes: pngBytes,
      }),
      /MIME image\/png does not match extension jpg/,
    );

    const storageKey = buildStoryAssetImageArtifactStorageKey({
      novelId: "novel-1",
      kind: "character",
      assetId: "asset-a",
      stateId: "initial",
      generationId: "gen-1",
      extension: "jpg",
    });
    const finalPath = path.join(rootDir, storageKey);
    assert.equal(await fs.access(finalPath).then(() => true, () => false), false);
  });
});
