const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const read = (relativePath) => fs.readFileSync(path.resolve(__dirname, "..", "src", relativePath), "utf8");

test("all video output entry points consume the persisted render profile", () => {
  const assembly = read("services/drama/video/DramaEpisodeAssemblyService.ts");
  const localVideo = read("services/drama/video/LocalFfmpegVideoProvider.ts");
  const exportService = read("services/drama/DramaExportService.ts");

  assert.match(assembly, /getConfiguredDramaRenderProfile/);
  assert.match(localVideo, /getConfiguredDramaRenderProfile/);
  assert.match(exportService, /getConfiguredDramaRenderProfile/);
  assert.doesNotMatch(assembly, /import \{[^}]*getDramaRenderProfile/);
  assert.doesNotMatch(localVideo, /import \{[^}]*getDramaRenderProfile/);
  assert.doesNotMatch(exportService, /import \{[^}]*getDramaRenderProfile/);
});

test("the pure render profile keeps the 16:9 720p and 1080p definitions", () => {
  const renderProfile = read("services/drama/video/renderProfile.ts");
  assert.match(renderProfile, /720p.*1280.*720/si);
  assert.match(renderProfile, /1080p.*1920.*1080/si);
  assert.match(renderProfile, /assertLandscape16x9/);
});
