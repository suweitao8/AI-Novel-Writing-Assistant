const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildGrokCliCommand,
  buildGrokTranscript,
  parseGrokCliOutput,
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
