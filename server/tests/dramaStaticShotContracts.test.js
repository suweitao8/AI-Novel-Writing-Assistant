const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const read = (relativePath) => fs.readFileSync(path.resolve(__dirname, "..", "src", relativePath), "utf8");

test("静态首帧合成不再应用运镜或 Ken Burns 动效", () => {
  const localVideo = read("services/drama/video/LocalFfmpegVideoProvider.ts");
  const keyframeService = read("services/drama/visual/DramaShotKeyframeService.ts");
  const keyframePrompt = read("prompting/prompts/drama/shotKeyframe.prompts.ts");
  const videoPromptService = read("services/drama/DramaVideoPromptService.ts");

  assert.doesNotMatch(localVideo, /zoompan|Ken Burns|缓慢推拉/);
  assert.match(localVideo, /scale=\$\{width \* 2\}:\$\{height \* 2\}/);
  assert.match(keyframePrompt, /静态画面/);
  assert.doesNotMatch(keyframeService, /shot\.cameraMove \? `运镜意图/);
  assert.doesNotMatch(videoPromptService, /cameraMove: shot\.cameraMove/);
});

test("整集合成只使用真实配音时长建立镜头时间轴", () => {
  const assembler = read("services/drama/video/DramaRemotionEpisodeAssembler.ts");

  assert.match(assembler, /const audioDuration = shot\.audioLines\.reduce\(\(sum, line\) => sum \+ line\.durationSec, 0\)/);
  assert.match(assembler, /没有真实配音时长，无法建立时间轴/);
  assert.match(assembler, /durationSec = Math\.round\(audioDuration \* 100\) \/ 100/);
  assert.match(assembler, /shot\.audioLines\.length === 0/);
  assert.match(assembler, /shot\.durationSec/);
  assert.doesNotMatch(assembler, /normalizeDurationSec\(shot\.durationSec/);
});
