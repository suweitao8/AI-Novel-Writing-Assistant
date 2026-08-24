const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");

test("IndexTTS 2.5 provider is registered from the audio model slot", () => {
  const { ttsProviderRegistry } = require("../dist/services/drama/audio/TTSProviderPort.js");
  const providers = ttsProviderRegistry.listProviders();
  assert.equal(providers.some((item) => item.provider === "indextts25"), true);
  assert.equal(providers.some((item) => item.provider === "voxcpm2"), false);
});

function withIndexTTSRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "index-tts-25-test-"));
  const voices = path.join(root, "voices");
  fs.mkdirSync(voices, { recursive: true });
  fs.writeFileSync(path.join(voices, "测试参考音频.mp3"), Buffer.from("default-reference"));
  const previous = process.env.INDEXTTS25_ROOT;
  process.env.INDEXTTS25_ROOT = root;
  return {
    root,
    restore() {
      if (previous === undefined) delete process.env.INDEXTTS25_ROOT;
      else process.env.INDEXTTS25_ROOT = previous;
      fs.rmSync(root, { recursive: true, force: true });
    },
  };
}

test("audio speech synthesis follows the IndexTTS 2.5 /tts protocol and caches references", async () => {
  const fixture = withIndexTTSRoot();
  const seen = [];
  const server = http.createServer((req, res) => {
    if (req.url === "/health") {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ status: "ok", model_loaded: false, qwen_emo: true }));
      return;
    }
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      seen.push({ url: req.url, auth: req.headers.authorization, body: JSON.parse(body) });
      res.setHeader("Content-Type", "audio/wav");
      res.end(Buffer.from("fake-wav-bytes"));
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
        speed: 1.25,
        emotion: "紧张",
        referenceAudioUrl: "data:audio/mpeg;base64,cmVm",
      },
      {
        baseURL: `http://127.0.0.1:${port}`,
        apiKey: "local-indextts25",
        model: "index-tts-2.5",
      },
    );

    assert.equal(seen.length, 1);
    assert.equal(seen[0].url, "/tts");
    assert.equal(seen[0].auth, "Bearer local-indextts25");
    assert.equal(seen[0].body.speaker, "default");
    assert.match(seen[0].body.audio, /^app-[a-f0-9]{32}\.mp3$/);
    assert.equal(seen[0].body.text, "测试台词。");
    assert.equal(seen[0].body.lang, "ZH");
    assert.equal(seen[0].body.duration_factor, 0.8);
    assert.equal(seen[0].body.emo_control_method, 3);
    assert.equal(seen[0].body.emo_text, "紧张");
    assert.equal(seen[0].body.return_type, "file");
    assert.equal(result.contentType, "audio/wav");
    assert.ok(result.byteLength > 0);
    assert.match(result.dataUrl, /^data:audio\/wav;base64,/);
    assert.equal(fs.existsSync(path.join(fixture.root, "voices", seen[0].body.audio)), true);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    fixture.restore();
  }
});

test("IndexTTS 2.5 uses an explicit trained speaker instead of the drama character name", () => {
  const { buildIndexTTS25Request } = require("../dist/services/audio/indexTTS25.js");
  const request = buildIndexTTS25Request(
    {
      text: "角色台词。",
      speaker: "叶竹",
      indexTTS25Speaker: "ye-zhu-lora",
    },
    "reference.mp3",
    null,
  );
  assert.equal(request.speaker, "ye-zhu-lora");
});

test("IndexTTS 2.5 reference assets are content-addressed and never overwritten", async () => {
  const fixture = withIndexTTSRoot();
  try {
    const { persistIndexTTS25ReferenceAudio } = require("../dist/services/audio/indexTTS25.js");
    const first = await persistIndexTTS25ReferenceAudio("data:audio/mpeg;base64,c2FtcGxlLXZvaWNl");
    const second = await persistIndexTTS25ReferenceAudio("data:audio/mpeg;base64,c2FtcGxlLXZvaWNl");
    assert.equal(first, second);
    assert.match(first, /^app-[a-f0-9]{32}\.mp3$/);
    assert.deepEqual(fs.readFileSync(path.join(fixture.root, "voices", first)), Buffer.from("sample-voice"));
  } finally {
    fixture.restore();
  }
});

