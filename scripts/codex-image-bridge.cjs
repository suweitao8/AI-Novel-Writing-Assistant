#!/usr/bin/env node
// Codex 图片生成本地桥接：把 OpenAI Images 兼容请求翻译成本机 Codex CLI 的
// 内置 image_generation 工具调用，使用本机已登录的 Codex 订阅，不需要真实 API Key。
// 移植自 mydrama 项目的 scripts/codex_image_bridge.py + src/novelvideo/generators/codex_image.py，
// 协议保持一致（18766 端口），两个项目可以共用同一个桥。
//
// 对外暴露：
//   GET  /health                  -> { ready, provider, runtime }
//   GET  /v1/models               -> OpenAI 模型列表（只有 gpt-image-2）
//   POST /v1/images/generations   -> JSON { prompt, size|aspect_ratio, image_size, quality, n, response_format }
//   POST /v1/images/edits         -> multipart/form-data，image 字段作为参考图
//
// 上游契约（codex CLI）：
//   codex exec --ignore-user-config --ephemeral --json --color never --enable image_generation
//          -C <workdir> --skip-git-repo-check -s danger-full-access -m <agentModel> [-i ref ...] -
//   agent prompt 从 stdin 传入；产物出现在 $CODEX_HOME/generated_images 下。

"use strict";

const { execFileSync, spawn } = require("node:child_process");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");

const DEFAULT_HOST = "0.0.0.0";
const DEFAULT_PORT = 18766;
const DEFAULT_API_KEY = "codex-bridge-local";
const DEFAULT_IMAGE_MODEL = "gpt-image-2";
const DEFAULT_AGENT_MODEL = "gpt-5.5";
const DEFAULT_TIMEOUT_SECONDS = 900;
const DEFAULT_MAX_CONCURRENCY = 4;
const MAX_REQUEST_BYTES = 20 * 1024 * 1024;
const IMAGE_SUFFIXES = new Set([".png", ".jpg", ".jpeg", ".webp"]);

function envNumber(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function parseArgs(argv) {
  const args = {
    host: process.env.CODEX_IMAGE_BRIDGE_HOST || DEFAULT_HOST,
    port: Number(process.env.CODEX_IMAGE_BRIDGE_PORT || DEFAULT_PORT),
    apiKey: process.env.CODEX_IMAGE_API_KEY || DEFAULT_API_KEY,
    agentModel: (process.env.CODEX_IMAGE_AGENT_MODEL || DEFAULT_AGENT_MODEL).trim(),
    timeoutSeconds: envNumber("CODEX_IMAGE_TIMEOUT_SECONDS", DEFAULT_TIMEOUT_SECONDS),
    maxConcurrency: Math.max(1, Math.min(envNumber("CODEX_IMAGE_MAX_CONCURRENCY", DEFAULT_MAX_CONCURRENCY), 4)),
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
      case "--api-key": args.apiKey = value; i += 1; break;
      case "--agent-model": args.agentModel = value; i += 1; break;
      case "--timeout-seconds": args.timeoutSeconds = Number(value); i += 1; break;
      default:
        throw new Error(`未知参数：${key}`);
    }
  }
  return args;
}

