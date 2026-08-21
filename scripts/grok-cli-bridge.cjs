"use strict";

const http = require("node:http");
const { randomUUID } = require("node:crypto");
const {
  DEFAULT_GROK_CLI_API_KEY,
  DEFAULT_GROK_CLI_MODEL,
  DEFAULT_GROK_CLI_TIMEOUT_SECONDS,
  extractOutputSchema,
  findLongestJsonValue,
  isGrokCliAvailable,
  runGrokCli,
} = require("./grok-cli-core.cjs");

const DEFAULT_HOST = process.env.GROK_CLI_BRIDGE_HOST || "0.0.0.0";
const DEFAULT_PORT = Number(process.env.GROK_CLI_BRIDGE_PORT || 18764);
const MAX_REQUEST_BYTES = 32 * 1024 * 1024;

function errorPayload(message, type = "invalid_request_error") {
  return { error: { message, type } };
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const contentLength = Number(req.headers["content-length"] || "");
    if (!Number.isFinite(contentLength) || contentLength <= 0) {
      reject({ status: 400, message: "invalid_content_length" });
      return;
    }
    if (contentLength > MAX_REQUEST_BYTES) {
      reject({ status: 413, message: "request_too_large" });
      return;
    }
    const chunks = [];
    let received = 0;
    req.on("data", (chunk) => {
      received += chunk.length;
      if (received > MAX_REQUEST_BYTES) {
        reject({ status: 413, message: "request_too_large" });
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        reject({ status: 400, message: "invalid_json" });
      }
    });
    req.on("error", () => reject({ status: 400, message: "invalid_json" }));
  });
}

