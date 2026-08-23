const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const read = (relativePath) => fs.readFileSync(path.resolve(__dirname, "..", "src", relativePath), "utf8");

test("静态首帧合成不再应用运镜或 Ken Burns 动效", () => {
  const localVideo = read("services/drama/video/LocalFfmpegVideoProvider.ts");
  const keyframeService = read("services/drama/visual/DramaShotKeyframeService.ts");
  const videoPromptService = read("services/drama/DramaVideoPromptService.ts");

  assert.doesNotMatch(localVideo, /zoompan|Ken Burns|缓慢推拉/);
  assert.match(localVideo, /scale=\$\{width \* 2\}:\$\{height \* 2\}/);
  assert.match(keyframeService, /静态画面/);
  assert.doesNotMatch(keyframeService, /shot\.cameraMove \? `运镜意图/);
  assert.doesNotMatch(videoPromptService, /cameraMove: shot\.cameraMove/);
});

test("整集合成优先使用配音总时长作为镜头时间轴", () => {
  const assembler = read("services/drama/video/DramaRemotionEpisodeAssembler.ts");

  assert.match(
    assembler,
    /const durationSec = audioDuration > 0 \? Math\.max\(1, audioDuration\) : normalizeDurationSec\(shot\.durationSec, 1\)/,
  );
  assert.doesNotMatch(assembler, /Math\.max\(1, shot\.durationSec, audioDuration\)/);
});
