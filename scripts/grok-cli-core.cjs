"use strict";

const fs = require("node:fs");
const fsp = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { execFileSync, spawn } = require("node:child_process");
const { pathToFileURL } = require("node:url");

const DEFAULT_GROK_CLI_MODEL = "grok-4.6";
const DEFAULT_GROK_CLI_API_KEY = "local-grok-cli";
const DEFAULT_GROK_CLI_BASE_URL = "http://127.0.0.1:18764";
const DEFAULT_GROK_CLI_TIMEOUT_SECONDS = 840;
const DEFAULT_GROK_REASONING_EFFORT = "low";

class GrokCliError extends Error {
  constructor(message, options = {}) {
    super(message, options);
    this.name = "GrokCliError";
  }
}

function normalizeOptionalText(value) {
  const text = typeof value === "string" ? value.trim() : "";
  return text || undefined;
}

function resolveGrokCliPath(explicit) {
  const configured = normalizeOptionalText(explicit) || normalizeOptionalText(process.env.GROK_CLI_PATH);
  if (configured) {
    return configured;
  }

  try {
    const command = process.platform === "win32" ? "where.exe" : "which";
    const result = execFileSync(command, ["grok"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    const resolved = result.split(/\r?\n/).map((item) => item.trim()).find(Boolean);
    if (resolved) {
      return resolved;
    }
  } catch {
    // Fall through to the bundled user installation.
  }

  const bundled = path.join(os.homedir(), ".grok", "bin", process.platform === "win32" ? "grok.exe" : "grok");
  if (fs.existsSync(bundled)) {
    return bundled;
  }
  throw new GrokCliError("Grok CLI 未找到，请先登录 Grok Build 或配置 GROK_CLI_PATH。");
}

function isGrokCliAvailable(explicit) {
  try {
    const resolved = resolveGrokCliPath(explicit);
    return Boolean(resolved && (!path.isAbsolute(resolved) || fs.existsSync(resolved)));
  } catch {
    return false;
  }
}

function normalizeCliModel(model) {
  const text = normalizeOptionalText(model) || DEFAULT_GROK_CLI_MODEL;
  const segments = text.split("/").filter(Boolean);
  return segments.at(-1) || DEFAULT_GROK_CLI_MODEL;
}

function buildGrokCliCommand(input) {
  const command = [
    input.executable,
    ...(input.promptJson
      ? ["--prompt-json", String(input.promptJson)]
      : ["--prompt-file", String(input.promptPath)]),
    "--verbatim",
    "--output-format",
    "json",
    "--tools",
    "",
    "--model",
    normalizeCliModel(input.model),
    "--always-approve",
    "--no-plan",
    "--disable-web-search",
    "--no-subagents",
    "--no-memory",
    "--max-turns",
    "6",
  ];
  const reasoningEffort = normalizeOptionalText(input.reasoningEffort);
  if (reasoningEffort && !["none", "off", "disabled", "false", "0"].includes(reasoningEffort.toLowerCase())) {
    command.push("--reasoning-effort", reasoningEffort);
  }
  if (input.schemaJson) {
    command.push("--json-schema", String(input.schemaJson));
  }
  const systemPrompt = normalizeOptionalText(input.systemPrompt);
  if (systemPrompt) {
    command.push("--system-prompt-override", systemPrompt);
  }
  const cwd = normalizeOptionalText(input.cwd);
  if (cwd) {
    command.push("--cwd", cwd);
  }
  return command;
}

function normalizeImageMimeType(value, fallback = "image/png") {
  const mimeType = typeof value === "string" ? value.trim().toLowerCase() : "";
  return /^image\/[a-z0-9.+-]+$/.test(mimeType) ? mimeType : fallback;
}

function imageExtension(mimeType) {
  switch (normalizeImageMimeType(mimeType)) {
    case "image/jpeg": return "jpg";
    case "image/webp": return "webp";
    case "image/gif": return "gif";
    default: return "png";
  }
}

function parseDataImage(value, mimeType) {
  if (typeof value !== "string") return null;
  const match = value.match(/^data:([^;,]+)(?:;[^,]*)?;base64,([\s\S]*)$/i);
  if (!match) return null;
  const data = Buffer.from(match[2], "base64");
  if (data.length === 0) return null;
  return {
    data,
    mimeType: normalizeImageMimeType(match[1], mimeType),
  };
}

function imageContentDescriptor(item) {
  if (!item || typeof item !== "object") return null;
  const type = typeof item.type === "string" ? item.type : "";
  if (type === "image_url" || type === "input_image") {
    const imageURL = item.image_url;
    const url = typeof imageURL === "string" ? imageURL : imageURL?.url;
    if (typeof url !== "string" || !url.trim()) return null;
    const inline = parseDataImage(url, imageURL?.mimeType);
    return inline ?? {
      uri: url.trim(),
      mimeType: normalizeImageMimeType(imageURL?.mimeType),
    };
  }
  if (type === "image") {
    const inline = parseDataImage(item.data, item.mimeType);
    if (inline) return inline;
    if (typeof item.data === "string" && item.data.trim()) {
      const data = Buffer.from(item.data, "base64");
      if (data.length > 0) {
        return {
          data,
          mimeType: normalizeImageMimeType(item.mimeType),
        };
      }
    }
  }
  return null;
}

function contentItems(content) {
  if (Array.isArray(content)) return content;
  if (typeof content === "string" && content.trim()) {
    return [{ type: "text", text: content }];
  }
  if (content && typeof content === "object") return [content];
  return [];
}

function textContentItem(item) {
  if (typeof item === "string") return item;
  if (!item || typeof item !== "object") return "";
  const type = item.type ?? "text";
  if (type === "text" || type === "input_text" || type === null) {
    const text = item.text ?? item.content;
    return text === undefined || text === null ? "" : String(text);
  }
  return "";
}

/**
 * Convert OpenAI-compatible multimodal messages into the ACP content blocks
 * accepted by `grok --prompt-json`. Inline data is intentionally replaced by
 * resource links before this function is called so the image never has to be
 * placed in a Windows command-line argument.
 */
function buildGrokPromptJson(messages, imageReferences = []) {
  if (!Array.isArray(messages)) return "[]";
  const blocks = [];
  let imageIndex = 0;
  for (const message of messages) {
    if (!message || typeof message !== "object") continue;
    const role = normalizeOptionalText(message.role) || "user";
    if (role === "system") continue;
    blocks.push({ type: "text", text: `[${role}]` });
    for (const item of contentItems(message.content)) {
      const descriptor = imageContentDescriptor(item);
      if (descriptor) {
        const reference = imageReferences[imageIndex];
        imageIndex += 1;
        if (reference) {
          blocks.push({
            type: "resource_link",
            uri: reference.uri,
            name: reference.name,
            mimeType: reference.mimeType,
          });
        } else {
          blocks.push({ type: "text", text: "[image input unavailable]" });
        }
        continue;
      }
      const text = textContentItem(item);
      if (text) blocks.push({ type: "text", text });
    }
    blocks.push({ type: "text", text: `[/${role}]` });
  }
  return JSON.stringify(blocks);
}

async function materializeGrokPromptImages(messages, tempDir) {
  if (!Array.isArray(messages)) return [];
  const references = [];
  let imageIndex = 0;
  for (const message of messages) {
    if (!message || typeof message !== "object") continue;
    for (const item of contentItems(message.content)) {
      const descriptor = imageContentDescriptor(item);
      if (!descriptor) continue;
      if (descriptor.data) {
        const fileName = `input-image-${imageIndex + 1}.${imageExtension(descriptor.mimeType)}`;
        const filePath = path.join(tempDir, fileName);
        await fsp.writeFile(filePath, descriptor.data);
        references.push({
          uri: pathToFileURL(filePath).href,
          name: fileName,
          mimeType: descriptor.mimeType,
        });
      } else {
        references.push({
          uri: descriptor.uri,
          name: `input-image-${imageIndex + 1}`,
          mimeType: descriptor.mimeType,
        });
      }
      imageIndex += 1;
    }
  }
  return references;
}

function contentToText(content) {
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content.map((item) => {
      if (typeof item === "string") return item;
      if (item && typeof item === "object" && typeof item.text === "string") return item.text;
      return "";
    }).filter(Boolean).join("\n");
  }
  if (content && typeof content === "object") {
    return JSON.stringify(content);
  }
  return "";
}

function buildGrokTranscript(messages) {
  if (!Array.isArray(messages)) {
    return "";
  }
  return messages.map((message) => {
    const role = normalizeOptionalText(message?.role) || "user";
    return `[${role}]\n${contentToText(message?.content)}\n[/${role}]`;
  }).join("\n\n");
}

function parseJsonValueAt(text, start) {
  const stack = [];
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const character = text[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === '"') {
        inString = false;
      }
      continue;
    }
    if (character === '"') {
      inString = true;
      continue;
    }
    if (character === "{" || character === "[") {
      stack.push(character);
      continue;
    }
    if (character === "}" || character === "]") {
      const opening = stack.at(-1);
      if ((character === "}" && opening !== "{") || (character === "]" && opening !== "[")) {
        return undefined;
      }
      stack.pop();
      if (stack.length === 0) {
        try {
          return { value: JSON.parse(text.slice(start, index + 1)), end: index + 1 };
        } catch {
          return undefined;
        }
      }
    }
  }
  return undefined;
}