function responseText(value) {
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

function toolNames(body) {
  return new Set((Array.isArray(body?.tools) ? body.tools : [])
    .map((tool) => tool?.function?.name)
    .filter((name) => typeof name === "string" && name.trim())
    .map((name) => name.trim()));
}

function forcedToolName(body) {
  const choice = body?.tool_choice;
  return typeof choice === "object" && choice?.function?.name
    ? String(choice.function.name).trim()
    : "";
}

function resolveToolCall(body, text) {
  const parsed = findLongestJsonValue(text);
  const envelope = parsed && typeof parsed === "object" && parsed.__grok_tool_call__;
  let name = envelope && typeof envelope === "object" ? String(envelope.name || "").trim() : "";
  let argumentsValue = envelope && typeof envelope === "object" ? envelope.arguments ?? {} : parsed;
  const forced = forcedToolName(body);
  if (forced) {
    name = forced;
    argumentsValue = parsed && typeof parsed === "object" && parsed.__grok_tool_call__
      ? parsed.__grok_tool_call__.arguments ?? {}
      : parsed;
  }
  if (!name && Array.isArray(body?.tools) && body.tools.length > 0 && parsed !== undefined) {
    name = String(body.tools[0]?.function?.name || "").trim();
  }
  if (!name) return null;
  const known = toolNames(body);
  if (!known.has(name)) {
    throw Object.assign(new Error("Grok CLI 返回了未注册的工具。"), { status: 502 });
  }
  return {
    id: `call_grok_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    type: "function",
    function: {
      name,
      arguments: JSON.stringify(argumentsValue ?? {}),
    },
  };
}

function buildCompletion(text, body, model) {
  const toolCall = resolveToolCall(body, text);
  const created = Math.floor(Date.now() / 1000);
  const message = toolCall
    ? { role: "assistant", content: null, tool_calls: [toolCall] }
    : { role: "assistant", content: responseText(text) };
  return {
    id: `chatcmpl-grok-${randomUUID().replace(/-/g, "").slice(0, 20)}`,
    object: "chat.completion",
    created,
    model,
    choices: [{
      index: 0,
      message,
      finish_reason: toolCall ? "tool_calls" : "stop",
    }],
    usage: {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
    },
  };
}

function sseChunk(payload) {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

function sendSseChatCompletion(res, payload, includeUsage) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  const base = {
    id: payload.id,
    object: "chat.completion.chunk",
    created: payload.created,
    model: payload.model,
  };
  const choice = payload.choices[0];
  const firstDelta = choice.message.tool_calls
    ? { role: "assistant", tool_calls: choice.message.tool_calls.map((call, index) => ({ index, ...call })) }
    : { role: "assistant", content: choice.message.content ?? "" };
  res.write(sseChunk({ ...base, choices: [{ index: 0, delta: firstDelta, finish_reason: null }] }));
  res.write(sseChunk({ ...base, choices: [{ index: 0, delta: {}, finish_reason: choice.finish_reason }] }));
  if (includeUsage) {
    res.write(sseChunk({ ...base, choices: [], usage: payload.usage }));
  }
  res.write("data: [DONE]\n\n");
  res.end();
}

function parseArgs(argv) {
  const args = {
    host: DEFAULT_HOST,
    port: DEFAULT_PORT,
    model: process.env.GROK_CLI_MODEL || "grok-cli/grok-4.6",
    apiKey: process.env.GROK_CLI_API_KEY || DEFAULT_GROK_CLI_API_KEY,
    timeoutSeconds: Number(process.env.GROK_CLI_TIMEOUT_SECONDS || DEFAULT_GROK_CLI_TIMEOUT_SECONDS),
    cliPath: process.env.GROK_CLI_PATH || "",
  };
  for (let index = 2; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];
    if (value === undefined) throw new Error(`缺少参数值：${key}`);
    switch (key) {
      case "--host": args.host = value; index += 1; break;
      case "--port": args.port = Number(value); index += 1; break;
      case "--model": args.model = value; index += 1; break;
      case "--api-key": args.apiKey = value; index += 1; break;
      case "--timeout-seconds": args.timeoutSeconds = Number(value); index += 1; break;
      case "--cli-path": args.cliPath = value; index += 1; break;
      default: throw new Error(`未知参数：${key}`);
    }
  }
  return args;
}

function createGrokCliBridgeServer(options = {}) {
  const config = {
    model: options.model || "grok-cli/grok-4.6",
    apiKey: options.apiKey || DEFAULT_GROK_CLI_API_KEY,
    timeoutSeconds: options.timeoutSeconds || DEFAULT_GROK_CLI_TIMEOUT_SECONDS,
    cliPath: options.cliPath,
    execute: options.execute || ((input) => runGrokCli({
      ...input,
      timeoutSeconds: config.timeoutSeconds,
      executable: config.cliPath,
    })),
  };

  return http.createServer(async (req, res) => {
    const pathname = (req.url || "/").split("?")[0];
    const sendJson = (status, payload) => {
      const body = JSON.stringify(payload);
      res.writeHead(status, {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Length": Buffer.byteLength(body),
      });
      res.end(body);
    };

    if (req.method === "GET" && pathname === "/health") {
      sendJson(200, {
        ready: isGrokCliAvailable(config.cliPath),
        provider: "grok-cli",
        model: config.model,
        subscription: true,
      });
      return;
    }
    if (req.method === "GET" && pathname === "/v1/models") {
      sendJson(200, {
        object: "list",
        data: [{ id: config.model, object: "model", owned_by: "grok-cli" }],
      });
      return;
    }
    if (req.method !== "POST" || pathname !== "/v1/chat/completions") {
      sendJson(404, errorPayload("not_found"));
      return;
    }
    const authorization = String(req.headers.authorization || "");
    if (authorization !== `Bearer ${config.apiKey}`) {
      sendJson(401, errorPayload("invalid_api_key", "authentication_error"));
      return;
    }

    try {
      const body = await readJsonBody(req);
      if (!Array.isArray(body?.messages) || body.messages.length === 0) {
        sendJson(400, errorPayload("messages is required"));
        return;
      }
      const systemPrompt = body.messages
        .filter((message) => message?.role === "system")
        .map((message) => String(message.content || ""))
        .filter(Boolean)
        .join("\n\n");
      const transcript = require("./grok-cli-core.cjs").buildGrokTranscript(body.messages);
      const schema = extractOutputSchema(body);
      const text = await config.execute({
        body,
        model: body.model || config.model,
        messages: body.messages,
        systemPrompt,
        transcript,
        schema,
      });
      const payload = buildCompletion(responseText(text), body, body.model || config.model);
      if (body.stream === true) {
        const includeUsage = body.stream_options?.include_usage === true;
        sendSseChatCompletion(res, payload, includeUsage);
        return;
      }
      sendJson(200, payload);
    } catch (error) {
      const status = Number(error?.status) || Number(error?.statusCode) || 502;
      sendJson(status, errorPayload(error?.message || String(error), status >= 500 ? "upstream_error" : "invalid_request_error"));
    }
  });
}

function main() {
  const args = parseArgs(process.argv);
  const server = createGrokCliBridgeServer(args);
  server.listen(args.port, args.host, () => {
    console.log(`[grok-cli-bridge] listening on http://${args.host}:${args.port}/v1 model=${args.model}`);
  });
}

if (require.main === module) {
  main();
}

module.exports = {
  MAX_REQUEST_BYTES,
  buildCompletion,
  createGrokCliBridgeServer,
  errorPayload,
  parseArgs,
  sendSseChatCompletion,
};
