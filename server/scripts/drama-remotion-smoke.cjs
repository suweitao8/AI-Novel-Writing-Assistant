const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const { DramaRemotionEpisodeAssembler } = require("../dist/services/drama/video/DramaRemotionEpisodeAssembler.js");
const { getDramaRenderProfile } = require("../dist/services/drama/video/renderProfile.js");
const { resolveFfmpegBin, runVideoProcess } = require("../dist/services/drama/video/ffmpegUtils.js");

async function run() {
  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "drama-remotion-smoke-"));
  try {
    const audioPath = path.join(workDir, "voice.wav");
    const imagePath = path.join(workDir, "keyframe.png");
    const outputPath = path.join(workDir, "episode.mp4");
    const srtPath = path.join(workDir, "episode.srt");
    await runFfmpeg([
      "-y", "-f", "lavfi", "-i", "sine=frequency=440:duration=2",
      "-ar", "44100", "-ac", "2", "-c:a", "pcm_s16le", audioPath,
    ]);
    await runFfmpeg([
      "-y", "-f", "lavfi", "-i", "color=c=0x31506b:s=1536x864",
      "-frames:v", "1", imagePath,
    ]);

    const profile = getDramaRenderProfile({ DRAMA_VIDEO_PROFILE: process.env.DRAMA_VIDEO_PROFILE });
    const result = await new DramaRemotionEpisodeAssembler().assemble({
      jobId: "smoke-720p",
      episodeTitle: "Remotion 横屏验收",
      episodeOrder: 1,
      profile,
      shots: [{
        shotId: "smoke-shot",
        order: 1,
        durationSec: 2,
        imagePath,
        detail: "真实 smoke 镜头",
        audioLines: [{ text: "这是横屏成片验收。", speaker: "旁白", durationSec: 2, sourcePath: audioPath }],
      }],
      includeTitleCard: true,
      includeEndCard: true,
      showSubtitles: true,
      outputPath,
      srtPath,
      workDir,
    });

    assert.equal(result.probe.video.width, profile.width);
    assert.equal(result.probe.video.height, profile.height);
    assert.equal(result.probe.video.fps, 24);
    assert.equal(result.probe.video.codecName, "h264");
    assert.equal(result.probe.audio.codecName, "aac");
    assert.ok((await fs.stat(outputPath)).size > 0);
    assert.match(await fs.readFile(srtPath, "utf8"), /横屏成片验收/);
    console.log(JSON.stringify({
      status: "SMOKE_OK",
      outputPath,
      durationSec: result.durationSec,
      profile: profile.id,
      video: result.probe.video,
      audio: result.probe.audio,
    }));
  } finally {
    await fs.rm(workDir, { recursive: true, force: true });
  }
}

async function runFfmpeg(args) {
  const result = await runVideoProcess(resolveFfmpegBin(), args, 120_000);
  if (result.code !== 0) {
    throw new Error(`ffmpeg smoke step failed (${result.code}): ${result.stderrTail}`);
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
