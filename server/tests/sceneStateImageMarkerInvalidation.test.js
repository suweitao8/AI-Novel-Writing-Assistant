const assert = require("node:assert/strict");
const test = require("node:test");

const { applySceneStateImageWrite } = require("../dist/modules/novel/story-settings/application/StoryAssetStateImageService.js");

const state = {
  id: "initial",
  label: "默认",
  description: "室内",
  imagePrompt: "室内场景",
  image: { status: "done", artifactId: "old", url: "/old.png" },
  scene3dMarkers: {
    schemaVersion: 1,
    status: "ready",
    sourceImageArtifactId: "old",
    markers: [],
  },
};

test("场景状态图最终提交会清除旧图片的空间标记", () => {
  const next = applySceneStateImageWrite({
    state,
    image: { status: "done", artifactId: "new", url: "/new.png" },
    invalidateMarkers: true,
  });
  assert.equal(next.image.artifactId, "new");
  assert.equal(next.scene3dMarkers, undefined);
});

test("生成中或失败更新不会清除最后一张图片的空间标记", () => {
  const next = applySceneStateImageWrite({
    state,
    image: { status: "generating", artifactId: "old", url: "/old.png" },
    invalidateMarkers: false,
  });
  assert.equal(next.scene3dMarkers.sourceImageArtifactId, "old");
});
