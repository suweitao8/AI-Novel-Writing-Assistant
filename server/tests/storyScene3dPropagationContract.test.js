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
const markerService = read("src/modules/novel/story-settings/application/StoryScene3dMarkerService.ts");
const environmentService = read("src/modules/novel/story-settings/application/StoryScene3dEnvironmentAnalysisService.ts");
const settingsRoutes = read("src/modules/novel/story-settings/http/storySettingsRoutes.ts");

test("场景资产持久化 HDRI 参数，并由分镜上下文统一读取", () => {
  assert.match(schema, /scene3dEnvironmentJson String\?/);
  assert.match(service, /scene3dEnvironmentJson: serializeStoryScene3dEnvironment/);
  assert.match(service, /resolveStoryScene3dEnvironment\(/);
  assert.match(projection, /resolveStoryScene3dEnvironment\(/);
  assert.match(bundlePersistence, /getDefaultStoryScene3dEnvironment\(/);
  assert.match(markerService, /resolveStoryScene3dEnvironment\(/);
  assert.match(blockingService, /resolveStoryScene3dEnvironment\(/);
  assert.match(blockingService, /scene3dEnvironmentJson: true/);
  assert.match(blockingService, /const environment = resolveStoryScene3dEnvironment\(/);
  assert.match(blockingService, /environment: matchedScene\.environment/);
  assert.match(environmentService, /sceneState3dEnvironmentPrompt/);
  assert.match(environmentService, /scene3dEnvironmentJson/);
  assert.match(settingsRoutes, /states\/:stateId\/3d-environment\/analyze/);
});

test("场景投影默认值与类型无关，手动环境继续保留", () => {
  const {
    getDefaultStoryScene3dEnvironment,
    resolveStoryScene3dEnvironment,
    serializeStoryScene3dEnvironment,
  } = require("../../shared/dist/utils/scene3dEnvironment.js");
  const fallback = getDefaultStoryScene3dEnvironment();
  assert.deepEqual(
    resolveStoryScene3dEnvironment("interior", null),
    { ...fallback, customized: false },
  );
  const custom = serializeStoryScene3dEnvironment(
    { projectionCenterHeightRatio: 0.075, domeRadius: 20, panoramaHorizonV: 0.52 },
    { customized: true },
  );
  assert.equal(resolveStoryScene3dEnvironment("nature", custom).radiusMeters, 10);
  assert.equal(resolveStoryScene3dEnvironment("nature", custom).projectionCenterHeightRatio, 0.15);
  assert.equal(resolveStoryScene3dEnvironment("nature", custom).customized, true);
});

test("场景级 3D 环境始终使用默认状态类型，分析其他状态不改变环境参数", () => {
  const environmentBlock = markerService.match(
    /const environment = resolveStoryScene3dEnvironment\([\s\S]*?\n    \);/,
  );
  assert.ok(environmentBlock, "空间标记分析必须解析场景级 3D 环境");
  assert.match(environmentBlock[0], /initialBaseStates\[0\]\?\.sceneType/);
  assert.doesNotMatch(environmentBlock[0], /initialState\.sceneType/);
});

test("分镜保存布局时不把场景级 HDRI 参数复制成镜头覆盖", () => {
  const page = read("../client/src/pages/drama/comicDrama/DramaBlocking3DPage.tsx");
  assert.match(page, /context\.scene\.environment/);
  assert.match(page, /environment: context\.scene\.environment/);
  assert.match(page, /environment: _shotEnvironment/);
});