test("IndexTTS 2.5 reference persistence rejects remote URLs and arbitrary local paths", async () => {
  const { persistIndexTTS25ReferenceAudio } = require("../dist/services/audio/indexTTS25.js");
  await assert.rejects(
    persistIndexTTS25ReferenceAudio("https://example.com/private.mp3"),
    /只能使用音频 data URL 或 IndexTTS 音色库中的文件名/,
  );
  await assert.rejects(
    persistIndexTTS25ReferenceAudio("C:\\private\\voice.mp3"),
    /只能使用音频 data URL 或 IndexTTS 音色库中的文件名/,
  );
});

test("IndexTTS 2.5 catalog exposes speakers and references without leaking the server path", async () => {
  const server = http.createServer((req, res) => {
    res.setHeader("Content-Type", "application/json");
    if (req.url === "/health") {
      res.end(JSON.stringify({ status: "ok", model_loaded: true, qwen_emo: true }));
      return;
    }
    if (req.url === "/speakers") {
      res.end(JSON.stringify({ speakers: ["default", "ye-zhu-lora"] }));
      return;
    }
    if (req.url === "/voices") {
      res.end(JSON.stringify({ voices: ["测试参考音频.mp3", "app-voice.mp3"], dir: "D:\\\\private\\\\voices" }));
      return;
    }
    res.statusCode = 404;
    res.end(JSON.stringify({ detail: "not found" }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const { listIndexTTS25Catalog } = require("../dist/services/audio/indexTTS25.js");
    const catalog = await listIndexTTS25Catalog(`http://127.0.0.1:${server.address().port}`, 1000);
    assert.equal(catalog.available, true);
    assert.deepEqual(catalog.speakers, ["default", "ye-zhu-lora"]);
    assert.deepEqual(catalog.referenceVoices, ["测试参考音频.mp3", "app-voice.mp3"]);
    assert.equal(Object.hasOwn(catalog, "dir"), false);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("IndexTTS 2.5 falls back to reference-audio emotion mode when QwenEmotion is unavailable", async () => {
  const fixture = withIndexTTSRoot();
  const server = http.createServer((req, res) => {
    if (req.url === "/health") {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ status: "ok", model_loaded: false, qwen_emo: false }));
      return;
    }
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      const payload = JSON.parse(body);
      assert.equal(payload.emo_control_method, 0);
      assert.equal(Object.hasOwn(payload, "emo_text"), false);
      res.setHeader("Content-Type", "audio/wav");
      res.end(Buffer.from("fake-wav-bytes"));
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const { synthesizeAudioSpeech } = require("../dist/services/audio/speechProvider.js");
    await synthesizeAudioSpeech(
      { text: "测试旁白。", audioType: "narration", emotion: "平静" },
      { baseURL: `http://127.0.0.1:${server.address().port}`, apiKey: "local-indextts25", model: "index-tts-2.5" },
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
    fixture.restore();
  }
});

test("IndexTTS 2.5 errors preserve the service detail", async () => {
  const fixture = withIndexTTSRoot();
  const server = http.createServer((req, res) => {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.statusCode = 500;
    res.end(JSON.stringify({ detail: "模型显存不足" }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const { synthesizeAudioSpeech } = require("../dist/services/audio/speechProvider.js");
    await assert.rejects(
      synthesizeAudioSpeech(
        { text: "测试旁白。", audioType: "narration" },
        { baseURL: `http://127.0.0.1:${server.address().port}`, apiKey: "local-indextts25", model: "index-tts-2.5" },
      ),
      /模型显存不足/,
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
    fixture.restore();
  }
});
