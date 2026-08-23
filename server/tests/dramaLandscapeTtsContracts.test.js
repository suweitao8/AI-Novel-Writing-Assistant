const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const read = (relativePath) => fs.readFileSync(path.resolve(__dirname, "..", "src", relativePath), "utf8");

test("漫剧分镜、视频提示词和合成产物统一为横屏", () => {
  const imageSpecs = read("services/image/imageSpecs.ts");
  const visualStyles = read("services/drama/visual/dramaVisualStyles.ts");
  const prompts = read("prompting/prompts/drama/drama.prompts.ts");
  const videoPromptService = read("services/drama/DramaVideoPromptService.ts");
  const keyframeService = read("services/drama/visual/DramaShotKeyframeService.ts");
  const assemblyService = read("services/drama/video/DramaEpisodeAssemblyService.ts");
  const localVideo = read("services/drama/video/LocalFfmpegVideoProvider.ts");
  const exportService = read("services/drama/DramaExportService.ts");

  assert.match(imageSpecs, /dramaKeyframe:\s*"1536x864"/);
  assert.match(visualStyles, /横屏影视化分镜首帧图/);
  assert.doesNotMatch(visualStyles, /竖屏 9:16 短剧首帧图/);
  assert.match(prompts, /dramaStoryboardPrompt[\s\S]*?version:\s*"v5"/);
  assert.match(prompts, /dramaVideoPromptOutputSchema[\s\S]*?default\("16:9"\)/);
  assert.match(prompts, /dramaVideoPromptPrompt[\s\S]*?version:\s*"v2"/);
  assert.match(videoPromptService, /aspectRatio:\s*"16:9"/);
  assert.match(keyframeService, /size: IMAGE_SPECS\.dramaKeyframe/);
  assert.doesNotMatch(keyframeService, /size: overrides\?\.sizeOverride \?\? ctx\.size/);
  assert.match(assemblyService, /DramaRemotionEpisodeAssembler/);
  assert.match(assemblyService, /getDramaRenderProfile/);
  assert.match(localVideo, /getDramaRenderProfile/);
  assert.match(exportService, /aspectRatio:\s*"16:9"/);
});

test("配音批量任务和单镜接口只使用系统音频模型槽位", () => {
  const orchestrator = read("services/drama/production/DramaBatchOrchestrator.ts");
  const routes = read("modules/drama/http/dramaRoutes.ts");

  assert.match(orchestrator, /getAudioModelProvider/);
  assert.match(orchestrator, /const DEFAULT_TTS_PROVIDER = getAudioModelProvider\(\)/);
  assert.match(orchestrator, /input\.type === "tts"/);
  assert.match(routes, /synthesizeShotDialogue\(shotId, undefined,/);
  assert.doesNotMatch(routes, /body\.provider \|\| "voxcpm2"/);
});
