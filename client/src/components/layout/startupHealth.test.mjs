import test from "node:test";
import assert from "node:assert/strict";
import { probeStartupHealth } from "./startupHealth.ts";

test("startup probe reports a healthy local service", async () => {
  const result = await probeStartupHealth(
    "/api/health",
    new AbortController().signal,
    async () => new Response(JSON.stringify({ success: true }), { status: 200 }),
  );

  assert.deepEqual(result, { ready: true });
});

test("startup probe exposes an HTTP failure reason", async () => {
  const result = await probeStartupHealth(
    "/api/health",
    new AbortController().signal,
    async () => new Response("not found", { status: 404 }),
  );

  assert.deepEqual(result, {
    ready: false,
    diagnostic: "服务地址未提供健康检查（HTTP 404）。",
  });
});

test("startup probe distinguishes a service that is not responding", async () => {
  const result = await probeStartupHealth(
    "/api/health",
    new AbortController().signal,
    async () => {
      throw new TypeError("fetch failed");
    },
  );

  assert.deepEqual(result, {
    ready: false,
    diagnostic: "本地创作服务没有响应。",
  });
});
