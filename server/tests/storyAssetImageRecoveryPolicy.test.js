const test = require("node:test");
const assert = require("node:assert/strict");

const {
  projectActiveStoryAssetImageGeneration,
  preserveReadableStoryAssetImagePointer,
  prioritizeStoryAssetImageArtifacts,
} = require("../dist/modules/novel/story-settings/application/StoryAssetImageRecoveryPolicy.js");

test("有效的持久生成锁投影为生成中，但保留最后一张可读图片", () => {
  assert.deepEqual(
    projectActiveStoryAssetImageGeneration({
      status: "error",
      artifactId: "artifact-current",
      url: "/api/story-assets/current",
      generatedAt: "2026-08-25T10:00:00.000Z",
      error: "上一轮失败",
    }),
    {
      status: "generating",
      artifactId: "artifact-current",
      url: "/api/story-assets/current",
      generatedAt: "2026-08-25T10:00:00.000Z",
    },
  );
  assert.deepEqual(
    projectActiveStoryAssetImageGeneration(undefined),
    { status: "generating" },
  );
});

test("失败写回保留当前可读图片指针，不把旧图降级成丢失", () => {
  const current = {
    status: "generating",
    artifactId: "artifact-current",
    url: "/api/story-assets/current",
    generatedAt: "2026-08-25T10:00:00.000Z",
  };
  const attempted = {
    status: "error",
    artifactId: "artifact-staging",
    url: "/api/story-assets/staging",
    generatedAt: "2026-08-25T10:03:00.000Z",
    error: "provider timeout",
  };

  assert.deepEqual(
    preserveReadableStoryAssetImagePointer(current, attempted),
    {
      ...attempted,
      artifactId: "artifact-current",
      url: "/api/story-assets/current",
      generatedAt: "2026-08-25T10:00:00.000Z",
    },
  );
});

test("没有旧图时失败状态不伪造可用图片指针", () => {
  const attempted = { status: "error", error: "provider timeout" };
  assert.deepEqual(preserveReadableStoryAssetImagePointer(undefined, attempted), attempted);
  assert.deepEqual(
    preserveReadableStoryAssetImagePointer({ status: "idle" }, attempted),
    attempted,
  );
});

test("旧图片只有归属 URL 时，失败尝试的 staging artifactId 也不会被保留", () => {
  const current = {
    status: "generating",
    url: "/api/story-assets/legacy-scoped",
    generatedAt: "2026-08-25T10:00:00.000Z",
  };
  const attempted = {
    status: "error",
    artifactId: "artifact-staging",
    url: "/api/story-assets/staging",
    error: "provider timeout",
  };

  assert.deepEqual(
    preserveReadableStoryAssetImagePointer(current, attempted),
    {
      status: "error",
      url: "/api/story-assets/legacy-scoped",
      generatedAt: "2026-08-25T10:00:00.000Z",
      error: "provider timeout",
    },
  );
});

test("制品恢复优先当前指针，再按数据库提供的最新顺序尝试同一资产历史", () => {
  const candidates = [
    { id: "artifact-newest-other" },
    { id: "artifact-current" },
    { id: "artifact-older" },
  ];

  assert.deepEqual(
    prioritizeStoryAssetImageArtifacts("artifact-current", candidates).map((item) => item.id),
    ["artifact-current", "artifact-newest-other", "artifact-older"],
  );
  assert.deepEqual(
    prioritizeStoryAssetImageArtifacts(null, candidates).map((item) => item.id),
    ["artifact-newest-other", "artifact-current", "artifact-older"],
  );
});
