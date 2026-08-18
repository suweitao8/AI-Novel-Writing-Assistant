#!/usr/bin/env node
// OpenCode Go 文本模型本地桥接：把 OpenAI 兼容请求翻译成本地 OpenCode 无头服务调用。
// 移植自 mydrama 项目的 scripts/opencode_go_bridge.py + src/novelvideo/opencode_go.py，
// 协议保持一致，方便两个项目共用同一个本地 OpenCode 会话。
//
// 上游契约（opencode serve）：
//   GET  /global/health?directory=<abs>
//   POST /session                      -> { id }
//   POST /session/{id}/message         -> { parts: [{ type: "text", text }] }
//   DELETE /session/{id}
// 桥接对外暴露：
//   GET  /health                       -> { ready, provider, model, upstream }
//   GET  /v1/models                    -> OpenAI 模型列表（只有桥接配置的那一个模型）
//   POST /v1/chat/completions          -> OpenAI chat completion；stream:true 时上游仍是
//                                        一次性生成，桥接把完整结果按 SSE 分片下发，
//                                        这样 invoke / stream 两类客户端都能用。

"use strict";

const http = require("node:http");
const { randomUUID } = require("node:crypto");

const DEFAULT_BRIDGE_HOST = "127.0.0.1";
const DEFAULT_BRIDGE_PORT = 18762;
const DEFAULT_OPENCODE_URL = "http://127.0.0.1:18763";
const DEFAULT_OPENCODE_MODEL = "opencode-go/mimo-v2.5";
const DEFAULT_OPENCODE_API_KEY = "local-opencode-go";
const DEFAULT_OPENCODE_AGENT = "novel-text";
const DEFAULT_OPENCODE_VARIANT = "none";
const DEFAULT_TIMEOUT_SECONDS = 300;
const MAX_REQUEST_BYTES = 16 * 1024 * 1024;
// 会话接口偶尔在并发下丢失刚创建的 session（"Session not found" / HTTP 404），
// 用全新 session 重试最多 3 次再放弃。
const SESSION_RETRY_LIMIT = 3;

class OpenCodeGoError extends Error {}

function parseArgs(argv) {
  const args = {
    host: process.env.OPENCODE_TEXT_BRIDGE_HOST || DEFAULT_BRIDGE_HOST,
    port: Number(process.env.OPENCODE_TEXT_BRIDGE_PORT || DEFAULT_BRIDGE_PORT),
    opencodeUrl: process.env.OPENCODE_SERVER_URL || DEFAULT_OPENCODE_URL,
    directory: process.env.OPENCODE_PROJECT_DIR || process.cwd(),
    apiKey: process.env.OPENCODE_TEXT_API_KEY || DEFAULT_OPENCODE_API_KEY,
    model: process.env.OPENCODE_TEXT_MODEL || DEFAULT_OPENCODE_MODEL,
    timeoutSeconds: Number(process.env.OPENCODE_TEXT_TIMEOUT_SECONDS || DEFAULT_TIMEOUT_SECONDS),
  };
  for (let i = 2; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];
    if (value === undefined) {
      throw new Error(`缺少参数值：${key}`);
    }
    switch (key) {
      case "--host": args.host = value; i += 1; break;
      case "--port": args.port = Number(value); i += 1; break;
      case "--opencode-url": args.opencodeUrl = value; i += 1; break;
      case "--directory": args.directory = value; i += 1; break;
      case "--api-key": args.apiKey = value; i += 1; break;
      case "--model": args.model = value; i += 1; break;
      case "--timeout-seconds": args.timeoutSeconds = Number(value); i += 1; break;
      default:
        throw new Error(`未知参数：${key}`);
    }
  }
  return args;
}

function parseOpenCodeModel(model) {
  let normalized = String(model || "").trim();
  if (normalized.startsWith("openai/")) {
    normalized = normalized.slice("openai/".length);
  }
  const separatorIndex = normalized.indexOf("/");
  if (separatorIndex <= 0 || separatorIndex === normalized.length - 1) {
    throw new Error(
      "OpenCode 模型必须使用 provider/model 格式，例如 opencode-go/mimo-v2.5",
    );
  }
  const providerId = normalized.slice(0, separatorIndex);
  const modelId = normalized.slice(separatorIndex + 1);
  if (providerId !== "opencode-go") {
    throw new Error(`只允许 OpenCode Go 供应商，收到 ${JSON.stringify(providerId)}`);
  }
  return { providerId, modelId };
}

