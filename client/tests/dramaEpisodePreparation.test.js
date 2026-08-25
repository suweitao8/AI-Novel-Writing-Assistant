import assert from "node:assert/strict";
import test from "node:test";
import { prepareDramaEpisodeAssets } from "../src/pages/drama/comicDrama/dramaEpisodePreparation.ts";

test("分镜画面和配音批量任务并发启动，并在完成后返回终态", async () => {
  const started = [];
  const result = await prepareDramaEpisodeAssets({
    tasks: [
      { type: "keyframes", start: async () => { started.push("keyframes"); return "keyframes-1"; } },
      { type: "tts", start: async () => { started.push("tts"); return "tts-1"; } },
    ],
    getJobs: async () => [
      { id: "keyframes-1", status: "done" },
      { id: "tts-1", status: "done" },
    ],
    pollIntervalMs: 0,
  });

  assert.deepEqual(started.sort(), ["keyframes", "tts"]);
  assert.deepEqual(result, { keyframes: "done", tts: "done" });
});

test("已有批量任务只等待，不重复创建", async () => {
  let startCalls = 0;
  const result = await prepareDramaEpisodeAssets({
    tasks: [
      { type: "keyframes", jobId: "keyframes-existing", start: async () => { startCalls += 1; return "unexpected"; } },
    ],
    getJobs: async () => [{ id: "keyframes-existing", status: "done" }],
    pollIntervalMs: 0,
  });

  assert.equal(startCalls, 0);
  assert.deepEqual(result, { keyframes: "done" });
});

test("准备任务失败时阻止继续进入合成", async () => {
  await assert.rejects(
    prepareDramaEpisodeAssets({
      tasks: [{ type: "tts", start: async () => "tts-failed" }],
      getJobs: async () => [{ id: "tts-failed", status: "failed" }],
      pollIntervalMs: 0,
    }),
    /配音任务失败/,
  );
});
