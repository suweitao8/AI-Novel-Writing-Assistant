const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { summarizeDramaEpisodeReadiness } = require("../dist/services/drama/readiness/DramaReadinessService.js");

const SERVER_ROOT = path.join(__dirname, "..");

test("episode readiness uses the same shot-level visual and audio counts", () => {
  const result = summarizeDramaEpisodeReadiness(
    [
      {
        id: "s1",
        keyframeData: JSON.stringify({ status: "done", url: "/keyframe/s1" }),
        videoReady: false,
        audioLineIndexes: [0],
      },
      {
        id: "s2",
        keyframeData: JSON.stringify({ status: "done", url: "" }),
        videoReady: false,
        audioLineIndexes: [],
      },
      {
        id: "s3",
        keyframeData: null,
        videoReady: true,
        audioLineIndexes: [0],
      },
    ],
    [
      { shotId: "s1", lineIndex: 0, status: "ready", audioUrl: "data:audio/wav;base64,AA==" },
      { shotId: "s3", lineIndex: 0, status: "stale", audioUrl: "data:audio/wav;base64,AA==" },
    ],
  );

  const { shots, ...summary } = result;
  assert.deepEqual(summary, {
    shotCount: 3,
    keyframeReadyCount: 1,
    audioReadyCount: 2,
    withVideoClip: 1,
    withKeyframeOnly: 1,
    withoutVisual: 1,
    withoutAudioShotCount: 1,
  });
  assert.deepEqual(shots.map((shot) => ({ shotId: shot.shotId, audioReady: shot.audioReady, visualKind: shot.visualKind })), [
    { shotId: "s1", audioReady: true, visualKind: "keyframe" },
    { shotId: "s2", audioReady: true, visualKind: "placeholder" },
    { shotId: "s3", audioReady: false, visualKind: "video" },
  ]);
});

test("invalid non-empty asset JSON is not counted as ready", () => {
  const result = summarizeDramaEpisodeReadiness(
    [{ id: "s1", keyframeData: "{broken", videoReady: false, audioLineIndexes: [0] }],
    [{ shotId: "s1", lineIndex: 0, status: "missing" }],
  );

  assert.equal(result.keyframeReadyCount, 0);
  assert.equal(result.audioReadyCount, 0);
  assert.equal(result.withoutVisual, 1);
  assert.equal(result.withoutAudioShotCount, 1);
});

test("studio and assembly surfaces consume the canonical readiness projection", () => {
  const studioSource = fs.readFileSync(
    path.join(SERVER_ROOT, "src/services/drama/studio/ComicDramaStudioService.ts"),
    "utf8",
  );
  const assemblySource = fs.readFileSync(
    path.join(SERVER_ROOT, "src/services/drama/video/DramaEpisodeAssemblyService.ts"),
    "utf8",
  );

  assert.match(studioSource, /dramaReadinessService\.getProjectReadiness/);
  assert.doesNotMatch(studioSource, /keyframeData:\s*\{\s*not:\s*null\s*\}/);
  assert.doesNotMatch(studioSource, /dialogueAudioData:\s*\{\s*not:\s*null\s*\}/);
  assert.match(assemblySource, /dramaAudioSegmentsService\.listEpisodeAudioSegments/);
  assert.doesNotMatch(assemblySource, /audio\.status === "done"/);
});
