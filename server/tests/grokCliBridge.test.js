const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const fsp = require("node:fs/promises");
const os = require("node:os");
const { fileURLToPath } = require("node:url");

const {
  buildGrokCliCommand,
  buildGrokPromptJson,
  buildGrokTranscript,
  materializeGrokPromptImages,
  parseGrokCliOutput,
  runGrokCli,
} = require("../../scripts/grok-cli-core.cjs");
const { createGrokCliBridgeServer } = require("../../scripts/grok-cli-bridge.cjs");

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve(server.address().port);
    });
  });
}

function close(server) {
  return new Promise((resolve) => server.close(() => resolve()));
}

async function withBridge(options, run) {
  const server = createGrokCliBridgeServer(options);
  const port = await listen(server);
  try {
    return await run(`http://127.0.0.1:${port}`);
  } finally {
    await close(server);
  }
}

test("Grok CLI command uses an argument array and the headless safety contract", () => {
  const args = buildGrokCliCommand({
    executable: "grok.exe",
    promptPath: "C:/temp/prompt with spaces.txt",
    model: "grok-4.6",
    reasoningEffort: "low",
    systemPrompt: "return JSON",
    schemaJson: '{"type":"object"}',
    cwd: "C:/temp/workdir",
  });

  assert.equal(args[0], "grok.exe");
  assert.ok(args.includes("--prompt-file"));
  assert.ok(args.includes("C:/temp/prompt with spaces.txt"));
  assert.deepEqual(args.slice(args.indexOf("--output-format"), args.indexOf("--tools") + 2), [
    "--output-format", "json", "--tools", "",
  ]);
  for (const flag of ["--verbatim", "--always-approve", "--no-plan", "--disable-web-search", "--no-subagents", "--no-memory"]) {
    assert.ok(args.includes(flag), `${flag} should be present`);
  }
  assert.ok(args.includes("--json-schema"));
  assert.ok(args.includes("--system-prompt-override"));
  assert.ok(args.includes("--cwd"));
});

test("Grok CLI transcript and output parsing preserve structured assistant content", () => {
  assert.match(buildGrokTranscript([
    { role: "system", content: "system rule" },
    { role: "user", content: "user request" },
    { role: "assistant", content: "assistant context" },
  ]), /\[system\][\s\S]*\[user\][\s\S]*\[assistant\]/);
  assert.equal(parseGrokCliOutput(JSON.stringify({ text: "answer" })), "answer");
  assert.equal(parseGrokCliOutput(JSON.stringify({ text: "```json\n{\"ok\":true}\n```" })), "```json\n{\"ok\":true}\n```");
  assert.equal(parseGrokCliOutput(`log\n${JSON.stringify({ text: "prefixed answer" })}\ntrailer`), "prefixed answer");
  assert.throws(() => parseGrokCliOutput(JSON.stringify({ text: "" })), /assistant message/i);
});

test("Grok CLI prompt JSON keeps image inputs as ACP resource links", () => {
  const prompt = JSON.parse(buildGrokPromptJson([
    { role: "system", content: "system rule" },
    {
      role: "user",
      content: [
        { type: "text", text: "识别图片中的固定家具" },
        { type: "image_url", image_url: { url: "data:image/png;base64,not-inline" } },
      ],
    },
  ], [
    {
      uri: "file:///C:/temp/grok-cli-bridge/input-image-1.png",
      name: "input-image-1.png",
      mimeType: "image/png",
    },
  ]));

  assert.deepEqual(prompt, [
    { type: "text", text: "[user]" },
    { type: "text", text: "识别图片中的固定家具" },
    {
      type: "resource_link",
      uri: "file:///C:/temp/grok-cli-bridge/input-image-1.png",
      name: "input-image-1.png",
      mimeType: "image/png",
    },
    { type: "text", text: "[/user]" },
  ]);
});

test("Grok CLI materializes inline image data outside the command line", async () => {
  const tempDir = await fsp.mkdtemp(`${os.tmpdir()}\\grok-cli-test-`);
  try {
    const imageData = Buffer.from("test-image-data");
    const references = await materializeGrokPromptImages([
      {
        role: "user",
        content: [{
          type: "image_url",
          image_url: { url: `data:image/png;base64,${imageData.toString("base64")}` },
        }],
      },
    ], tempDir);
    assert.equal(references.length, 1);
    assert.deepEqual(await fsp.readFile(fileURLToPath(references[0].uri)), imageData);

    const args = buildGrokCliCommand({
      executable: "grok.exe",
      promptJson: JSON.stringify([{ type: "resource_link", uri: references[0].uri }]),
      promptPath: "C:/temp/unused-prompt.txt",
      model: "grok-4.6",
    });
    assert.ok(args.includes("--prompt-json"));
    assert.ok(!args.includes("--prompt-file"));
    assert.ok(!args.some((value) => value.includes(imageData.toString("base64"))));
  } finally {
    await fsp.rm(tempDir, { recursive: true, force: true });
  }
});

