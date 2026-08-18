const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");

test("voxcpm2 tts provider is registered from the audio model slot", () => {
  const { ttsProviderRegistry } = require("../dist/services/drama/audio/TTSProviderPort.js");
  const providers = ttsProviderRegistry.listProviders();
  assert.equal(providers.some((item) => item.provider === "voxcpm2"), true);
});

test("audio speech synthesis follows the voxcpm2 speech protocol", async () => {
  const seen = [];
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      seen.push({
        url: req.url,
        auth: req.headers.authorization,
        body: JSON.parse(body),
      });
      res.setHeader("Content-Type", "audio/mpeg");
      res.end(Buffer.from("fake-mp3-bytes"));
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;

  try {
    const { synthesizeAudioSpeech } = require("../dist/services/audio/speechProvider.js");
    const result = await synthesizeAudioSpeech(
      {
        text: "测试台词。",
        audioType: "dialogue",
        speaker: "林月",
        emotion: "紧张",
      },
      {
        baseURL: `http://127.0.0.1:${port}/v1`,
        apiKey: "local-voxcpm2",
        model: "voxcpm2",
      },
    );

    assert.equal(seen.length, 1);
    assert.equal(seen[0].url, "/v1/audio/speech");
    assert.equal(seen[0].auth, "Bearer local-voxcpm2");
    assert.equal(seen[0].body.model, "voxcpm2");
    assert.equal(seen[0].body.input, "测试台词。");
    assert.equal(seen[0].body.metadata.audio_type, "dialogue");
    assert.equal(seen[0].body.metadata.speaker, "林月");
    assert.equal(seen[0].body.metadata.emotion_prompt, "紧张");
    assert.equal(seen[0].body.metadata.should_use_prompt_for_emotion, true);
    assert.equal(result.contentType, "audio/mpeg");
    assert.ok(result.byteLength > 0);
    assert.match(result.dataUrl, /^data:audio\/mpeg;base64,/);
  } finally {
    server.close();
  }
});

test("audio speech synthesis reports provider errors with message", async () => {
  const server = http.createServer((req, res) => {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.statusCode = 502;
    res.end(JSON.stringify({ error: "VoxCPM2 worker 未返回有效音频" }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;

  try {
    const { synthesizeAudioSpeech } = require("../dist/services/audio/speechProvider.js");
    await assert.rejects(
      synthesizeAudioSpeech(
        { text: "测试旁白。", audioType: "narration" },
        {
          baseURL: `http://127.0.0.1:${port}/v1`,
          apiKey: "local-voxcpm2",
          model: "voxcpm2",
        },
      ),
      /VoxCPM2 worker 未返回有效音频/,
    );
  } finally {
    server.close();
  }
});
