const test = require("node:test");
const assert = require("node:assert/strict");

const { buildAgentPrompt, parseMultipart } = require("./codex-image-bridge.cjs");

function multipartBody() {
  const boundary = "----codex-reference-test";
  const parts = [
    `--${boundary}\r\nContent-Disposition: form-data; name="reference_labels"\r\n\r\n["叶晨","叶竹","场景"]\r\n`,
    `--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="one.png"\r\nContent-Type: image/png\r\n\r\none\r\n`,
    `--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="two.png"\r\nContent-Type: image/png\r\n\r\ntwo\r\n`,
    `--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="three.png"\r\nContent-Type: image/png\r\n\r\nthree\r\n`,
    `--${boundary}--`,
  ];
  return {
    contentType: `multipart/form-data; boundary=${boundary}`,
    body: Buffer.from(parts.join(""), "utf8"),
  };
}

test("multipart bridge keeps every image part and labels them in order", () => {
  const input = multipartBody();
  const parsed = parseMultipart(input.contentType, input.body);
  assert.equal(parsed.files.length, 3);
  assert.deepEqual(JSON.parse(parsed.fields.reference_labels), ["叶晨", "叶竹", "场景"]);
  const prompt = buildAgentPrompt({
    hasReferences: true,
    referenceLabels: ["叶晨", "叶竹", "场景"],
    aspectRatio: "16:9",
    imageSize: "1K",
    prompt: "分镜首帧",
  });
  assert.match(prompt, /1\. 叶晨/);
  assert.match(prompt, /2\. 叶竹/);
  assert.match(prompt, /3\. 场景/);
});
