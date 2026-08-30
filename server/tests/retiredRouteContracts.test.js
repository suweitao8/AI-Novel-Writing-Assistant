const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { createApp } = require("../dist/app.js");

async function startServer() {
  const server = http.createServer(createApp());
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new Error("无法获取临时测试端口。");
  }
  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
}

test("retired astrology and legacy chat routes return the standard not-found response", async () => {
  const { server, baseUrl } = await startServer();
  try {
    for (const path of ["/api/astrology", "/api/chat"]) {
      const response = await fetch(`${baseUrl}${path}`);
      const payload = await response.json();

      assert.equal(response.status, 404);
      assert.deepEqual(payload, {
        success: false,
        error: "接口不存在。",
      });
    }
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
