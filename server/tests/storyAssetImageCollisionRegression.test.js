const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const read = (relativePath) => fs.readFileSync(path.resolve(__dirname, "..", "src", relativePath), "utf8");

test("故事资产状态图生成使用持久目标锁和不可变制品", () => {
  const source = read("modules/novel/story-settings/application/StoryAssetStateImageService.ts");
  assert.match(source, /StoryAssetImageGenerationLock/);
  assert.match(source, /StoryAssetImageArtifactStore/);
  assert.match(source, /preserveReadableStoryAssetImagePointer\(state\.image, image\)/);
  assert.match(source, /beginArtifact/);
  assert.match(source, /artifactId/);
  assert.match(source, /artifactLeaseGuard|stagingArtifact/);
  assert.match(source, /buildStoryAssetImageTargetKey/);
  assert.match(source, /novelId[\s\S]*kind[\s\S]*assetId[\s\S]*stateId/);
  assert.match(source, /isStoryAssetImageArtifactStorageKeyForTarget/);
  assert.match(source, /resolveCommittedArtifactFile[\s\S]*catch/);
});

test("正常状态图解析不再按 stateId 猜测共享 legacy 文件", () => {
  const source = read("modules/novel/story-settings/application/StoryAssetStateImageService.ts");
  const resolverStart = source.indexOf("async resolveStateImagePath");
  const resolverEnd = source.indexOf("/** 兼容仍保存旧 URL", resolverStart);
  const resolver = source.slice(resolverStart, resolverEnd);
  assert.match(resolver, /artifactId/);
  assert.doesNotMatch(resolver, /legacyStateImageDir\(stateId\)/);
});

test("失败或生成中保留 URL 时，状态引用消费者继续使用最后可读图片", () => {
  const imageService = read("modules/novel/story-settings/application/StoryAssetStateImageService.ts");
  const keyframeService = read("services/drama/visual/DramaShotKeyframeService.ts");
  const blockingSketchService = read("services/drama/visual/DramaShotBlockingSketchService.ts");

  assert.match(imageService, /hasStoryAssetStateImageUrl\(ancestor\.image\)/);
  assert.match(keyframeService, /hasStoryAssetStateImageUrl\(activeState\?\.image\)/);
  assert.match(blockingSketchService, /hasStoryAssetStateImageUrl\(matchedSceneState\?\.image\)/);
  assert.doesNotMatch(keyframeService, /activeState\?\.image\?\.status === ["']done["']/);
  assert.doesNotMatch(blockingSketchService, /matchedScene\?\.state\.image\?\.status === ["']done["']/);
});

test("当前制品缺失时只从同一资产状态的 committed 历史和归属目录恢复", () => {
  const source = read("modules/novel/story-settings/application/StoryAssetStateImageService.ts");
  const resolverStart = source.indexOf("async resolveStateImagePath");
  const resolverEnd = source.indexOf("/** 兼容仍保存旧 URL", resolverStart);
  const resolver = source.slice(resolverStart, resolverEnd);

  assert.match(resolver, /findMany/);
  assert.match(resolver, /status:\s*["']committed["']/);
  assert.match(resolver, /prioritizeStoryAssetImageArtifacts/);
  assert.match(resolver, /stateImageDir\(novelId, kind, assetId, stateId\)/);
  assert.doesNotMatch(resolver, /legacyStateImageDir\(stateId\)/);
});
