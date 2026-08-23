const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const read = (relativePath) => fs.readFileSync(path.resolve(__dirname, "..", "src", relativePath), "utf8");

test("故事资产状态图生成使用持久目标锁和不可变制品", () => {
  const source = read("modules/novel/story-settings/application/StoryAssetStateImageService.ts");
  assert.match(source, /StoryAssetImageGenerationLock/);
  assert.match(source, /StoryAssetImageArtifactStore/);
  assert.match(source, /beginArtifact/);
  assert.match(source, /artifactId/);
  assert.match(source, /artifactLeaseGuard|stagingArtifact/);
  assert.match(source, /buildStoryAssetImageTargetKey/);
  assert.match(source, /novelId[\s\S]*kind[\s\S]*assetId[\s\S]*stateId/);
});

test("正常状态图解析不再按 stateId 猜测共享 legacy 文件", () => {
  const source = read("modules/novel/story-settings/application/StoryAssetStateImageService.ts");
  const resolverStart = source.indexOf("async resolveStateImagePath");
  const resolverEnd = source.indexOf("/** 兼容仍保存旧 URL", resolverStart);
  const resolver = source.slice(resolverStart, resolverEnd);
  assert.match(resolver, /artifactId/);
  assert.doesNotMatch(resolver, /legacyStateImageDir\(stateId\)/);
});
