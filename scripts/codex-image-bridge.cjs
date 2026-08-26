#!/usr/bin/env node
// Codex 本地桥接：把 OpenAI 兼容请求翻译成本机已登录 Codex 订阅的调用，不需要真实 API Key。
// 移植自 mydrama 项目的 scripts/codex_image_bridge.py + src/novelvideo/generators/codex_image.py，
// 协议保持一致（18766 端口），两个项目可以共用同一个桥。
//
// 图片（原有能力）：
//   POST /v1/images/generations   -> JSON { prompt, size|aspect_ratio, image_size, quality, n, response_format }
//   POST /v1/images/edits         -> multipart/form-data，image 字段作为参考图
//   codex exec --ignore-user-config --ephemeral --json --color never --enable image_generation
//          -C <workdir> --skip-git-repo-check -s danger-full-access -m <agentModel> [-i ref ...] -
//   agent prompt 从 stdin 传入；产物出现在 $CODEX_HOME/generated_images 下。
//
// 文本/视觉（2026-08-27 新增）：POST /v1/chat/completions 走同一个 Codex 订阅额度。
//   codex exec --ignore-user-config --ephemeral --json --color never
//          -C <workdir> --skip-git-repo-check -s read-only -m <model>
//          -c model_reasoning_effort="<effort>" [-i image ...] -
//   默认 gpt-5.6-luna + high 推理档。实测小任务 high 与 low 总耗时几乎持平
//   （12.5s vs 13.7s，CLI 启动与注入内容等固定开销占大头），复杂结构化任务才是
//   推理耗时增长点、也正是质量收益点；花费过多可用 CODEX_TEXT_REASONING_EFFORT 降档。
//   注意：gpt-5.6-luna 需要较新的 codex CLI；旧版 CLI 会收到服务端 400
//   "The 'gpt-5.6-luna' model requires a newer version of Codex"，npm i -g @openai/codex@latest 即可。
//   模型策略：订阅额度统一锁定在 gpt-5.6-luna 一个模型上（文本/视觉/图片同一 agent），
//   CODEX_TEXT_MODEL / CODEX_IMAGE_AGENT_MODEL 仅作运维兜底，请求侧不可改选其它模型。
//
// 对外暴露：
//   GET  /health                  -> { ready, provider, runtime }
//   GET  /v1/models               -> OpenAI 模型列表
//   POST /v1/chat/completions     -> OpenAI chat completion；stream:true 时上游仍是一次性
//                                    生成，桥接把完整结果按 SSE 分片下发。

"use strict";

const { execFileSync, spawn } = require("node:child_process");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { randomUUID } = require("node:crypto");

