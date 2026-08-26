const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const read = (relativePath) => fs.readFileSync(path.resolve(__dirname, "../src", relativePath), "utf8");

test("正式角色、道具和场景资产入口不接受页面尺寸覆盖", () => {
  const characterService = read("services/comic/ComicCharacterImageService.ts");
  const assetService = read("services/comic/ComicCharacterAssetService.ts");
  const sceneService = read("services/comic/ComicSceneService.ts");
  const dramaCharacterService = read("services/drama/DramaCharacterImageService.ts");
  const storyAssetService = read("modules/novel/story-settings/application/StoryAssetImageService.ts");

  assert.match(characterService, /size: IMAGE_SPECS\.characterSheet/);
  assert.doesNotMatch(characterService, /size: overrides\?\.sizeOverride \?\? ctx\.size/);
  assert.match(assetService, /size: IMAGE_SPECS\.characterAsset/);
  assert.doesNotMatch(assetService, /size: overrides\?\.sizeOverride \?\? ctx\.size/);
  assert.match(sceneService, /size: IMAGE_SPECS\.scenePanorama/);
  assert.doesNotMatch(sceneService, /size: overrides\?\.sizeOverride \?\? ctx\.size/);
  // 2026-08-26：场景入口改走 scenePanoramaLayoutLinesFor(sceneType)，室内场景自动追加强化行。
  assert.match(sceneService, /scenePanoramaLayoutLinesFor\(sceneType\)/);
  assert.match(sceneService, /SCENE_PANORAMA_LAYOUT_NEGATIVE_PROMPT/);
  assert.match(dramaCharacterService, /size: IMAGE_SPECS\.characterSheet/);
  assert.doesNotMatch(dramaCharacterService, /size: overrides\?\.sizeOverride \?\? ctx\.size/);
  assert.match(storyAssetService, /size: IMAGE_SPECS\.scenePanorama/);
  assert.doesNotMatch(storyAssetService, /provider: provider \?\? resolveAssetImageProvider\(\{ kind: "scene"/);
});
