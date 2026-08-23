import test from "node:test";
import assert from "node:assert/strict";
import {
  AUTO_STORY_ASSET_IMAGE_CONCURRENCY,
  getDefaultStoryAssetState,
  getMissingStoryAssetImageTasks,
  runWithConcurrency,
  storyAssetImageTaskKey,
} from "../src/pages/novels/components/storySettings/autoStoryAssetImages.ts";

function asset(id, states) {
  return { id, states };
}

function state(id, label, image) {
  return { id, label, imagePrompt: `${id} prompt`, image };
}

test("默认状态优先于状态数组顺序", () => {
  const states = [state("hurt", "受伤"), state("default", "默认")];

  assert.equal(getDefaultStoryAssetState(asset("character-1", states))?.id, "default");
  assert.equal(getDefaultStoryAssetState(asset("character-2", [state("first", "初始")]))?.id, "first");
  assert.equal(getDefaultStoryAssetState(asset("empty", [])), undefined);
});

test("只为缺图默认状态生成任务，并跳过生成中或已经完成的状态", () => {
  const assets = [
    asset("idle", [state("idle-state", "默认")]),
    asset("done", [state("done-state", "默认", { status: "done", url: "/done.png" })]),
    asset("generating", [state("generating-state", "默认", { status: "generating" })]),
    asset("error", [state("error-state", "默认", { status: "error", error: "网关超时" })]),
    asset("other-state", [state("other", "其他"), state("first", "初始")]),
  ];

  const tasks = getMissingStoryAssetImageTasks("character", assets);

  assert.deepEqual(tasks.map((task) => [task.assetId, task.stateId]), [
    ["idle", "idle-state"],
    ["error", "error-state"],
    ["other-state", "other"],
  ]);
  assert.equal(tasks[0].key, storyAssetImageTaskKey("character", "idle", "idle-state"));
});

test("同一页面会话不会重复自动重试已经尝试过的错误状态", () => {
  const assets = [asset("error", [state("error-state", "默认", { status: "error" })])];
  const attempted = new Set([storyAssetImageTaskKey("character", "error", "error-state")]);

  assert.deepEqual(getMissingStoryAssetImageTasks("character", assets, attempted), []);
});

test("自动补图调度器最多保持三路并发并处理全部任务", async () => {
  const items = ["a", "b", "c", "d", "e", "f"];
  let active = 0;
  let maximumActive = 0;
  const completed = [];

  await runWithConcurrency(items, AUTO_STORY_ASSET_IMAGE_CONCURRENCY, async (item) => {
    active += 1;
    maximumActive = Math.max(maximumActive, active);
    await new Promise((resolve) => setTimeout(resolve, item === "a" ? 12 : 2));
    completed.push(item);
    active -= 1;
  });

  assert.equal(maximumActive, AUTO_STORY_ASSET_IMAGE_CONCURRENCY);
  assert.deepEqual([...completed].sort(), [...items].sort());
});
