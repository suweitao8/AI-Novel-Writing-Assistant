const assert = require("node:assert/strict");
const test = require("node:test");

const {
  DEFAULT_DRAMA_VIDEO_MEDIA_COPY_CONCURRENCY,
  DEFAULT_DRAMA_VIDEO_PREPARATION_CONCURRENCY,
  mapDramaVideoTasksInOrder,
  resolveDramaVideoMediaCopyConcurrency,
  resolveDramaVideoPreparationConcurrency,
} = require("../dist/services/drama/video/videoProcessingConcurrency.js");

test("video preprocessing uses bounded concurrency and preserves input order", async () => {
  const items = [0, 1, 2, 3, 4, 5];
  let active = 0;
  let maxActive = 0;

  const result = await mapDramaVideoTasksInOrder(items, 3, async (item) => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    await new Promise((resolve) => setTimeout(resolve, (5 - item) * 3));
    active -= 1;
    return `scene-${item}`;
  });

  assert.equal(maxActive, 3);
  assert.deepEqual(result, ["scene-0", "scene-1", "scene-2", "scene-3", "scene-4", "scene-5"]);
  assert.equal(active, 0);
});

test("video preprocessing fails cleanly when one worker fails", async () => {
  await assert.rejects(
    () => mapDramaVideoTasksInOrder([0, 1, 2], 2, async (item) => {
      if (item === 1) {
        throw new Error("probe failed");
      }
      return item;
    }),
    /probe failed/,
  );
});

test("video concurrency defaults are conservative and environment overrides are bounded", () => {
  assert.equal(DEFAULT_DRAMA_VIDEO_PREPARATION_CONCURRENCY, 3);
  assert.equal(DEFAULT_DRAMA_VIDEO_MEDIA_COPY_CONCURRENCY, 4);
  assert.equal(resolveDramaVideoPreparationConcurrency({}), 3);
  assert.equal(resolveDramaVideoPreparationConcurrency({ DRAMA_VIDEO_PREPARATION_CONCURRENCY: "5" }), 5);
  assert.equal(resolveDramaVideoPreparationConcurrency({ DRAMA_VIDEO_PREPARATION_CONCURRENCY: "0" }), 3);
  assert.equal(resolveDramaVideoPreparationConcurrency({ DRAMA_VIDEO_PREPARATION_CONCURRENCY: "4workers" }), 3);
  assert.equal(resolveDramaVideoPreparationConcurrency({ DRAMA_VIDEO_PREPARATION_CONCURRENCY: "99" }), 8);
  assert.equal(resolveDramaVideoMediaCopyConcurrency({ DRAMA_VIDEO_MEDIA_COPY_CONCURRENCY: "2" }), 2);
  assert.equal(resolveDramaVideoMediaCopyConcurrency({ DRAMA_VIDEO_MEDIA_COPY_CONCURRENCY: "bad" }), 4);
});
