const test = require("node:test");
const assert = require("node:assert/strict");
const { Readable } = require("node:stream");

const { sniffImageMimeType } = require("../dist/services/image/imageMimeType.js");
const { readBoundedRawBody } = require("../dist/middleware/rawBody.js");

test("图片魔数嗅探识别 PNG/JPEG/WebP 并拒绝伪装内容", () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
  const webp = Buffer.concat([
    Buffer.from("RIFF", "ascii"),
    Buffer.alloc(4),
    Buffer.from("WEBP", "ascii"),
  ]);
  assert.equal(sniffImageMimeType(png), "image/png");
  assert.equal(sniffImageMimeType(jpeg), "image/jpeg");
  assert.equal(sniffImageMimeType(webp), "image/webp");
  assert.equal(sniffImageMimeType(Buffer.from("<script>alert(1)</script>")), null);
  assert.equal(sniffImageMimeType(Buffer.alloc(0)), null);
});

test("原始请求体读取在超过上限时中断并返回 413", async () => {
  const small = Readable.from([Buffer.from("ab"), Buffer.from("cd")]);
  const buffer = await readBoundedRawBody(small, 4);
  assert.equal(buffer.toString("utf8"), "abcd");

  const oversized = Readable.from([Buffer.alloc(3), Buffer.alloc(3)]);
  await assert.rejects(
    () => readBoundedRawBody(oversized, 4),
    (error) => error.statusCode === 413,
  );
});
