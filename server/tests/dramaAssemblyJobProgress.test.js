const assert = require("node:assert/strict");
const test = require("node:test");

const { DramaAssemblyProgressTracker } = require("../dist/services/drama/video/assemblyJobProgress.js");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test("assembly progress serializes out-of-order workers without regressing persisted progress", async () => {
  let now = 0;
  const writes = [];
  const progress = { done: 0, phase: "prepare" };
  const tracker = new DramaAssemblyProgressTracker(progress, async (snapshot) => {
    await sleep(snapshot.done === 1 ? 8 : 1);
    writes.push(snapshot);
  }, () => now);

  await tracker.enqueue();
  now = 4;
  tracker.incrementDone();
  now = 5;
  tracker.incrementDone();
  now = 11;
  await tracker.transition("audio");
  now = 17;
  await tracker.transition("render");
  now = 23;
  await tracker.transition("mux");
  now = 29;
  await tracker.transition("done");
  tracker.finish();
  await tracker.enqueue();
  await tracker.flush();

  assert.deepEqual(writes.map((entry) => entry.done), [0, 1, 2, 2, 2, 2, 2, 2]);
  assert.deepEqual(writes.at(-1).timings, {
    prepareMs: 11,
    audioMs: 6,
    renderMs: 6,
    muxMs: 6,
    totalMs: 29,
  });
});

test("assembly progress keeps completed phase timings when a job fails", async () => {
  let now = 0;
  const writes = [];
  const progress = { done: 0, phase: "prepare", error: undefined };
  const tracker = new DramaAssemblyProgressTracker(progress, async (snapshot) => writes.push(snapshot), () => now);

  await tracker.enqueue();
  now = 7;
  await tracker.transition("audio");
  now = 12;
  tracker.finish();
  progress.error = "ffmpeg failed";
  await tracker.enqueue();
  await tracker.flush();

  assert.deepEqual(writes.at(-1).timings, { prepareMs: 7, audioMs: 5, totalMs: 12 });
  assert.equal(writes.at(-1).error, "ffmpeg failed");
});
