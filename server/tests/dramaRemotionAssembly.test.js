const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const { getDramaRenderProfile } = require("../dist/services/drama/video/renderProfile.js");
const {
  DramaRemotionEpisodeAssembler,
  resolveAssemblyJobStatus,
} = require("../dist/services/drama/video/DramaRemotionEpisodeAssembler.js");

test("Remotion assembly renders a landscape timeline and muxes normalized audio", async () => {
  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "drama-assembly-test-"));
  const outputPath = path.join(workDir, "episode.mp4");
  const srtPath = path.join(workDir, "episode.srt");
  const audioSource = path.join(workDir, "line.wav");
  await fs.writeFile(audioSource, "fixture");

  const profile = getDramaRenderProfile({ DRAMA_VIDEO_PROFILE: "720p" });
  const renderCalls = [];
  const ffmpegCalls = [];
  const renderer = {
    render: async (input) => {
      renderCalls.push(input);
      await fs.writeFile(input.outputPath, "silent-video");
      return { outputPath: input.outputPath, durationInFrames: input.timeline.durationInFrames };
    },
  };
  const runFfmpeg = async (args) => {
    ffmpegCalls.push(args);
    await fs.writeFile(args.at(-1), "generated");
  };
  const probe = async () => ({
    durationSec: 7,
    video: { codecName: "h264", width: 1280, height: 720, fps: 24 },
    audio: { codecName: "aac", sampleRate: 44100, channels: 2 },
  });

  const result = await new DramaRemotionEpisodeAssembler({ renderer, runFfmpeg, probe }).assemble({
    jobId: "job-1",
    episodeTitle: "第一集",
    episodeOrder: 1,
    profile,
    shots: [{
      shotId: "shot-1",
      order: 1,
      durationSec: 2,
      imagePath: null,
      detail: "夜色中的街道",
      audioLines: [{ text: "向前走。", speaker: "旁白", durationSec: 2, sourcePath: audioSource }],
    }],
    includeTitleCard: true,
    includeEndCard: true,
    showSubtitles: true,
    outputPath,
    srtPath,
    workDir,
  });

  assert.equal(renderCalls.length, 1);
  assert.equal(renderCalls[0].profile.width, 1280);
  assert.equal(renderCalls[0].profile.height, 720);
  assert.equal(renderCalls[0].profile.fps, 24);
  assert.deepEqual(renderCalls[0].timeline.scenes.map((scene) => scene.kind), ["title", "shot", "end"]);
  assert.equal(renderCalls[0].timeline.scenes[1].durationInFrames, 48);
  assert.equal(renderCalls[0].timeline.subtitles[0].startFrame, 72);
  assert.equal(renderCalls[0].timeline.subtitles[0].durationInFrames, 48);
  assert.ok(ffmpegCalls.some((args) => args.includes("pcm_s16le")), "audio must be normalized to PCM WAV");
  assert.ok(ffmpegCalls.some((args) => args.includes("-c:v") && args.includes("copy")), "final mux must copy Remotion video");
  assert.equal(result.outputPath, outputPath);
  assert.equal(result.durationSec, 7);
  assert.match(await fs.readFile(srtPath, "utf8"), /旁白：向前走/);
});

test("local visual/audio degradation remains a completed assembly with warnings", () => {
  assert.equal(resolveAssemblyJobStatus({ renderSucceeded: true, muxSucceeded: true, probePassed: true }), "done");
  assert.equal(resolveAssemblyJobStatus({ renderSucceeded: true, muxSucceeded: true, probePassed: true, warningCount: 3 }), "done");
  assert.equal(resolveAssemblyJobStatus({ renderSucceeded: false, muxSucceeded: false, probePassed: false }), "failed");
});
