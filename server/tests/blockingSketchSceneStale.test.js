const assert = require("node:assert/strict");
const test = require("node:test");

const {
  isBlockingSketchSceneImageStale,
  storyAssetStateImageUpdatedAt,
} = require("../../shared/dist/utils/storyAssetSceneStates.js");

test("场景图版本标记取状态图的生成时间", () => {
  assert.equal(
    storyAssetStateImageUpdatedAt({ image: { status: "done", url: "/api/x", generatedAt: "2026-09-01T10:00:00.000Z" } }),
    "2026-09-01T10:00:00.000Z",
  );
  assert.equal(storyAssetStateImageUpdatedAt({ image: { status: "generating" } }), null);
  assert.equal(storyAssetStateImageUpdatedAt({ image: null }), null);
  assert.equal(storyAssetStateImageUpdatedAt(null), null);
});

test("草图版本与当前版本不同即过期，相同或缺失不判过期", () => {
  assert.equal(
    isBlockingSketchSceneImageStale("2026-08-25T11:09:32.784Z", "2026-08-26T11:21:31.171Z"),
    true,
    "场景图换版后旧草图过期",
  );
  assert.equal(
    isBlockingSketchSceneImageStale("2026-08-26T11:21:31.171Z", "2026-08-26T11:21:31.171Z"),
    false,
    "同版本不过期",
  );
  assert.equal(
    isBlockingSketchSceneImageStale(undefined, "2026-08-26T11:21:31.171Z"),
    false,
    "旧草图没有版本标记时不误报",
  );
  assert.equal(
    isBlockingSketchSceneImageStale("2026-08-26T11:21:31.171Z", null),
    false,
    "当前场景图没有版本时不判过期",
  );
});
