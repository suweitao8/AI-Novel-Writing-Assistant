import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_TTS_SYNTHESIS_CONCURRENCY,
  MAX_TTS_SYNTHESIS_CONCURRENCY,
  MIN_TTS_SYNTHESIS_CONCURRENCY,
  SingleFlightMap,
  TtsSynthesisGate,
  normalizeTtsSynthesisConcurrency,
} from "../dist/services/drama/audio/ttsSynthesisQueue.js";

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test("合成闸门默认 3 路，可调范围收敛到 1 到 8", () => {
  assert.equal(MIN_TTS_SYNTHESIS_CONCURRENCY, 1);
  assert.equal(MAX_TTS_SYNTHESIS_CONCURRENCY, 8);
  assert.equal(DEFAULT_TTS_SYNTHESIS_CONCURRENCY, 3);
  assert.equal(normalizeTtsSynthesisConcurrency(undefined), DEFAULT_TTS_SYNTHESIS_CONCURRENCY);
  assert.equal(normalizeTtsSynthesisConcurrency(null), DEFAULT_TTS_SYNTHESIS_CONCURRENCY);
  assert.equal(normalizeTtsSynthesisConcurrency("  "), DEFAULT_TTS_SYNTHESIS_CONCURRENCY);
  assert.equal(normalizeTtsSynthesisConcurrency("abc"), DEFAULT_TTS_SYNTHESIS_CONCURRENCY);
  assert.equal(normalizeTtsSynthesisConcurrency(0), 1);
  assert.equal(normalizeTtsSynthesisConcurrency(-3), 1);
  assert.equal(normalizeTtsSynthesisConcurrency(2.9), 2);
  assert.equal(normalizeTtsSynthesisConcurrency(99), MAX_TTS_SYNTHESIS_CONCURRENCY);
});

test("全局闸门限制同时在途的合成请求，任务全部完成", async () => {
  const gate = new TtsSynthesisGate(2);
  let active = 0;
  let maxActive = 0;
  const results = await Promise.all(Array.from({ length: 6 }, (_, index) =>
    gate.run(async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      try {
        await delay(6);
      } finally {
        active -= 1;
      }
      return index;
    })));
  assert.deepEqual(results, [0, 1, 2, 3, 4, 5]);
  assert.equal(maxActive, 2);
  assert.equal(active, 0);
});

test("闸门内单任务失败只影响自身，其余排队任务继续执行", async () => {
  const gate = new TtsSynthesisGate(1);
  await assert.rejects(
    gate.run(async () => {
      throw new Error("synthesis failed");
    }),
    /synthesis failed/,
  );
  const outcome = await gate.run(async () => "next");
  assert.equal(outcome, "next");
});

test("同分镜重复触发合并为一次执行且共享结果", async () => {
  const singleFlight = new SingleFlightMap();
  let starts = 0;
  const first = singleFlight.run("shot_1", async () => {
    starts += 1;
    await delay(10);
    return { status: "done", lines: 3 };
  });
  const second = singleFlight.run("shot_1", async () => ({ status: "should-not-run" }));
  assert.ok(singleFlight.has("shot_1"));
  assert.equal(starts, 1);
  const [a, b] = await Promise.all([first, second]);
  assert.deepEqual(a, { status: "done", lines: 3 });
  assert.equal(b, a);

  // 落定后允许重新触发新一轮合成。
  await first.catch(() => undefined);
  await delay(0);
  assert.ok(!singleFlight.has("shot_1"));
  const third = await singleFlight.run("shot_1", async () => {
    starts += 1;
    return { status: "done", lines: 4 };
  });
  assert.equal(starts, 2);
  assert.deepEqual(third, { status: "done", lines: 4 });
});

test("在途合并的失败结果由所有触发方共同感知，失败后可立即重试", async () => {
  const singleFlight = new SingleFlightMap();
  let attempt = 0;
  const runOnce = () => singleFlight.run("shot_1", async () => {
    attempt += 1;
    if (attempt === 1) {
      throw new Error("voice bridge unavailable");
    }
    return { status: "done" };
  });
  const first = runOnce();
  const second = runOnce();
  await assert.rejects(first, /voice bridge unavailable/);
  await assert.rejects(second, /voice bridge unavailable/);
  const retried = await runOnce();
  assert.deepEqual(retried, { status: "done" });
});
