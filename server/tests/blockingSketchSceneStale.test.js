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

test("新草图带版本标记：版本不同即过期，相同不判过期", () => {
  assert.equal(
    isBlockingSketchSceneImageStale({
      storedImageUpdatedAt: "2026-08-25T11:09:32.784Z",
      currentImageUpdatedAt: "2026-08-26T11:21:31.171Z",
    }),
    true,
    "场景图换版后旧草图过期",
  );
  assert.equal(
    isBlockingSketchSceneImageStale({
      storedImageUpdatedAt: "2026-08-26T11:21:31.171Z",
      currentImageUpdatedAt: "2026-08-26T11:21:31.171Z",
    }),
    false,
    "同版本不过期",
  );
});

test("旧草图无标记：截图时间早于当前场景图生成时间即过期（兜底第 3 镜类残留）", () => {
  assert.equal(
    isBlockingSketchSceneImageStale({
      sketchGeneratedAt: "2026-08-25T11:09:32.784Z",
      currentImageUpdatedAt: "2026-08-26T11:21:31.171Z",
    }),
    true,
    "截图早于当前全景 → 用的是被覆盖的上一版",
  );
  assert.equal(
    isBlockingSketchSceneImageStale({
      sketchGeneratedAt: "2026-09-01T23:00:15.163Z",
      currentImageUpdatedAt: "2026-08-26T11:21:31.171Z",
    }),
    false,
    "截图晚于当前全景 → 已是新版",
  );
  assert.equal(
    isBlockingSketchSceneImageStale({
      sketchGeneratedAt: "2026-08-26T11:21:31.171Z",
      currentImageUpdatedAt: "2026-08-26T11:21:31.171Z",
    }),
    false,
    "同一时刻不判过期",
  );
  assert.equal(
    isBlockingSketchSceneImageStale({
      sketchGeneratedAt: "不是时间",
      currentImageUpdatedAt: "2026-08-26T11:21:31.171Z",
    }),
    false,
    "无法解析的时间不判过期",
  );
});

test("证据缺失时一律不判过期，避免整体误报", () => {
  assert.equal(
    isBlockingSketchSceneImageStale({ currentImageUpdatedAt: "2026-08-26T11:21:31.171Z" }),
    false,
    "既无标记也无截图时间",
  );
  assert.equal(
    isBlockingSketchSceneImageStale({
      storedImageUpdatedAt: "2026-08-25T11:09:32.784Z",
      sketchGeneratedAt: "2026-08-25T11:09:32.784Z",
    }),
    false,
    "当前场景图没有版本",
  );
  assert.equal(isBlockingSketchSceneImageStale({}), false);
});
