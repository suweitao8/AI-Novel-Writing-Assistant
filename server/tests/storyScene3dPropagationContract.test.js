const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const read = (relativePath) => fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
const schema = read("src/prisma/schema.sqlite.prisma");
const service = read("src/modules/novel/story-settings/application/StorySettingsService.ts");
const blockingService = read("src/services/drama/visual/DramaShotBlockingSketchService.ts");
const projection = read("src/modules/novel/story-settings/application/StorySettingsProjection.ts");
const bundlePersistence = read("src/modules/novel/story-settings/application/StorySettingsBundlePersistence.ts");

test("场景资产持久化 HDRI 参数，并由分镜上下文统一读取", () => {
  assert.match(schema, /scene3dEnvironmentJson String\?/);
  assert.match(service, /scene3dEnvironmentJson: serializeStoryScene3dEnvironment/);
  assert.match(service, /resolveStoryScene3dEnvironment\(/);
  assert.match(projection, /resolveStoryScene3dEnvironment\(/);
  assert.match(bundlePersistence, /getDefaultStoryScene3dEnvironment\(/);
  assert.match(blockingService, /scene3dEnvironmentJson: true/);
  assert.match(blockingService, /environment: parseStoryScene3dEnvironment\(scene\.scene3dEnvironmentJson\)/);
  assert.match(blockingService, /environment: matchedScene\.environment/);
});

test("分镜保存布局时不把场景级 HDRI 参数复制成镜头覆盖", () => {
  const page = read("../client/src/pages/drama/comicDrama/DramaBlocking3DPage.tsx");
  assert.match(page, /context\.scene\.environment/);
  assert.match(page, /environment: context\.scene\.environment/);
  assert.match(page, /environment: _shotEnvironment/);
});
