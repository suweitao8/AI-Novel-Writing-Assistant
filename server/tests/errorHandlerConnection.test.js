const test = require("node:test");
const assert = require("node:assert/strict");

test("上游连接拒绝时显示实际本地桥接地址", () => {
  const { errorHandler } = require("../dist/middleware/errorHandler.js");
  const response = {
    locals: {},
    statusCode: 0,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
  const error = new TypeError("fetch failed");
  error.cause = { code: "ECONNREFUSED", address: "127.0.0.1", port: 18761 };

  errorHandler(error, { method: "POST", originalUrl: "/api/settings/narrator-voice/design" }, response, () => {});

  assert.equal(response.statusCode, 502);
  assert.match(response.body.error, /127\.0\.0\.1:18761/);
});
