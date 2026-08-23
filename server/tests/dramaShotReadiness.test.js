const test = require("node:test");
const assert = require("node:assert/strict");

const {
  classifyDramaVisual,
  isDramaAudioReady,
  isDramaKeyframeReady,
} = require("../dist/services/drama/readiness/DramaShotReadiness.js");

test("keyframe only counts done data with a non-empty URL", () => {
  assert.equal(
    isDramaKeyframeReady(JSON.stringify({ status: "done", url: "/api/drama/shot-images/s1/keyframe" })),
    true,
  );
  assert.equal(isDramaKeyframeReady(JSON.stringify({ status: "done", url: "" })), false);
  assert.equal(isDramaKeyframeReady(JSON.stringify({ status: "generating", url: "/image" })), false);
  assert.equal(isDramaKeyframeReady("not-json"), false);
});

test("audio only counts every current line as ready", () => {
  const ready = {
    status: "ready",
    lines: [{ lineIndex: 0, status: "ready", audioUrl: "data:audio/wav;base64,AA==" }],
  };
  assert.equal(isDramaAudioReady(ready, [{ lineIndex: 0 }]), true);
  assert.equal(isDramaAudioReady(ready, [{ lineIndex: 0 }, { lineIndex: 1 }]), false);
});

test("missing dialogue does not create a missing-audio state", () => {
  assert.equal(isDramaAudioReady({ status: "missing" }, []), true);
});

test("stale or non-data audio lines are not ready", () => {
  assert.equal(
    isDramaAudioReady(
      { status: "ready", lines: [{ lineIndex: 0, status: "stale", audioUrl: "data:audio/wav;base64,AA==" }] },
      [{ lineIndex: 0 }],
    ),
    false,
  );
  assert.equal(
    isDramaAudioReady(
      { status: "ready", lines: [{ lineIndex: 0, status: "ready", audioUrl: "/api/audio/old.wav" }] },
      [{ lineIndex: 0 }],
    ),
    false,
  );
});

test("visual classification prefers video, then keyframe, then placeholder", () => {
  assert.equal(classifyDramaVisual({ videoReady: true, keyframeReady: true }), "video");
  assert.equal(classifyDramaVisual({ videoReady: false, keyframeReady: true }), "keyframe");
  assert.equal(classifyDramaVisual({ videoReady: false, keyframeReady: false }), "placeholder");
});
