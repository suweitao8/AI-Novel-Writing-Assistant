const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const { getDramaRenderProfile } = require("../dist/services/drama/video/renderProfile.js");
const { buildDramaVideoTimeline } = require("../dist/services/drama/video/dramaVideoTimeline.js");
const { DramaRemotionRenderer } = require("../dist/services/drama/video/DramaRemotionRenderer.js");

test("drama timeline converts contiguous seconds into landscape frame ranges", () => {
  const timeline = buildDramaVideoTimeline({
    fps: 24,
    scenes: [
      { id: "title", kind: "title", durationSec: 1.5, title: "测试" },
      { id: "shot-1", kind: "shot", durationSec: 2.25, imagePath: "images/shot-1.png" },
      { id: "end", kind: "end", durationSec: 1, title: "完" },
    ],
    subtitles: [{ startSec: 1.5, endSec: 3.75, text: "第一句", speaker: "林澈" }],
  });

  assert.equal(timeline.durationInFrames, 114);
  assert.deepEqual(timeline.scenes.map((scene) => [scene.startFrame, scene.durationInFrames]), [
    [0, 36],
    [36, 54],
    [90, 24],
  ]);
  assert.deepEqual(timeline.subtitles, [{
    startFrame: 36,
    durationInFrames: 54,
    text: "第一句",
    speaker: "林澈",
  }]);
});

test("renderer writes props, copies public media, and invokes the landscape composition", async () => {
  const workRoot = await fs.mkdtemp(path.join(os.tmpdir(), "drama-renderer-test-"));
  const sourceImage = path.join(workRoot, "source.png");
  const outputPath = path.join(workRoot, "silent.mp4");
  await fs.writeFile(sourceImage, "fixture");
  const calls = [];
  let propsSnapshot;
  let publicFileSnapshot;
  const renderer = new DramaRemotionRenderer({
    videoPackageRoot: path.join(workRoot, "video"),
    runRemotion: async (args, cwd) => {
      calls.push({ args, cwd });
      const propsPath = args[args.indexOf("--props") + 1];
      const publicDir = args[args.indexOf("--public-dir") + 1];
      propsSnapshot = JSON.parse(await fs.readFile(propsPath, "utf8"));
      publicFileSnapshot = await fs.readFile(path.join(publicDir, "images/shot-1.png"), "utf8");
    },
  });
  const timeline = buildDramaVideoTimeline({
    fps: 24,
    scenes: [{ id: "shot-1", kind: "shot", durationSec: 1, imagePath: "images/shot-1.png" }],
    subtitles: [],
  });

  const result = await renderer.render({
    jobId: "test-job",
    profile: getDramaRenderProfile({}),
    timeline,
    publicFiles: [{ sourcePath: sourceImage, publicPath: "images/shot-1.png" }],
    outputPath,
    showSubtitles: true,
  });

  assert.equal(result.outputPath, outputPath);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].cwd, path.join(workRoot, "video"));
  assert.deepEqual(calls[0].args.slice(0, 4), ["exec", "remotion", "render", "src/index.tsx"]);
  assert.ok(calls[0].args.includes("DramaEpisodeVideo"));
  assert.deepEqual({ width: propsSnapshot.width, height: propsSnapshot.height, fps: propsSnapshot.fps }, { width: 1280, height: 720, fps: 24 });
  assert.equal(propsSnapshot.scenes[0].image, "images/shot-1.png");
  assert.equal(publicFileSnapshot, "fixture");
  await fs.rm(workRoot, { recursive: true, force: true });
});
