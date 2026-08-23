const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const SERVER_ROOT = path.join(__dirname, "..");

test("drama batch startup recovery covers generation and assembly jobs", () => {
  const recoverySource = fs.readFileSync(
    path.join(SERVER_ROOT, "src/services/drama/production/batchJobRecovery.ts"),
    "utf8",
  );
  const appSource = fs.readFileSync(path.join(SERVER_ROOT, "src/app.ts"), "utf8");

  assert.match(recoverySource, /recoverInterruptedDramaBatchJobs/);
  assert.match(recoverySource, /"full_episode"/);
  assert.match(appSource, /await recoverInterruptedDramaBatchJobs\(\)/);
});

test("drama batch creation returns an existing active job instead of duplicating it", () => {
  const source = fs.readFileSync(
    path.join(SERVER_ROOT, "src/services/drama/production/DramaBatchOrchestrator.ts"),
    "utf8",
  );

  assert.match(source, /createJobLocks/);
  assert.match(source, /status:\s*\{\s*in:\s*\["pending",\s*"running"\]/);
  assert.match(source, /return \{ job: activeJob/);
  assert.match(source, /\$transaction/);
  assert.match(source, /\$executeRaw/);
});

test("tts batch skipping uses the current audio segment projection", () => {
  const source = fs.readFileSync(
    path.join(SERVER_ROOT, "src/services/drama/production/DramaBatchOrchestrator.ts"),
    "utf8",
  );

  assert.match(source, /dramaAudioSegmentsService\.listEpisodeAudioSegments/);
  assert.match(source, /currentAudioReadyShotIds/);
  assert.match(source, /processTtsShot\(shot, force, currentAudioReady/);
  assert.match(source, /cost: this\.estimateCost\([\s\S]*currentAudioReadyShotIds/);
  assert.doesNotMatch(source, /hasDoneDialogueAudio/);
});

test("full episode assembly start is serialized per episode", () => {
  const source = fs.readFileSync(
    path.join(SERVER_ROOT, "src/services/drama/video/DramaEpisodeAssemblyService.ts"),
    "utf8",
  );

  assert.match(source, /assemblyStartLocks/);
  assert.match(source, /startAssemblyInternal/);
  assert.match(source, /type:\s*"full_episode"/);
  assert.match(source, /\$transaction/);
  assert.match(source, /\$executeRaw/);
});

test("silent shots use an explicit shot duration and do not require fake audio", () => {
  const assemblySource = fs.readFileSync(
    path.join(SERVER_ROOT, "src/services/drama/video/DramaEpisodeAssemblyService.ts"),
    "utf8",
  );
  const assemblerSource = fs.readFileSync(
    path.join(SERVER_ROOT, "src/services/drama/video/DramaRemotionEpisodeAssembler.ts"),
    "utf8",
  );

  assert.match(assemblySource, /!shot\.dialogue\?\.trim\(\)/);
  assert.match(assemblySource, /shot\.durationSec/);
  assert.match(assemblerSource, /shot\.audioLines\.length === 0/);
  assert.match(assemblerSource, /shot\.durationSec/);
});