function contentToText(content) {
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    const chunks = [];
    for (const item of content) {
      if (typeof item === "string") {
        chunks.push(item);
      } else if (item && typeof item === "object") {
        const type = item.type ?? "text";
        if (type === "text" || type === "input_text" || type === null) {
          const value = item.text ?? item.content;
          if (value !== undefined && value !== null) {
            chunks.push(String(value));
          }
        } else if (type === "image_url" || type === "input_image") {
          chunks.push("[image input omitted from text-only OpenCode Go route]");
        }
      }
    }
    return chunks.join("\n");
  }
  if (content === undefined || content === null) {
    return "";
  }
  return String(content);
}

function renderMessage(message) {
  const role = String(message.role || "user").trim().toLowerCase();
  const name = String(message.name || "").trim();
  let label = name ? `${role}/${name}` : role;
  let content = contentToText(message.content);
  if (role === "tool") {
    const toolCallId = String(message.tool_call_id || "").trim();
    label = toolCallId ? `tool/${toolCallId}` : "tool";
  }
  if (role === "assistant" && Array.isArray(message.tool_calls) && message.tool_calls.length > 0) {
    content = `${content}\n[previous tool calls]\n${JSON.stringify(message.tool_calls)}`.trim();
  }
  return `[${label}]\n${content}`.trim();
}

function toolContract(tools) {
  if (!Array.isArray(tools) || tools.length === 0) {
    return "";
  }
  const names = [];
  for (const tool of tools) {
    const fn = tool && typeof tool === "object" ? tool.function : null;
    if (fn && typeof fn === "object" && typeof fn.name === "string" && fn.name.trim()) {
      names.push(fn.name.trim());
    }
  }
  if (names.length === 0) {
    return "";
  }
  return (
    "\n\n工具协议：当前请求注册了以下函数："
    + names.join(", ")
    + "。如果需要调用一个非最终输出函数，只输出一段 JSON："
    + '{"__opencode_tool_call__":{"name":"函数名","arguments":{}}}。'
    + "如果可以直接返回最终结果，直接输出符合最终结构的 JSON。"
  );
}

function responseFormatContract(responseFormat) {
  if (!responseFormat || typeof responseFormat !== "object") {
    return "";
  }
  const formatType = String(responseFormat.type || "").trim();
  if (formatType === "json_object") {
    return "\n\n输出协议：只输出合法 JSON 对象，不要 Markdown 代码围栏或解释文字。";
  }
  if (formatType !== "json_schema") {
    return "";
  }
  return (
    "\n\n输出协议：只输出符合以下 JSON Schema 的 JSON 对象，不要 Markdown 代码围栏或解释文字。\n"
    + JSON.stringify(responseFormat.json_schema ?? {}, null, 2)
  );
}

function buildOpenCodePrompt(messages, responseFormat, tools) {
  const systemChunks = [];
  const transcriptChunks = [];
  for (const message of messages) {
    if (!message || typeof message !== "object") {
      throw new Error("每条 chat message 都必须是对象");
    }
    if (String(message.role || "").trim().toLowerCase() === "system") {
      const content = contentToText(message.content).trim();
      if (content) {
        systemChunks.push(content);
      }
    } else {
      transcriptChunks.push(renderMessage(message));
    }
  }
  let systemPrompt = systemChunks.join("\n\n");
  systemPrompt += toolContract(tools);
  systemPrompt += responseFormatContract(responseFormat);
  const transcript = transcriptChunks.join("\n\n").trim();
  if (!transcript) {
    throw new Error("messages 必须包含至少一条非 system 消息");
  }
  return { systemPrompt: systemPrompt.trim(), transcript };
}

function stripJsonFence(text) {
  const candidate = String(text || "").trim();
  const match = candidate.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return match ? match[1].trim() : candidate;
}

function tryParseJson(text) {
  try {
    return JSON.parse(stripJsonFence(text));
  } catch {
    return undefined;
  }
}

class OpenCodeServerClient {
  constructor({ baseUrl, directory, timeoutSeconds, agent, variant }) {
    this.baseUrl = String(baseUrl).trim().replace(/\/+$/, "");
    this.directory = directory;
    this.timeoutMs = Math.max(1, Number(timeoutSeconds)) * 1000;
    this.agent = String(agent || "").trim() || DEFAULT_OPENCODE_AGENT;
    this.variant = String(variant || "").trim() || DEFAULT_OPENCODE_VARIANT;
  }