function findLongestJsonValue(value) {
  const text = String(value || "").trim();
  try {
    return JSON.parse(text);
  } catch {
    // Search embedded JSON below.
  }
  let best;
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] !== "{" && text[index] !== "[") continue;
    const parsed = parseJsonValueAt(text, index);
    if (parsed) {
      if (!best || parsed.end - index > best.span) {
        best = { value: parsed.value, span: parsed.end - index };
      }
    }
  }
  return best?.value;
}

function parseGrokCliOutput(stdout) {
  const payload = findLongestJsonValue(stdout);
  if (!payload || typeof payload !== "object") {
    throw new GrokCliError("Grok CLI 返回的不是有效 JSON。");
  }
  const text = contentToText(payload.text ?? payload.content ?? payload.message?.content);
  if (!text.trim()) {
    throw new GrokCliError("Grok CLI 没有返回 assistant message。");
  }
  return text;
}

function extractOutputSchema(body) {
  const responseFormat = body?.response_format;
  if (responseFormat?.type === "json_schema" && responseFormat.json_schema?.schema) {
    return responseFormat.json_schema.schema;
  }
  if (responseFormat?.type === "json_object") {
    return { type: "object" };
  }
  const firstTool = Array.isArray(body?.tools) ? body.tools.find((tool) => tool?.function?.parameters) : undefined;
  return firstTool?.function?.parameters;
}