test("Grok CLI execution switches to prompt-json for a multimodal request", async () => {
  let captured;
  const spawnImpl = (executable, args, options) => {
    captured = { executable, args, options };
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    process.nextTick(() => {
      child.stdout.emit("data", JSON.stringify({ text: '{"ok":true}' }));
      child.emit("close", 0);
    });
    return child;
  };
  const imageData = Buffer.from("test-image-data");
  const result = await runGrokCli({
    executable: "grok.exe",
    model: "grok-4.6",
    timeoutSeconds: 5,
    systemPrompt: "return JSON",
    messages: [{
      role: "user",
      content: [
        { type: "text", text: "识别图片" },
        { type: "image_url", image_url: { url: `data:image/png;base64,${imageData.toString("base64")}` } },
      ],
    }],
  }, { spawnImpl });

  assert.equal(result, '{"ok":true}');
  assert.equal(captured.executable, "grok.exe");
  assert.ok(captured.args.includes("--prompt-json"));
  assert.ok(!captured.args.includes("--prompt-file"));
  assert.ok(!captured.args.some((value) => value.includes(imageData.toString("base64"))));
  assert.equal(captured.options.cwd.startsWith(os.tmpdir()), true);
});

test("Grok CLI bridge rejects requests without its local bearer", async () => {
  await withBridge({
    apiKey: "test-grok-token",
    execute: async () => "ignored",
  }, async (baseURL) => {
    const response = await fetch(`${baseURL}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "grok-cli/grok-4.6",
        messages: [{ role: "user", content: "hello" }],
      }),
    });
    assert.equal(response.status, 401);
  });
});

test("Grok CLI bridge maps schema output into a standard completion", async () => {
  await withBridge({
    apiKey: "test-grok-token",
    execute: async (input) => {
      assert.equal(input.model, "grok-cli/grok-4.6");
      assert.equal(input.schema.type, "object");
      return '{"answer":"ok"}';
    },
  }, async (baseURL) => {
    const response = await fetch(`${baseURL}/v1/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: "Bearer test-grok-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "grok-cli/grok-4.6",
        messages: [{ role: "user", content: "return the answer" }],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "answer",
            strict: true,
            schema: { type: "object", properties: { answer: { type: "string" } } },
          },
        },
      }),
    });
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.choices[0].message.content, '{"answer":"ok"}');
    assert.equal(payload.choices[0].finish_reason, "stop");
  });
});

test("Grok CLI bridge maps a structured tool envelope into a registered tool call", async () => {
  await withBridge({
    apiKey: "test-grok-token",
    execute: async () => JSON.stringify({
      __grok_tool_call__: { name: "save_note", arguments: { note: "ok" } },
    }),
  }, async (baseURL) => {
    const response = await fetch(`${baseURL}/v1/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: "Bearer test-grok-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "grok-cli/grok-4.6",
        messages: [{ role: "user", content: "save it" }],
        tools: [{ type: "function", function: { name: "save_note", parameters: { type: "object" } } }],
        tool_choice: { type: "function", function: { name: "save_note" } },
      }),
    });
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.choices[0].finish_reason, "tool_calls");
    assert.equal(payload.choices[0].message.tool_calls[0].function.name, "save_note");
    assert.equal(payload.choices[0].message.tool_calls[0].function.arguments, '{"note":"ok"}');
  });
});

test("Grok CLI bridge translates a one-shot result into compatible SSE", async () => {
  await withBridge({
    apiKey: "test-grok-token",
    execute: async () => "streamed answer",
  }, async (baseURL) => {
    const response = await fetch(`${baseURL}/v1/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: "Bearer test-grok-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "grok-cli/grok-4.6",
        messages: [{ role: "user", content: "hello" }],
        stream: true,
        stream_options: { include_usage: true },
      }),
    });
    assert.equal(response.status, 200);
    const body = await response.text();
    assert.match(body, /chat\.completion\.chunk/);
    assert.match(body, /streamed answer/);
    assert.match(body, /finish_reason/);
    assert.match(body, /usage/);
    assert.match(body, /data: \[DONE\]/);
  });
});