const DEFAULT_HOST = "0.0.0.0";
const DEFAULT_PORT = 18766;
const DEFAULT_API_KEY = "codex-bridge-local";
const DEFAULT_IMAGE_MODEL = "gpt-image-2";
const DEFAULT_AGENT_MODEL = "gpt-5.6-luna";
const DEFAULT_TIMEOUT_SECONDS = 900;
const DEFAULT_MAX_CONCURRENCY = 4;
const MAX_REQUEST_BYTES = 20 * 1024 * 1024;
const IMAGE_SUFFIXES = new Set([".png", ".jpg", ".jpeg", ".webp"]);
// 文本/视觉通道：high 思考档为默认性价比点（见文件头实测数据）。
const DEFAULT_TEXT_MODEL = "gpt-5.6-luna";
const DEFAULT_TEXT_EFFORT = "high";
const DEFAULT_TEXT_TIMEOUT_SECONDS = 300;
const DEFAULT_TEXT_MAX_CONCURRENCY = 2;
// 图片通道的 agent 只做轻量规划（耗大头在 image_generation 工具本身），固定 low 保证出图速度。
const DEFAULT_IMAGE_AGENT_EFFORT = "low";
const CHAT_IMAGE_SUFFIX_BY_MIME = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
};

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
    textModel: (process.env.CODEX_TEXT_MODEL || DEFAULT_TEXT_MODEL).trim(),
    textEffort: (process.env.CODEX_TEXT_REASONING_EFFORT || DEFAULT_TEXT_EFFORT).trim(),
    imageAgentEffort: (process.env.CODEX_IMAGE_AGENT_EFFORT || DEFAULT_IMAGE_AGENT_EFFORT).trim(),
    textTimeoutSeconds: envNumber("CODEX_TEXT_TIMEOUT_SECONDS", DEFAULT_TEXT_TIMEOUT_SECONDS),
    textMaxConcurrency: Math.max(1, envNumber("CODEX_TEXT_MAX_CONCURRENCY", DEFAULT_TEXT_MAX_CONCURRENCY)),
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
      case "--text-model": args.textModel = value; i += 1; break;
      case "--text-effort": args.textEffort = value; i += 1; break;
      case "--text-timeout-seconds": args.textTimeoutSeconds = Number(value); i += 1; break;
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
  const referenceLabels = Array.isArray(input.referenceLabels)
    ? input.referenceLabels.filter((label) => typeof label === "string" && label.trim())
    : [];
  const referenceManifest = referenceLabels.length > 0
    ? "\nReference image order and purpose (the attachments are in this exact order):\n"
      + referenceLabels.map((label, index) => `${index + 1}. ${label.trim()}`).join("\n")
    : "";
  const qualityText = input.quality ? `Quality target: ${input.quality}.` : "Use the highest practical quality.";
  // OpenAI Images 兼容参数里只有 transparent 需要桥接翻译：CLI 的图片工具没有 background 字段，
  // 透明底靠 agent prompt 明确要求真 alpha 通道的 PNG（2026-08-22：角色/道具资产参考图统一透明底）。
  const transparentInstruction = input.transparent
    ? "The background must be fully transparent: deliver a PNG with a genuine alpha channel, "
      + "no backdrop color, no solid fill, no checkerboard pattern, no gradient background and no "
      + "ground/floor plane; keep only the requested subjects with clean anti-aliased edges. "
    : "";
  return (
    "Use the built-in image_generation tool exactly once. Generate exactly one final image "
    + "and do not return a textual substitute, code, or a second variation. "
    + `The final image must use aspect ratio ${input.aspectRatio} and target size ${input.imageSize}. `
    + `${qualityText} ${transparentInstruction}${referenceInstruction}${referenceManifest}\n\n`
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
  // 上游服务端有自己的 HTTP 超时（默认 900s，与服务端配置对齐）：客户端断开后
  // 必须立刻杀掉 codex 进程，否则它会把 15 分钟预算跑完——白烧订阅额度，
  // 还占着并发槽，让后续请求排队（表现为前端一直「生成中」直到超时）。
  if (input.signal?.aborted) {
    throw new Error("client_closed");
  }
  const workdir = input.workdir;
  await fsp.mkdir(workdir, { recursive: true });
  for (const ref of input.referencePaths) {
    await fsp.access(ref);
  }

  let onClientAbort = null;
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
      "-c",
      `model_reasoning_effort="${input.agentEffort}"`,
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
    const onAbortHandler = () => killProcessTree(child);
    onClientAbort = onAbortHandler;
    if (input.signal) {
      input.signal.addEventListener("abort", onAbortHandler);
    }

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
    if (input.signal && onClientAbort) {
      input.signal.removeEventListener("abort", onClientAbort);
    }
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

// ─── 文本/视觉通道（chat completions → codex exec） ───────────────────────────

function extractChatImage(item) {
  const raw = typeof item.image_url === "string"
    ? item.image_url
    : item.image_url && typeof item.image_url === "object"
      ? item.image_url.url
      : item.url;
  const value = String(raw || "").trim();
  if (!value) return null;
  const dataMatch = value.match(/^data:([^;,]+)?(;base64)?,(.*)$/s);
  if (dataMatch) {
    return { mime: dataMatch[1] || "image/png", base64: dataMatch[3] || "", url: null };
  }
  if (/^https?:\/\//i.test(value)) {
    return { mime: "image/png", base64: null, url: value };
  }
  return null;
}

function contentToText(content, images) {
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
          const image = extractChatImage(item);
          if (image) {
            images.push(image);
          } else {
            chunks.push("[unparsable image input omitted]");
          }
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

function renderChatMessage(message, images) {
  const role = String(message.role || "user").trim().toLowerCase();
  const name = String(message.name || "").trim();
  const label = name ? `${role}/${name}` : role;
  const content = contentToText(message.content, images);
  return `[${label}]\n${content}`.trim();
}

function chatToolContract(tools) {
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
    + '{"__codex_tool_call__":{"name":"函数名","arguments":{}}}。'
    + "如果可以直接返回最终结果，直接输出符合最终结构的 JSON。"
  );
}

function chatResponseFormatContract(responseFormat) {
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

function buildChatPrompt(messages, responseFormat, tools) {
  const systemChunks = [];
  const transcriptChunks = [];
  const images = [];
  for (const message of messages) {
    if (!message || typeof message !== "object") {
      throw new Error("每条 chat message 都必须是对象");
    }
    if (String(message.role || "").trim().toLowerCase() === "system") {
      const content = contentToText(message.content, images).trim();
      if (content) {
        systemChunks.push(content);
      }
    } else {
      transcriptChunks.push(renderChatMessage(message, images));
    }
  }
  let systemPrompt = [
    ...systemChunks,
    // codex exec 是代码代理，文本任务必须约束成纯文本问答，禁止命令执行与工具探索。
    "回答约束：这是纯文本/视觉理解任务，不要执行任何命令、不要读写文件、不要使用任何工具，直接用文字回答。",
  ].join("\n\n");
  systemPrompt += chatToolContract(tools);
  systemPrompt += chatResponseFormatContract(responseFormat);
  const transcript = transcriptChunks.join("\n\n").trim();
  if (!transcript) {
    throw new Error("messages 必须包含至少一条非 system 消息");
  }
  return { prompt: `${systemPrompt.trim()}\n\n---\n\n${transcript}`, images };
}

function resolveChatModel(requestModel, fallbackModel) {
  // 模型锁：订阅额度统一在配置的文本模型（默认 gpt-5.6-luna）上，请求侧
  // （codex/ 前缀、供应商名、图片 id、其它任何模型名）一律回落，不允许改选。
  return fallbackModel;
}

async function saveChatImages(images, workdir) {
  const paths = [];
  for (let index = 0; index < images.length; index += 1) {
    const image = images[index];
    const suffix = CHAT_IMAGE_SUFFIX_BY_MIME[image.mime] || ".png";
    const filePath = path.join(workdir, `chat-image-${index + 1}${suffix}`);
    if (image.base64 !== null) {
      await fsp.writeFile(filePath, Buffer.from(image.base64, "base64"));
    } else {
      const response = await fetch(image.url, { signal: AbortSignal.timeout(60_000) });
      if (!response.ok) {
        throw new Error(`图片下载失败：HTTP ${response.status}`);
      }
      await fsp.writeFile(filePath, Buffer.from(await response.arrayBuffer()));
    }
    paths.push(filePath);
  }
  return paths;
}

async function runCodexChat(input) {
  const executable = resolveCodexExecutable();
  if (!executable) {
    throw new Error("未找到 codex CLI，请设置 CODEX_IMAGE_EXECUTABLE 或把 codex 加入 PATH");
  }
  if (input.signal?.aborted) {
    throw new Error("client_closed");
  }
  await fsp.mkdir(input.workdir, { recursive: true });

  let onClientAbort = null;
  const isolatedHome = await fsp.mkdtemp(path.join(os.tmpdir(), "codex-text-home-"));
  try {
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
      "-C",
      input.workdir,
      "--skip-git-repo-check",
      "-s",
      "read-only",
      "-m",
      input.model,
      "-c",
      `model_reasoning_effort="${input.effort}"`,
    ];
    for (const imagePath of input.imagePaths) {
      commandArgs.push("-i", imagePath);
    }
    commandArgs.push("-");

    // Windows 上直接 spawn .cmd 垫片会抛 EINVAL，统一经 cmd.exe /c；prompt 走 stdin。
    const launchers = process.platform === "win32"
      ? ["cmd.exe", ["/c", [executable, ...commandArgs].map(quoteCommandArg).join(" ")]]
      : [executable, commandArgs];
    const child = spawn(launchers[0], launchers[1], {
      cwd: input.workdir,
      env: { ...process.env, CODEX_HOME: isolatedHome },
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk.toString("utf8"); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString("utf8"); });
    const onAbortHandler = () => killProcessTree(child);
    onClientAbort = onAbortHandler;
    if (input.signal) {
      input.signal.addEventListener("abort", onAbortHandler);
    }

    const exitCode = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        killProcessTree(child);
        reject(new Error(`Codex 文本生成超时（${Math.round(input.timeoutMs / 1000)}s）`));
      }, input.timeoutMs);
      child.on("error", (error) => {
        clearTimeout(timer);
        reject(new Error(`无法启动 Codex CLI：${error.message}`));
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        resolve(code);
      });
      child.stdin.on("error", () => {});
      child.stdin.write(input.prompt, "utf8");
      child.stdin.end();
    });

    // --json 事件流：最后一条 item.completed(agent_message) 即最终回答；
    // type:"error" 事件/行（模型不存在、额度拒绝等）优先透出真实原因。
    let agentText = "";
    let upstreamError = null;
    for (const line of stdout.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("{")) continue;
      let event;
      try {
        event = JSON.parse(trimmed);
      } catch {
        continue;
      }
      if (event?.type === "item.completed" && event.item?.type === "agent_message" && event.item.text) {
        agentText = String(event.item.text);
      } else if (event?.type === "error") {
        upstreamError = event.message || JSON.stringify(event).slice(0, 500);
      }
    }
    if (!upstreamError) {
      const cliError = stderr.match(/\{"type":"error"[\s\S]*?\}/);
      if (cliError) {
        try {
          const parsed = JSON.parse(cliError[0]);
          upstreamError = parsed?.error?.message || parsed?.message || null;
        } catch {
          upstreamError = cliError[0].slice(0, 300);
        }
      }
    }
    if (exitCode !== 0 && !agentText) {
      const detail = (stderr.trim() || stdout.trim() || `exit code ${exitCode}`).slice(-1200);
      throw new Error(upstreamError ? `Codex 上游错误：${upstreamError}` : `Codex 文本生成失败：${detail}`);
    }
    if (!agentText) {
      throw new Error(
        upstreamError
          ? `Codex 上游错误：${upstreamError}`
          : "Codex 结束运行但没有返回文本内容",
      );
    }
    return agentText;
  } finally {
    if (input.signal && onClientAbort) {
      input.signal.removeEventListener("abort", onClientAbort);
    }
    fsp.rm(isolatedHome, { recursive: true, force: true }).catch(() => {});
  }
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
    id: `chatcmpl-codex-${randomUUID().replace(/-/g, "")}`,
    object: "chat.completion",
    created: 0,
    model,
    choices: [{ index: 0, finish_reason: finishReason, message }],
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
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