function resolveCodexExecutable() {
  const configured = String(process.env.CODEX_IMAGE_EXECUTABLE || "").trim();
  if (configured) {
    return configured;
  }
  const finder = process.platform === "win32" ? "where" : "which";
  try {
    const lines = execFileSync(finder, ["codex"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    const cmd = process.platform === "win32"
      ? lines.find((line) => line.toLowerCase().endsWith(".cmd")) || lines[0]
      : lines[0];
    return cmd || null;
  } catch {
    return null;
  }
}

function codexHomeDir() {
  const configured = String(process.env.CODEX_HOME || "").trim();
  return configured ? configured : path.join(os.homedir(), ".codex");
}

function quoteCommandArg(value) {
  const text = String(value);
  return /[\s"]/.test(text) ? `"${text.replace(/"/g, '\\"')}"` : text;
}

function killProcessTree(child) {
  if (!child.pid) {
    return;
  }
  if (process.platform === "win32") {
    try {
      spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    } catch {
      child.kill();
    }
  } else {
    child.kill("SIGKILL");
  }
}

function aspectRatioFromSize(size) {
  const common = {
    "1024x1024": "1:1",
    "1536x1024": "3:2",
    "1024x1536": "2:3",
    "1792x1024": "16:9",
    "1024x1792": "9:16",
  };
  const normalized = String(size || "").trim().toLowerCase();
  if (common[normalized]) {
    return common[normalized];
  }
  const match = /^(\d+)x(\d+)$/.exec(normalized);
  if (!match) {
    return "16:9";
  }
  const width = Number(match[1]);
  const height = Number(match[2]);
  const gcd = (a, b) => (b === 0 ? a : gcd(b, a % b));
  const divisor = gcd(width, height);
  return divisor ? `${width / divisor}:${height / divisor}` : "16:9";
}

function buildAgentPrompt(input) {
  const referenceInstruction = input.hasReferences
    ? "Use the attached reference images as identity and design references; preserve the relevant subjects while following the visual brief."
    : "There are no reference images; construct the scene from the visual brief.";
  const qualityText = input.quality ? `Quality target: ${input.quality}.` : "Use the highest practical quality.";
  return (
    "Use the built-in image_generation tool exactly once. Generate exactly one final image "
    + "and do not return a textual substitute, code, or a second variation. "
    + `The final image must use aspect ratio ${input.aspectRatio} and target size ${input.imageSize}. `
    + `${qualityText} ${referenceInstruction}\n\n`
    + "Visual brief:\n"
    + String(input.prompt || "").trim()
  ).trim();
}

async function findLatestGeneratedImage(root, startedMs, timeoutMs) {
  let entries;
  try {
    entries = await fsp.readdir(root, { recursive: true, withFileTypes: true });
  } catch {
    return null;
  }
  const candidates = [];
  for (const entry of entries) {
    if (!entry.isFile() || !IMAGE_SUFFIXES.has(path.extname(entry.name).toLowerCase())) {
      continue;
    }
    const filePath = path.join(entry.parentPath || path.dirname(entry.path), entry.name);
    try {
      const stat = await fsp.stat(filePath);
      // 预留 1 秒时钟偏差，只接受本次调用开始之后生成的文件。
      if (stat.mtimeMs >= startedMs - 1000) {
        candidates.push({ filePath, mtimeMs: stat.mtimeMs });
      }
    } catch {
      continue;
    }
  }
  if (candidates.length === 0) {
    return null;
  }
  candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return candidates[0].filePath;
}

async function generateCodexImage(input) {
  const executable = resolveCodexExecutable();
  if (!executable) {
    throw new Error("未找到 codex CLI，请设置 CODEX_IMAGE_EXECUTABLE 或把 codex 加入 PATH");
  }
  const workdir = input.workdir;
  await fsp.mkdir(workdir, { recursive: true });
  for (const ref of input.referencePaths) {
    await fsp.access(ref);
  }

  const isolatedHome = await fsp.mkdtemp(path.join(os.tmpdir(), "codex-image-home-"));
  try {
    // Codex 仍然从 CODEX_HOME 读取登录态；只复制鉴权需要的两个文件。
    const sourceHome = codexHomeDir();
    for (const name of ["auth.json", "cap_sid"]) {
      const source = path.join(sourceHome, name);
      try {
        await fsp.copyFile(source, path.join(isolatedHome, name));
      } catch {
        // 没有该文件就跳过（例如旧版本没有 cap_sid）。
      }
    }

    const commandArgs = [
      "exec",
      "--ignore-user-config",
      "--ephemeral",
      "--json",
      "--color",
      "never",
      "--enable",
      "image_generation",
      "-C",
      workdir,
      "--skip-git-repo-check",
      "-s",
      "danger-full-access",
      "-m",
      input.agentModel,
    ];
    for (const ref of input.referencePaths) {
      commandArgs.push("-i", ref);
    }
    commandArgs.push("-");
    const agentPrompt = buildAgentPrompt(input);

    // Windows 上直接 spawn .cmd 垫片会抛 EINVAL（CVE-2024-27980 修复后的行为），
    // 统一经 cmd.exe /c 启动；prompt 走 stdin，避免被 .cmd 分词。
    const launchers = process.platform === "win32"
      ? ["cmd.exe", ["/c", [executable, ...commandArgs].map(quoteCommandArg).join(" ")]]
      : [executable, commandArgs];
    const child = spawn(launchers[0], launchers[1], {
      cwd: workdir,
      env: { ...process.env, CODEX_HOME: isolatedHome },
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk.toString("utf8"); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString("utf8"); });

    const startedMs = Date.now();
    const exitCode = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        killProcessTree(child);
        reject(new Error(`Codex 图片生成超时（${Math.round(input.timeoutMs / 1000)}s）`));
      }, input.timeoutMs);
      child.on("error", (error) => {
        clearTimeout(timer);
        reject(new Error(`无法启动 Codex CLI：${error.message}`));
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        resolve(code);
      });
      child.stdin.on("error", () => {
        // stdin 管道可能在对端异常时断开，交给 exit code 判定。
      });
      child.stdin.write(agentPrompt, "utf8");
      child.stdin.end();
    });

    if (exitCode !== 0) {
      const detail = (stderr.trim() || stdout.trim() || `exit code ${exitCode}`).slice(-1200);
      throw new Error(`Codex 图片生成失败：${detail}`);
    }

    const generatedRoot = path.join(isolatedHome, "generated_images");
    const generated = await findLatestGeneratedImage(generatedRoot, startedMs)
      ?? await findLatestGeneratedImage(workdir, startedMs);
    if (!generated) {
      throw new Error("Codex 结束运行但没有产出图片文件");
    }
    return await fsp.readFile(generated);
  } finally {
    fsp.rm(isolatedHome, { recursive: true, force: true }).catch(() => {});
  }
}

function createConcurrencyLimiter(maxConcurrency) {
  let active = 0;
  const queue = [];
  function pump() {
    while (active < maxConcurrency && queue.length > 0) {
      const item = queue.shift();
      active += 1;
      item.task().then(item.resolve, item.reject).finally(() => {
        active -= 1;
        pump();
      });
    }
  }
  return function acquire(task) {
    return new Promise((resolve, reject) => {
      queue.push({ task, resolve, reject });
      pump();
    });
  };
}

function parseMultipart(contentType, body) {
  const match = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType || "");
  if (!match) {
    throw new Error("missing multipart boundary");
  }
  const boundary = Buffer.from(`--${(match[1] || match[2]).trim()}`);
  const fields = {};
  const files = [];
  let cursor = body.indexOf(boundary);
  while (cursor !== -1) {
    const next = body.indexOf(boundary, cursor + boundary.length);
    if (next === -1) {
      break;
    }
    let segment = body.subarray(cursor + boundary.length, next);
    if (segment.subarray(0, 2).toString("latin1") === "\r\n") {
      segment = segment.subarray(2);
    }
    if (segment.subarray(segment.length - 2).toString("latin1") === "\r\n") {
      segment = segment.subarray(0, segment.length - 2);
    }
    if (segment.length === 0 || segment.toString("latin1") === "--") {
      break;
    }
    const headerEnd = segment.indexOf("\r\n\r\n");
    if (headerEnd !== -1) {
      const headerText = segment.subarray(0, headerEnd).toString("utf8");
      const data = segment.subarray(headerEnd + 4);
      const nameMatch = /name="([^"]*)"/i.exec(headerText);
      const fileMatch = /filename="([^"]*)"/i.exec(headerText);
      const name = nameMatch ? nameMatch[1] : "";
      const filename = fileMatch ? fileMatch[1] : "";
      if (filename || name === "image" || name === "image[]") {
        files.push({ name, filename: filename || "reference.png", data });
      } else if (name) {
        fields[name] = data.toString("utf8");
      }
    }
    cursor = next;
  }
  return { fields, files };
}

function readRawBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const contentLength = Number(req.headers["content-length"] || "");
    if (!Number.isFinite(contentLength) || contentLength <= 0) {
      reject(new Error("invalid_content_length"));
      return;
    }
    if (contentLength > maxBytes) {
      reject(new Error("request_too_large"));
      return;
    }
    const chunks = [];
    let received = 0;
    req.on("data", (chunk) => {
      received += chunk.length;
      if (received > maxBytes) {
        reject(new Error("request_too_large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", () => reject(new Error("invalid_json")));
  });
}

function toDataItem(imageBytes, responseFormat) {
  const encoded = imageBytes.toString("base64");
  if (String(responseFormat || "").trim().toLowerCase() === "url") {
    return { url: `data:image/png;base64,${encoded}` };
  }
  return { b64_json: encoded };
}

async function main() {
  const args = parseArgs(process.argv);
  const acquire = createConcurrencyLimiter(args.maxConcurrency);
  const executable = resolveCodexExecutable();
  const executableAvailable = Boolean(executable);

  async function generateOne({ prompt, aspectRatio, imageSize, quality, references }) {
    const workdir = await fsp.mkdtemp(path.join(os.tmpdir(), "codex-image-bridge-"));
    try {
      const referencePaths = [];
      for (let index = 0; index < references.length; index += 1) {
        const reference = references[index];
        const suffix = path.extname(reference.filename).toLowerCase() || ".png";
        const referencePath = path.join(workdir, `reference-${index + 1}${suffix}`);
        await fsp.writeFile(referencePath, reference.data);
        referencePaths.push(referencePath);
      }
      return await acquire(() => generateCodexImage({
        prompt,
        workdir,
        referencePaths,
        aspectRatio,
        imageSize,
        quality,
        agentModel: args.agentModel,
        timeoutMs: args.timeoutSeconds * 1000,
      }));
    } finally {
      fsp.rm(workdir, { recursive: true, force: true }).catch(() => {});
    }
  }

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
      sendJson(200, {
        ready: executableAvailable,
        provider: "codex",
        runtime: {
          executable: executableAvailable ? executable : null,
          version: null,
        },
      });
      return;
    }
    if (req.method === "GET" && pathname === "/v1/models") {
      sendJson(200, {
        object: "list",
        data: [{ id: DEFAULT_IMAGE_MODEL, object: "model", owned_by: "codex" }],
      });
      return;
    }
    if (req.method === "POST" && (pathname === "/v1/images/generations" || pathname === "/v1/images/edits")) {
      const auth = req.headers.authorization || "";
      if (auth && auth !== `Bearer ${args.apiKey}`) {
        sendJson(401, { error: { message: "invalid_api_key" } });
        return;
      }
      readRawBody(req, MAX_REQUEST_BYTES)
        .then(async (rawBody) => {
          const contentType = req.headers["content-type"] || "";
          let fields;
          let references = [];
          if (pathname.endsWith("/edits") && contentType.toLowerCase().startsWith("multipart/")) {
            const parsed = parseMultipart(contentType, rawBody);
            fields = parsed.fields;
            references = parsed.files;
          } else {
            fields = JSON.parse(rawBody.toString("utf8"));
          }
          const prompt = String(fields.prompt || "").trim();
          if (!prompt) {
            return { status: 400, payload: { error: { message: "prompt is required" } } };
          }
          const aspectRatio = String(
            fields.aspect_ratio || aspectRatioFromSize(String(fields.size || "")),
          ).trim();
          const imageSize = String(fields.image_size || fields.size || "1K").trim();
          const quality = String(fields.quality || "").trim();
          const responseFormat = String(fields.response_format || "b64_json");
          const count = Math.max(1, Math.min(Number(fields.n || 1) || 1, 4));
          console.log(`[codex-image-bridge] ${pathname} prompt_len=${prompt.length} refs=${references.length} n=${count} aspect=${aspectRatio}`);

          const images = [];
          for (let index = 0; index < count; index += 1) {
            const imageBytes = await generateOne({ prompt, aspectRatio, imageSize, quality, references });
            images.push(toDataItem(imageBytes, responseFormat));
          }
          return { status: 200, payload: { created: Math.floor(Date.now() / 1000), data: images } };
        })
        .then((response) => sendJson(response.status, response.payload))
        .catch((error) => {
          const message = error.message || "invalid_request";
          const status = message === "request_too_large" || message === "invalid_content_length" ? 413 : 502;
          sendJson(status, { error: { message: `codex_generation_failed: ${message}`, type: status === 502 ? "server_error" : "invalid_request_error" } });
        });
      return;
    }
    sendJson(404, { error: { message: "not_found" } });
  });

  server.listen(args.port, args.host, () => {
    console.log(`[codex-image-bridge] listening on http://${args.host}:${args.port}/v1/images/generations`);
    console.log(`[codex-image-bridge] executable=${executable} agentModel=${args.agentModel} timeout=${args.timeoutSeconds}s`);
    if (!executableAvailable) {
      console.warn("[codex-image-bridge] 未找到 codex CLI，请设置 CODEX_IMAGE_EXECUTABLE 或安装 codex。");
    }
  });
}

main();
