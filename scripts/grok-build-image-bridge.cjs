"use strict";

const http = require("node:http");
const {
  DEFAULT_GROK_BUILD_API_KEY,
  DEFAULT_GROK_BUILD_TIMEOUT_SECONDS,
  GROK_BUILD_MODEL,
  GROK_BUILD_PROVIDER,
  isGrokBuildAvailable,
  normalizeGrokBuildImage,
  runGrokBuildImage,
} = require("./grok-build-image-core.cjs");

const DEFAULT_HOST = process.env.GROK_IMAGE_BRIDGE_HOST || "0.0.0.0";
const DEFAULT_PORT = Number(process.env.GROK_IMAGE_BRIDGE_PORT || 18767);
const MAX_REQUEST_BYTES = 4 * 1024 * 1024;

function errorPayload(message, code = "invalid_request_error") {
  return { error: { message, code } };
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

function createGrokBuildImageBridgeServer(options = {}) {
  const config = {
    model: options.model || GROK_BUILD_MODEL,
    apiKey: options.apiKey || DEFAULT_GROK_BUILD_API_KEY,
    timeoutSeconds: options.timeoutSeconds || DEFAULT_GROK_BUILD_TIMEOUT_SECONDS,
    executable: options.executable,
    generateImage: options.generateImage || ((input) => runGrokBuildImage({
      ...input,
      executable: config.executable,
      timeoutSeconds: config.timeoutSeconds,
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
    const authorization = String(req.headers.authorization || "");

    if (req.method === "GET" && pathname === "/health") {
      sendJson(200, {
        ready: isGrokBuildAvailable(config.executable),
        provider: GROK_BUILD_PROVIDER,
        model: config.model,
      });
      return;
    }
    if (req.method === "GET" && pathname === "/v1/models") {
      sendJson(200, {
        object: "list",
        data: [{ id: config.model, object: "model", owned_by: GROK_BUILD_PROVIDER }],
      });
      return;
    }
    if (req.method !== "POST" || !["/v1/images/generations", "/v1/images/edits"].includes(pathname)) {
      sendJson(404, errorPayload("not_found"));
      return;
    }
    if (authorization !== `Bearer ${config.apiKey}`) {
      sendJson(401, errorPayload("invalid_api_key", "authentication_error"));
      return;
    }
    if (pathname === "/v1/images/edits") {
      sendJson(422, errorPayload("Grok Build 图片通道不支持参考图编辑，请切换到 Codex 图片通道。", "reference_images_not_supported"));
      return;
    }

    try {
      const body = await readJsonBody(req);
      const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
      if (!prompt) {
        sendJson(400, errorPayload("prompt is required"));
        return;
      }
      const count = Math.max(1, Math.min(4, Math.floor(Number(body.n) || 1)));
      const images = [];
      for (let index = 0; index < count; index += 1) {
        const raw = await config.generateImage({
          prompt,
          model: body.model || config.model,
          index,
        });
        const normalized = await normalizeGrokBuildImage(raw);
        images.push({ b64_json: normalized.toString("base64"), width: 1280, height: 720 });
      }
      sendJson(200, {
        created: Math.floor(Date.now() / 1000),
        data: images,
      });
    } catch (error) {
      sendJson(Number(error?.status) || 502, errorPayload(
        String(error?.message || error).slice(0, 500),
        "grok_generation_failed",
      ));
    }
  });
}

function parseArgs(argv) {
  const args = {
    host: DEFAULT_HOST,
    port: DEFAULT_PORT,
    model: process.env.GROK_IMAGE_MODEL || GROK_BUILD_MODEL,
    apiKey: process.env.GROK_IMAGE_BRIDGE_API_KEY || DEFAULT_GROK_BUILD_API_KEY,
    timeoutSeconds: Number(process.env.GROK_BUILD_TIMEOUT_SECONDS || DEFAULT_GROK_BUILD_TIMEOUT_SECONDS),
    executable: process.env.GROK_CLI_PATH || process.env.GROK_BUILD_EXECUTABLE || "",
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
      case "--cli-path": args.executable = value; index += 1; break;
      default: throw new Error(`未知参数：${key}`);
    }
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv);
  const server = createGrokBuildImageBridgeServer(args);
  server.listen(args.port, args.host, () => {
    console.log(`[grok-build-image-bridge] listening on http://${args.host}:${args.port}/v1/images/generations model=${args.model}`);
  });
}

if (require.main === module) {
  main();
}

module.exports = {
  MAX_REQUEST_BYTES,
  createGrokBuildImageBridgeServer,
  errorPayload,
  parseArgs,
};
