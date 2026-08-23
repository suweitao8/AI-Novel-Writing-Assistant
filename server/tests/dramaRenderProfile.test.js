const test = require("node:test");
const assert = require("node:assert/strict");

const {
  assertLandscape16x9,
  audioFileExtensionFromDataUrl,
  getDramaRenderProfile,
} = require("../dist/services/drama/video/renderProfile.js");

test("drama render profile defaults to landscape 720p", () => {
  assert.deepEqual(getDramaRenderProfile({}), {
    id: "720p",
    width: 1280,
    height: 720,
    fps: 24,
  });
});

test("drama render profile exposes explicit 1080p without changing the default", () => {
  assert.deepEqual(getDramaRenderProfile({ DRAMA_VIDEO_PROFILE: "1080p" }), {
    id: "1080p",
    width: 1920,
    height: 1080,
    fps: 24,
  });
  assert.equal(getDramaRenderProfile({}).id, "720p");
});

test("render profile rejects portrait dimensions", () => {
  assert.doesNotThrow(() => assertLandscape16x9(1280, 720));
  assert.throws(() => assertLandscape16x9(1080, 1920), /16:9|横屏/);
});

test("audio file extension follows the data URL MIME", () => {
  assert.equal(audioFileExtensionFromDataUrl("data:audio/wav;base64,AAAA"), "wav");
  assert.equal(audioFileExtensionFromDataUrl("data:audio/mpeg;base64,AAAA"), "mp3");
  assert.equal(audioFileExtensionFromDataUrl("data:audio/ogg;base64,AAAA"), "bin");
});