  async request(method, path, body) {
    const url = `${this.baseUrl}${path}?directory=${encodeURIComponent(this.directory)}`;
    const headers = { Accept: "application/json" };
    let payload;
    if (body !== undefined) {
      payload = JSON.stringify(body);
      headers["Content-Type"] = "application/json";
    }
    let response;
    try {
      response = await fetch(url, {
        method,
        headers,
        body: payload,
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      throw new OpenCodeGoError(`OpenCode 服务不可用：${error.message || error}`);
    }
    if (!response.ok) {
      const detail = (await response.text().catch(() => "")).slice(0, 500);
      throw new OpenCodeGoError(`OpenCode 服务返回 HTTP ${response.status}：${detail || "请求失败"}`);
    }
    const raw = await response.text();
    if (!raw) {
      return undefined;
    }
    try {
      return JSON.parse(raw);
    } catch {
      throw new OpenCodeGoError("OpenCode 服务返回了非法 JSON");
    }
  }

  async health() {
    const payload = this.expectObject(await this.request("GET", "/global/health"));
    if (payload.healthy !== true) {
      throw new OpenCodeGoError("OpenCode 服务健康检查未通过");
    }
    return payload;
  }

  expectObject(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new OpenCodeGoError("OpenCode 服务返回了非对象响应");
    }
    return value;
  }

  async complete({ systemPrompt, transcript, model }) {
    const { providerId, modelId } = parseOpenCodeModel(model);
    let lastError = null;
    for (let attempt = 0; attempt < SESSION_RETRY_LIMIT; attempt += 1) {
      const session = this.expectObject(
        await this.request("POST", "/session", { title: "AI Novel text request" }),
      );
      const sessionId = String(session.id || "").trim();
      if (!sessionId) {
        throw new OpenCodeGoError("OpenCode 服务没有返回 session id");
      }
      try {
        const result = this.expectObject(
          await this.request("POST", `/session/${sessionId}/message`, {
            agent: this.agent,
            model: { providerID: providerId, modelID: modelId },
            system: systemPrompt || "",
            variant: this.variant,
            parts: [{ type: "text", text: transcript }],
          }),
        );
        const parts = Array.isArray(result.parts) ? result.parts : [];
        const textParts = [];
        for (const part of parts) {
          if (part && typeof part === "object" && part.type === "text" && part.text) {
            textParts.push(String(part.text));
          }
        }
        const text = textParts.filter(Boolean).join("\n").trim();
        if (!text) {
          throw new OpenCodeGoError("OpenCode 服务没有返回文本内容");
        }
        return text;
      } catch (error) {
        lastError = error;
        if (attempt < SESSION_RETRY_LIMIT - 1 && String(error.message || "").includes("Session not found")) {
          continue;
        }
        throw error;
      } finally {
        try {
          await this.request("DELETE", `/session/${sessionId}`);
        } catch {
          // 清理与 OpenCode 会话持久化竞态时，已完成的响应仍然可用。
        }
      }
    }
    throw lastError || new OpenCodeGoError("OpenCode 会话重试次数耗尽");
  }
}

function errorPayload(message, errorType = "invalid_request_error") {
  return { error: { message, type: errorType } };
}

function chatCompletionPayload({ content, model, finishReason, toolCall }) {
  const message = toolCall
    ? {
        role: "assistant",
        content: null,
        tool_calls: [
          {
            id: toolCall.id,
            type: "function",
            function: {
              name: toolCall.name,
              arguments: JSON.stringify(toolCall.arguments),
            },
          },
        ],
      }
    : { role: "assistant", content };
  return {
    id: `chatcmpl-opencode-${randomUUID().replace(/-/g, "")}`,
    object: "chat.completion",
    created: 0,
    model,
    choices: [
      {
        index: 0,
        finish_reason: finishReason,
        message,
      },
    ],
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
  };
}

function handleChatCompletion(bridge, client, body, authorization) {
  if (authorization !== `Bearer ${bridge.apiKey}`) {
    return { status: 401, payload: errorPayload("invalid_api_key", "auth_error") };
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { status: 400, payload: errorPayload("请求体必须是 JSON 对象") };
  }
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return { status: 400, payload: errorPayload("messages 必须是非空数组") };
  }
  const tools = Array.isArray(body.tools) ? body.tools : [];
  let prompt;
  try {
    prompt = buildOpenCodePrompt(body.messages, body.response_format, tools);
  } catch (error) {
    return { status: 400, payload: errorPayload(error.message || String(error)) };
  }
  return client
    .complete({ systemPrompt: prompt.systemPrompt, transcript: prompt.transcript, model: bridge.model })
    .then((text) => {
      const stream = body.stream === true;
      const parsed = tryParseJson(text);
      let toolName = "";
      let toolArguments = parsed;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        const envelope = parsed.__opencode_tool_call__;
        if (envelope && typeof envelope === "object") {
          toolName = String(envelope.name || "").trim();
          toolArguments = envelope.arguments || {};
        }
      }
      const toolChoice = body.tool_choice;
      let forcedToolName = "";
      if (toolChoice && typeof toolChoice === "object" && toolChoice.function && typeof toolChoice.function === "object") {
        forcedToolName = String(toolChoice.function.name || "").trim();
      }
      if (forcedToolName) {
        toolName = forcedToolName;
      }
      if (tools.length > 0 && !toolName && parsed !== undefined) {
        const firstFunction = tools[0] && typeof tools[0] === "object" ? tools[0].function : null;
        if (firstFunction && typeof firstFunction === "object" && firstFunction.name) {
          toolName = String(firstFunction.name).trim();
        }
      }
      if (toolName) {
        const knownNames = new Set();
        for (const tool of tools) {
          if (tool && typeof tool === "object" && tool.function && typeof tool.function === "object" && tool.function.name) {
            knownNames.add(String(tool.function.name).trim());
          }
        }
        if (!knownNames.has(toolName)) {
          return { status: 502, payload: errorPayload("OpenCode 请求了未注册的工具", "upstream_error"), stream: false };
        }
        return {
          status: 200,
          stream,
          payload: chatCompletionPayload({
            model: bridge.model,
            finishReason: "tool_calls",
            toolCall: {
              id: `call_opencode_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
              name: toolName,
              arguments: toolArguments ?? {},
            },
          }),
        };
      }
      return {
        status: 200,
        stream,
        payload: chatCompletionPayload({ content: text, model: bridge.model, finishReason: "stop" }),
      };
    })
    .catch((error) => ({
      status: 502,
      stream: false,
      payload: errorPayload(
        error instanceof OpenCodeGoError || error instanceof Error
          ? `配置的 OpenCode Go 文本通道不可用：${error.message || error}`
          : String(error),
        "upstream_error",
      ),
    }));
}

function sseChunk(payload) {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

function sendSseChatCompletion(res, payload, includeUsage) {
  // 上游是一次性生成，这里把完整结果按 OpenAI 兼容的 chunk 序列下发：
  // 首帧带 role + 完整内容（或 tool_calls），随后 finish 帧、可选 usage 帧、[DONE]。
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

function readJsonBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const contentLength = Number(req.headers["content-length"] || "");
    if (!Number.isFinite(contentLength) || contentLength <= 0) {
      reject({ status: 400, message: "invalid_content_length" });
      return;
    }
    if (contentLength > maxBytes) {
      reject({ status: 413, message: "request_too_large" });
      return;
    }
    const chunks = [];
    let received = 0;
    req.on("data", (chunk) => {
      received += chunk.length;
      if (received > maxBytes) {
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

function main() {
  let args;
  try {
    args = parseArgs(process.argv);
  } catch (error) {
    console.error(error.message);
    process.exit(2);
  }
  const { providerId } = parseOpenCodeModel(args.model);
  const bridge = { apiKey: String(args.apiKey).trim(), model: String(args.model).trim(), provider: providerId };
  const client = new OpenCodeServerClient({
    baseUrl: args.opencodeUrl,
    directory: args.directory,
    timeoutSeconds: args.timeoutSeconds,
  });

  const server = http.createServer((req, res) => {
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
      client
        .health()
        .then((upstream) => sendJson(200, { ready: true, provider: bridge.provider, model: bridge.model, upstream }))
        .catch(() => sendJson(503, { ready: false, error: "opencode_unavailable" }));
      return;
    }
    if (req.method === "GET" && pathname === "/v1/models") {
      sendJson(200, {
        object: "list",
        data: [{ id: bridge.model, object: "model", owned_by: bridge.provider }],
      });
      return;
    }
    if (req.method === "POST" && pathname === "/v1/chat/completions") {
      readJsonBody(req, MAX_REQUEST_BYTES)
        .then((body) => handleChatCompletion(bridge, client, body, req.headers.authorization || "")
          .then((response) => {
            if (response.stream && response.status === 200) {
              const includeUsage = Boolean(
                body
                  && typeof body === "object"
                  && body.stream_options
                  && typeof body.stream_options === "object"
                  && body.stream_options.include_usage === true,
              );
              sendSseChatCompletion(res, response.payload, includeUsage);
              return;
            }
            sendJson(response.status, response.payload);
          }))
        .catch((error) => {
          const status = Number(error && error.status) || 400;
          const message = (error && error.message) || "invalid_json";
          sendJson(status, errorPayload(message));
        });
      return;
    }
    sendJson(404, errorPayload("not_found"));
  });

  server.listen(args.port, args.host, () => {
    console.log(`[opencode-go-bridge] listening on http://${args.host}:${args.port} model=${bridge.model}`);
    console.log(`[opencode-go-bridge] upstream=${args.opencodeUrl} directory=${args.directory}`);
  });
}

main();