function parseChatJson(text) {
  const candidate = String(text || "").trim();
  const match = candidate.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const unwrapped = match ? match[1].trim() : candidate;
  try {
    return JSON.parse(unwrapped);
  } catch {
    return undefined;
  }
}

async function handleChatCompletion({ bridge, body, signal, workdir }) {
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return { status: 400, payload: { error: { message: "messages 必须是非空数组" } } };
  }
  const tools = Array.isArray(body.tools) ? body.tools : [];
  const promptInfo = buildChatPrompt(body.messages, body.response_format, tools);
  const model = resolveChatModel(body.model, bridge.textModel);
  const work = path.join(workdir, `chat-${randomUUID().slice(0, 8)}`);
  await fsp.mkdir(work, { recursive: true });
  const imagePaths = await saveChatImages(promptInfo.images, work);
  try {
    const text = await runCodexChat({
      prompt: promptInfo.prompt,
      imagePaths,
      model,
      effort: bridge.textEffort,
      workdir: work,
      timeoutMs: bridge.textTimeoutSeconds * 1000,
      signal,
    });
    let toolName = "";
    let toolArguments = parseChatJson(text);
    if (toolArguments && typeof toolArguments === "object" && !Array.isArray(toolArguments)) {
      const envelope = toolArguments.__codex_tool_call__;
      if (envelope && typeof envelope === "object") {
        toolName = String(envelope.name || "").trim();
        toolArguments = envelope.arguments || {};
      }
    }
    const toolChoice = body.tool_choice;
    if (toolChoice && typeof toolChoice === "object" && toolChoice.function && typeof toolChoice.function === "object") {
      toolName = String(toolChoice.function.name || "").trim();
    }
    if (tools.length > 0 && !toolName && toolArguments !== undefined) {
      const firstFunction = tools[0] && typeof tools[0] === "object" ? tools[0].function : null;
      if (firstFunction && typeof firstFunction === "object" && firstFunction.name) {
        toolName = String(firstFunction.name).trim();
      }
    }
    if (toolName) {
      return {
        status: 200,
        payload: chatCompletionPayload({
          model,
          finishReason: "tool_calls",
          toolCall: {
            id: `call_codex_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
            name: toolName,
            arguments: toolArguments ?? {},
          },
        }),
      };
    }
    return { status: 200, payload: chatCompletionPayload({ content: text, model, finishReason: "stop" }) };
  } finally {
    fsp.rm(work, { recursive: true, force: true }).catch(() => {});
  }
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
  const acquireText = createConcurrencyLimiter(args.textMaxConcurrency);
  const executable = resolveCodexExecutable();
  const executableAvailable = Boolean(executable);
  const bridge = {
    textModel: args.textModel,
    textEffort: args.textEffort,
    textTimeoutSeconds: args.textTimeoutSeconds,
  };

  async function generateOne({ prompt, aspectRatio, imageSize, quality, transparent, references, referenceLabels, signal }) {
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
        transparent,
        referenceLabels,
        agentModel: args.agentModel,
        agentEffort: args.imageAgentEffort,
        timeoutMs: args.timeoutSeconds * 1000,
        signal,
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
          textModel: bridge.textModel,
          textEffort: bridge.textEffort,
          imageAgentModel: args.agentModel,
          imageAgentEffort: args.imageAgentEffort,
        },
      });
      return;
    }
    if (req.method === "GET" && pathname === "/v1/models") {
      sendJson(200, {
        object: "list",
        data: [
          { id: DEFAULT_IMAGE_MODEL, object: "model", owned_by: "codex" },
          { id: args.textModel, object: "model", owned_by: "codex" },
        ],
      });
      return;
    }
    if (req.method === "POST" && pathname === "/v1/chat/completions") {
      const auth = req.headers.authorization || "";
      if (auth && auth !== `Bearer ${args.apiKey}`) {
        sendJson(401, { error: { message: "invalid_api_key", type: "auth_error" } });
        return;
      }
      const clientAbort = new AbortController();
      res.once("close", () => clientAbort.abort());
      const startedAt = Date.now();
      readRawBody(req, MAX_REQUEST_BYTES)
        .then(async (rawBody) => {
          let body;
          try {
            body = JSON.parse(rawBody.toString("utf8"));
          } catch {
            return { status: 400, payload: { error: { message: "invalid_json" } } };
          }
          const model = resolveChatModel(body.model, bridge.textModel);
          console.log(`[codex-image-bridge] chat model=${model} messages=${Array.isArray(body.messages) ? body.messages.length : 0} stream=${body.stream === true}`);
          const result = await acquireText(() => handleChatCompletion({ bridge, body, signal: clientAbort.signal, workdir: os.tmpdir() }));
          if (result.status === 200 && body.stream === true) {
            const includeUsage = Boolean(
              body.stream_options && typeof body.stream_options === "object" && body.stream_options.include_usage === true,
            );
            sendSseChatCompletion(res, result.payload, includeUsage);
            return undefined;
          }
          return result;
        })
        .then((response) => {
          if (response && !res.destroyed) {
            sendJson(response.status, response.payload);
          }
        })
        .catch((error) => {
          const message = error.message || "invalid_request";
          const status = message === "request_too_large" || message === "invalid_content_length" ? 413 : 502;
          console.error(`[codex-image-bridge] failed chat in ${Date.now() - startedAt}ms: ${message}`);
          if (!res.destroyed) {
            sendJson(status, { error: { message: `codex_chat_failed: ${message}`, type: status === 502 ? "server_error" : "invalid_request_error" } });
          }
        });
      return;
    }
    if (req.method === "POST" && (pathname === "/v1/images/generations" || pathname === "/v1/images/edits")) {
      const auth = req.headers.authorization || "";
      if (auth && auth !== `Bearer ${args.apiKey}`) {
        sendJson(401, { error: { message: "invalid_api_key" } });
        return;
      }
      // 客户端断开（上游服务端超时或取消）即终止本次生成：释放 codex 进程与并发槽，
      // 避免被放弃的请求继续烧订阅额度、阻塞后续请求。
      const clientAbort = new AbortController();
      res.once("close", () => clientAbort.abort());
      const startedAt = Date.now();
      readRawBody(req, MAX_REQUEST_BYTES)
        .then(async (rawBody) => {
          const contentType = req.headers["content-type"] || "";
          let fields;
          let references = [];
          let referenceLabels = [];
          if (pathname.endsWith("/edits") && contentType.toLowerCase().startsWith("multipart/")) {
            const parsed = parseMultipart(contentType, rawBody);
            fields = parsed.fields;
            references = parsed.files;
            try {
              const parsedLabels = JSON.parse(String(fields.reference_labels || "[]"));
              referenceLabels = Array.isArray(parsedLabels)
                ? parsedLabels.filter((label) => typeof label === "string" && label.trim())
                : [];
            } catch {
              referenceLabels = [];
            }
          } else {
            fields = JSON.parse(rawBody.toString("utf8"));
            if (fields.input_image_url) {
              throw new Error("reference_images_require_multipart_edits");
            }
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
          const transparent = String(fields.background || "").trim().toLowerCase() === "transparent";
          const responseFormat = String(fields.response_format || "b64_json");
          const count = Math.max(1, Math.min(Number(fields.n || 1) || 1, 4));
          console.log(`[codex-image-bridge] ${pathname} prompt_len=${prompt.length} refs=${references.length} labels=${referenceLabels.length} n=${count} aspect=${aspectRatio}`);

          const images = [];
          for (let index = 0; index < count; index += 1) {
            const imageBytes = await generateOne({ prompt, aspectRatio, imageSize, quality, transparent, references, referenceLabels, signal: clientAbort.signal });
            images.push(toDataItem(imageBytes, responseFormat));
          }
          console.log(`[codex-image-bridge] done ${pathname} in ${Date.now() - startedAt}ms`);
          return { status: 200, payload: { created: Math.floor(Date.now() / 1000), data: images } };
        })
        .then((response) => {
          if (!res.destroyed) {
            sendJson(response.status, response.payload);
          }
        })
        .catch((error) => {
          const message = error.message || "invalid_request";
          const status = message === "request_too_large" || message === "invalid_content_length" ? 413 : 502;
          console.error(`[codex-image-bridge] failed ${pathname} in ${Date.now() - startedAt}ms: ${message}`);
          if (!res.destroyed) {
            sendJson(status, { error: { message: `codex_generation_failed: ${message}`, type: status === 502 ? "server_error" : "invalid_request_error" } });
          }
        });
      return;
    }
    sendJson(404, { error: { message: "not_found" } });
  });

  server.listen(args.port, args.host, () => {
    console.log(`[codex-image-bridge] listening on http://${args.host}:${args.port}/v1/images/generations + /v1/chat/completions`);
    console.log(`[codex-image-bridge] executable=${executable} imageAgentModel=${args.agentModel}(effort=${args.imageAgentEffort}) textModel=${args.textModel} textEffort=${args.textEffort} timeout=${args.timeoutSeconds}s textTimeout=${args.textTimeoutSeconds}s`);
    if (!executableAvailable) {
      console.warn("[codex-image-bridge] 未找到 codex CLI，请设置 CODEX_IMAGE_EXECUTABLE 或安装 codex。");
    }
  });
}

if (require.main === module) {
  main();
}

module.exports = {
  buildAgentPrompt,
  parseMultipart,
};
