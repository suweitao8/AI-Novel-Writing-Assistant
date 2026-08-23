const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const read = (relativePath) => fs.readFileSync(path.resolve(__dirname, "..", "src", relativePath), "utf8");

test("模拟配音不能写入按字数估算的伪时长", () => {
  const ttsPort = read("services/drama/audio/TTSProviderPort.ts");

  assert.doesNotMatch(ttsPort, /durationSec:\s*Math\.max\(1, Math\.ceil\(input\.text\.length \/ 5\)\)/);
  assert.match(ttsPort, /不会生成真实语音/);
  assert.match(ttsPort, /throw new Error/);
});

test("旧 provider 或模拟音频不能继续被投影为 ready", () => {
  const segmentsService = read("services/drama/audio/DramaAudioSegmentsService.ts");
  const dialogueService = read("services/drama/audio/DramaDialogueAudioService.ts");
  const batchOrchestrator = read("services/drama/production/DramaBatchOrchestrator.ts");

  assert.match(segmentsService, /getAudioModelProvider/);
  assert.match(segmentsService, /item\.provider === expectedProvider/);
  assert.match(dialogueService, /existing\?\.provider === provider/);
  assert.match(dialogueService, /prev\.provider === provider/);
  assert.doesNotMatch(batchOrchestrator, /hasDoneDialogueAudio\(raw\)/);
  assert.match(batchOrchestrator, /loadCurrentAudioReadyShotIds/);
  assert.match(batchOrchestrator, /currentAudioReadyShotIds\?\.has\(shot\.id\)/);
});

test("合成时间轴只使用 ffprobe 实测音频时长，不回退文字长度估算", () => {
  const assemblyService = read("services/drama/video/DramaEpisodeAssemblyService.ts");
  const batchOrchestrator = read("services/drama/production/DramaBatchOrchestrator.ts");

  assert.match(assemblyService, /const probed = await ffprobeDuration\(audioPath\)/);
  assert.doesNotMatch(assemblyService, /item\.text\?\.length/);
  assert.doesNotMatch(assemblyService, /probed \?\? item\.durationSec/);
  assert.doesNotMatch(batchOrchestrator, /Math\.ceil\(item\.text\.length \/ 5\)/);
  assert.doesNotMatch(batchOrchestrator, /const billableShots = force[\s\S]*?estimatedUnits = \{[\s\S]*?seconds: billableShots\.reduce\(\(sum, shot\) => sum \+ normalizeDurationSec\(shot\.durationSec\)/);
});
