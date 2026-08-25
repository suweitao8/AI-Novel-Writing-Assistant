const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const read = (relativePath) => fs.readFileSync(path.resolve(__dirname, "..", "src", relativePath), "utf8");

test("资产归属明确的路由使用 artifact-first resolver", () => {
  const routes = read("modules/novel/story-settings/http/storySettingsRoutes.ts");
  assert.match(routes, /resolveStateImagePath\(id, kind, assetId, stateId\)/);
  assert.match(routes, /该状态还没有生成图片/);
  assert.match(routes, /Cache-Control.*max-age=0, must-revalidate/);
  assert.match(routes, /artifactId:\s*z\.string\(\)/);
});

test("artifact 指针缺失时兼容读取带资产归属的旧状态图文件", () => {
  const service = read("modules/novel/story-settings/application/StoryAssetStateImageService.ts");
  assert.match(service, /stateImageDir\(novelId, kind, assetId, stateId\)/);
  assert.match(service, /resolveImageFile\(stateImageDir\(novelId, kind, assetId, stateId\)\)/);
});

test("旧的仅 stateId 图片 URL 不再返回共享 legacy 文件", () => {
  const routes = read("modules/novel/story-settings/http/storySettingsRoutes.ts");
  const start = routes.indexOf("/:id/settings/state-images/:stateId");
  assert.ok(start >= 0);
  const legacyRoute = routes.slice(start, start + 2200);
  assert.match(legacyRoute, /410|迁移|legacy|不可用/i);
  assert.doesNotMatch(legacyRoute, /createReadStream\(resolved\.filePath\)/);
});