async function runGrokCli(input, dependencies = {}) {
  const executable = input.executable || resolveGrokCliPath();
  const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), "grok-cli-bridge-"));
  const spawnImpl = dependencies.spawnImpl || spawn;
  const timeoutMs = Math.max(1000, Math.floor((Number(input.timeoutSeconds) || DEFAULT_GROK_CLI_TIMEOUT_SECONDS) * 1000));

  try {
    const promptPath = path.join(tempDir, "prompt.txt");
    const schemaJson = input.schema ? JSON.stringify(input.schema) : undefined;
    const transcript = input.transcript ?? buildGrokTranscript(input.messages);
    await fsp.writeFile(promptPath, transcript, "utf8");
    const imageReferences = await materializeGrokPromptImages(input.messages, tempDir);
    const promptJson = imageReferences.length > 0
      ? buildGrokPromptJson(input.messages, imageReferences)
      : undefined;
    const command = buildGrokCliCommand({
      executable,
      promptPath,
      promptJson,
      model: input.model,
      reasoningEffort: input.reasoningEffort ?? DEFAULT_GROK_REASONING_EFFORT,
      systemPrompt: input.systemPrompt,
      schemaJson,
      cwd: tempDir,
    });
    const output = await new Promise((resolve, reject) => {
      const child = spawnImpl(command[0], command.slice(1), {
        cwd: tempDir,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      });
      let stdout = "";
      let stderr = "";
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        child.kill();
        reject(new GrokCliError(`Grok CLI 调用超时（${Math.round(timeoutMs / 1000)} 秒）。`));
      }, timeoutMs);
      child.stdout?.setEncoding?.("utf8");
      child.stderr?.setEncoding?.("utf8");
      child.stdout?.on("data", (chunk) => { stdout += chunk; });
      child.stderr?.on("data", (chunk) => { stderr += chunk; });
      child.once("error", (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(new GrokCliError(`Grok CLI 无法启动：${error.message}`));
      });
      child.once("close", (code) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (code !== 0) {
          const detail = (stderr || stdout || "无进程输出").trim().slice(0, 500);
          reject(new GrokCliError(`Grok CLI 调用失败（exit ${code}）：${detail}`));
          return;
        }
        try {
          resolve(parseGrokCliOutput(stdout));
        } catch (error) {
          reject(error);
        }
      });
    });
    return output;
  } finally {
    await fsp.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

module.exports = {
  DEFAULT_GROK_CLI_API_KEY,
  DEFAULT_GROK_CLI_BASE_URL,
  DEFAULT_GROK_CLI_MODEL,
  DEFAULT_GROK_CLI_TIMEOUT_SECONDS,
  GrokCliError,
  buildGrokCliCommand,
  buildGrokPromptJson,
  buildGrokTranscript,
  extractOutputSchema,
  findLongestJsonValue,
  isGrokCliAvailable,
  normalizeCliModel,
  parseGrokCliOutput,
  materializeGrokPromptImages,
  resolveGrokCliPath,
  runGrokCli,
};
