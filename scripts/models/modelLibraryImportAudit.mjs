import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  hasAlphaPixelFormat,
  parseAlphaMinimum,
  shouldPreserveAlpha,
} from "./textureAlpha.mjs";

const run = promisify(execFile);
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "../..");
const DEFAULT_MODELS_DIR = path.join(REPO_ROOT, "client/public/models/cine57");
const DEFAULT_CATALOG_PATH = path.join(REPO_ROOT, "client/src/config/modelLibrary.ts");
const DEFAULT_AUDIT_PATH = path.join(SCRIPT_DIR, "model-library-import-audit.json");
const MODEL_TEXTURE_PREFIX = "/models/cine57/tex/";
const BASE_COLOR_EXTENSIONS = /\.(?:jpg|jpeg|png)$/i;
const JPEG_EXTENSIONS = /\.(?:jpg|jpeg)$/i;
const PNG_SCALE_FILTER = "scale='min(2048,iw)':'min(2048,ih)':force_original_aspect_ratio=decrease";
const DEFAULT_EXPORT_DIRS = [2, 3, 4, 5, 6].map(
  (batch) => `D:/UnrealWorkspace/Cine57-exported${batch}`,
);

export const MODEL_LIBRARY_IMPORT_AUDIT_PATH = DEFAULT_AUDIT_PATH;

function isCine57ModelEntry(entry) {
  return typeof entry?.fileUrl === "string" && entry.fileUrl.startsWith("/models/cine57/");
}

function isBaseColorUrl(value) {
  return typeof value === "string"
    && value.startsWith(MODEL_TEXTURE_PREFIX)
    && BASE_COLOR_EXTENSIONS.test(value);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function getAuditRecord(importAuditByTexture, outputUrl) {
  if (importAuditByTexture instanceof Map) return importAuditByTexture.get(outputUrl);
  return importAuditByTexture?.[outputUrl];
}

/** Convert a catalog JPEG Base Color URL to its alpha-preserving PNG URL. */
export function getPngOutputUrl(outputUrl) {
  if (!JPEG_EXTENSIONS.test(String(outputUrl ?? ""))) return outputUrl;
  return String(outputUrl).replace(JPEG_EXTENSIONS, ".png");
}

/** Read the first ffprobe stream pixel format from JSON or raw command output. */
export function parseFfprobePixelFormat(ffprobeOutput) {
  if (ffprobeOutput && typeof ffprobeOutput === "object") {
    return String(ffprobeOutput.streams?.[0]?.pix_fmt ?? "").trim();
  }
  try {
    const parsed = JSON.parse(String(ffprobeOutput ?? ""));
    return String(parsed.streams?.[0]?.pix_fmt ?? "").trim();
  } catch {
    return "";
  }
}

/**
 * Normalize the source texture evidence used by both repair and the quality gate.
 * A failed probe is fail-safe: it is marked unknown and asks the caller to keep
 * alpha rather than silently downgrading a possible cutout texture to JPEG.
 */
export function parseSourceAlphaProbe({ ffprobeOutput, ffmpegOutput } = {}) {
  const pixelFormat = parseFfprobePixelFormat(ffprobeOutput);
  if (!pixelFormat) {
    return {
      sourceStatus: "probe-failed",
      pixelFormat: "",
      alphaMinimum: null,
      preserveAlpha: true,
    };
  }

  if (!hasAlphaPixelFormat(pixelFormat)) {
    return {
      sourceStatus: "probed",
      pixelFormat,
      alphaMinimum: null,
      preserveAlpha: false,
    };
  }

  const alphaMinimum = parseAlphaMinimum(ffmpegOutput);
  return {
    sourceStatus: "probed",
    pixelFormat,
    alphaMinimum,
    preserveAlpha: shouldPreserveAlpha({ pixelFormat, ffmpegOutput }),
  };
}

/** Return Base Color textures once, retaining every model/material reference. */
export function collectCatalogBaseColorTextures(library) {
  const textures = new Map();
  for (const entry of Array.isArray(library) ? library : []) {
    if (!isCine57ModelEntry(entry)) continue;
    for (const [materialName, material] of Object.entries(entry.materials ?? {})) {
      const outputUrl = material?.baseColor;
      if (!isBaseColorUrl(outputUrl)) continue;
      const current = textures.get(outputUrl) ?? {
        outputUrl,
        sourceName: path.basename(outputUrl).replace(BASE_COLOR_EXTENSIONS, ".png"),
        references: [],
      };
      current.references.push({ modelId: entry.id, materialName });
      textures.set(outputUrl, current);
    }
  }
  return textures;
}

function resolveSourcePath(sourceName, exportDirs) {
  for (const exportDir of exportDirs) {
    const candidate = path.join(exportDir, "tex", sourceName);
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function hashFile(filePath) {
  const hash = createHash("sha256");
  hash.update(fs.readFileSync(filePath));
  return hash.digest("hex");
}

/** Return whether a PNG declares a color type with an alpha channel (GA or RGBA). */
export function hasPngAlphaChannel(bytes) {
  return Buffer.isBuffer(bytes)
    && bytes.length >= 26
    && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    && bytes.subarray(12, 16).toString("ascii") === "IHDR"
    && [4, 6].includes(bytes[25]);
}

function inspectOutputFile(filePath, outputFormat) {
  if (!fs.existsSync(filePath)) {
    return {
      outputStatus: "missing",
      outputSha256: null,
      outputAlphaChannel: null,
    };
  }
  const bytes = fs.readFileSync(filePath);
  return {
    outputStatus: "verified",
    outputSha256: hashFile(filePath),
    outputAlphaChannel: outputFormat === "png" ? hasPngAlphaChannel(bytes) : null,
  };
}

async function probeSourceAlpha(sourcePath) {
  if (!sourcePath) {
    return {
      sourcePath: null,
      sourceSha256: null,
      ...parseSourceAlphaProbe(),
    };
  }

  try {
    const ffprobeResult = await run("ffprobe", ["-v", "quiet", "-show_streams", "-of", "json", sourcePath]);
    const pixelFormat = parseFfprobePixelFormat(ffprobeResult.stdout);
    if (!hasAlphaPixelFormat(pixelFormat)) {
      return {
        sourcePath,
        sourceSha256: hashFile(sourcePath),
        ...parseSourceAlphaProbe({ ffprobeOutput: ffprobeResult.stdout }),
      };
    }

    try {
      const ffmpegResult = await run("ffmpeg", [
        "-hide_banner",
        "-i",
        sourcePath,
        "-vf",
        "alphaextract,signalstats,metadata=print",
        "-f",
        "null",
        "-",
      ]);
      return {
        sourcePath,
        sourceSha256: hashFile(sourcePath),
        ...parseSourceAlphaProbe({
          ffprobeOutput: ffprobeResult.stdout,
          ffmpegOutput: `${ffmpegResult.stdout}\n${ffmpegResult.stderr}`,
        }),
      };
    } catch {
      return {
        sourcePath,
        sourceSha256: hashFile(sourcePath),
        sourceStatus: "probe-failed",
        pixelFormat,
        alphaMinimum: null,
        preserveAlpha: true,
      };
    }
  } catch {
    return {
      sourcePath,
      sourceSha256: hashFile(sourcePath),
      sourceStatus: "probe-failed",
      pixelFormat: "",
      alphaMinimum: null,
      preserveAlpha: true,
    };
  }
}

export function shouldRepairAlphaTexture(record) {
  const outputFormat = String(record?.outputFormat ?? "").trim().toLowerCase();
  const outputUrl = String(record?.outputUrl ?? "");
  return record?.preserveAlpha === true
    && (outputFormat === "jpg" || outputFormat === "jpeg" || JPEG_EXTENSIONS.test(outputUrl));
}

/** Build the committed source-to-output alpha evidence for a catalog. */
export async function buildModelLibraryImportAudit(
  library,
  exportDirs = DEFAULT_EXPORT_DIRS,
  { modelsDir = DEFAULT_MODELS_DIR } = {},
) {
  const textures = {};
  for (const texture of [...collectCatalogBaseColorTextures(library).values()]
    .sort((left, right) => left.outputUrl.localeCompare(right.outputUrl))) {
    const sourcePath = resolveSourcePath(texture.sourceName, exportDirs);
    const probe = await probeSourceAlpha(sourcePath);
    const outputFormat = path.extname(texture.outputUrl).slice(1).toLowerCase();
    const output = inspectOutputFile(getOutputPath(texture.outputUrl, modelsDir), outputFormat);
    textures[texture.outputUrl] = {
      sourceName: texture.sourceName,
      sourceSha256: probe.sourceSha256,
      sourceStatus: probe.sourceStatus,
      pixelFormat: probe.pixelFormat,
      alphaMinimum: probe.alphaMinimum,
      preserveAlpha: probe.preserveAlpha,
      outputFormat,
      ...output,
      references: [...texture.references].sort((left, right) =>
        `${left.modelId}:${left.materialName}`.localeCompare(`${right.modelId}:${right.materialName}`)),
    };
  }
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    sourceRoots: exportDirs.map((exportDir) => path.basename(exportDir)),
    textures,
  };
}

function isSha256(value) {
  return /^[a-f0-9]{64}$/i.test(String(value ?? ""));
}

/** Validate the committed source-to-published-texture evidence against the current catalog. */
export function validateModelLibraryImportAudit({ library = [], audit, modelsDir = DEFAULT_MODELS_DIR } = {}) {
  const errors = [];
  if (!audit || typeof audit !== "object") return ["model library import audit document is missing"];
  if (audit.version !== 1) errors.push(`model library import audit version is unsupported: ${audit.version}`);
  if (!audit.textures || typeof audit.textures !== "object" || Array.isArray(audit.textures)) {
    return [...errors, "model library import audit textures must be an object"];
  }

  const expected = collectCatalogBaseColorTextures(library);
  const expectedUrls = new Set(expected.keys());
  for (const outputUrl of expectedUrls) {
    const record = audit.textures[outputUrl];
    if (!record || typeof record !== "object") {
      errors.push(`model library import audit is missing texture: ${outputUrl}`);
      continue;
    }
    const expectedFormat = path.extname(outputUrl).slice(1).toLowerCase();
    if (!isNonEmptyString(record.sourceName)) errors.push(`import audit sourceName is missing: ${outputUrl}`);
    if (!new Set(["probed", "probe-failed"]).has(record.sourceStatus)) {
      errors.push(`import audit source probe is not fail-safe: ${outputUrl}`);
    }
    if (record.sourceStatus === "probed" && !isSha256(record.sourceSha256)) {
      errors.push(`import audit sourceSha256 is missing: ${outputUrl}`);
    }
    if (record.sourceStatus === "probe-failed" && record.preserveAlpha !== true) {
      errors.push(`import audit failed source probe must preserve alpha: ${outputUrl}`);
    }
    if (typeof record.preserveAlpha !== "boolean") {
      errors.push(`import audit preserveAlpha must be boolean: ${outputUrl}`);
    }
    if (String(record.outputFormat ?? "").toLowerCase() !== expectedFormat) {
      errors.push(`import audit outputFormat does not match catalog: ${outputUrl}`);
    }
    if (record.outputStatus !== "verified" || !isSha256(record.outputSha256)) {
      errors.push(`import audit output file is not verified: ${outputUrl}`);
    }
    if (expectedFormat === "png" && record.preserveAlpha === true && record.outputAlphaChannel !== true) {
      errors.push(`import audit alpha-preserving PNG has no alpha channel: ${outputUrl}`);
    }

    const expectedReferences = [...(expected.get(outputUrl)?.references ?? [])]
      .sort((left, right) => `${left.modelId}:${left.materialName}`.localeCompare(`${right.modelId}:${right.materialName}`));
    const actualReferences = [...(Array.isArray(record.references) ? record.references : [])]
      .sort((left, right) => `${left.modelId}:${left.materialName}`.localeCompare(`${right.modelId}:${right.materialName}`));
    if (JSON.stringify(actualReferences) !== JSON.stringify(expectedReferences)) {
      errors.push(`import audit references are stale: ${outputUrl}`);
    }

    if (modelsDir && record.outputStatus === "verified") {
      try {
        const current = inspectOutputFile(getOutputPath(outputUrl, modelsDir), expectedFormat);
        if (current.outputStatus !== "verified" || current.outputSha256 !== record.outputSha256) {
          errors.push(`import audit output hash is stale: ${outputUrl}`);
        }
        if (expectedFormat === "png" && record.outputAlphaChannel !== current.outputAlphaChannel) {
          errors.push(`import audit output alpha evidence is stale: ${outputUrl}`);
        }
      } catch (error) {
        errors.push(`import audit output path is unsafe: ${outputUrl} (${error instanceof Error ? error.message : String(error)})`);
      }
    }
  }

  for (const outputUrl of Object.keys(audit.textures)) {
    if (!expectedUrls.has(outputUrl)) errors.push(`import audit references texture outside catalog: ${outputUrl}`);
  }
  return errors;
}

function findMatchingDelimiter(source, start) {
  const stack = [];
  let inString = false;
  let escaped = false;
  for (let index = start; index < source.length; index += 1) {
    const character = source[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') {
      inString = true;
      continue;
    }
    if (character === "{" || character === "[") stack.push(character);
    if (character === "}" || character === "]") {
      const expected = character === "}" ? "{" : "[";
      if (stack.pop() !== expected) throw new Error("Generated materials delimiters are unbalanced");
      if (stack.length === 0) return index + 1;
    }
  }
  throw new Error("Cannot find end of generated materials object");
}

/** Rewrite generated catalog material objects without touching unrelated lines. */
export function rewriteCatalogAlphaMappings(source, replacements, importAuditByTexture) {
  const newline = source.includes("\r\n") ? "\r\n" : "\n";
  return source.split(/\r?\n/).map((line) => {
    const marker = "materials: ";
    const markerStart = line.indexOf(marker);
    if (markerStart < 0) return line;
    if (!line.includes(MODEL_TEXTURE_PREFIX)) return line;
    const valueStart = markerStart + marker.length;
    if (line[valueStart] !== "{") throw new Error("Generated materials field is not an object");
    const valueEnd = findMatchingDelimiter(line, valueStart);
    const materialsSource = line.slice(valueStart, valueEnd);
    const materials = JSON.parse(materialsSource);
    let changed = false;

    for (const material of Object.values(materials)) {
      const oldUrl = material?.baseColor;
      if (!replacements.has(oldUrl)) continue;
      const nextUrl = replacements.get(oldUrl);
      if (material.baseColor !== nextUrl) {
        material.baseColor = nextUrl;
        changed = true;
      }
      const audit = getAuditRecord(importAuditByTexture, oldUrl);
      if (audit?.preserveAlpha === true
        && (typeof material.opacity !== "string" || material.opacity.trim().length === 0)) {
        material.opacity = nextUrl;
        changed = true;
      }
    }
    if (!changed) return line;
    return `${line.slice(0, valueStart)}${JSON.stringify(materials)}${line.slice(valueEnd)}`;
  }).join(newline);
}

function getOutputPath(outputUrl, modelsDir) {
  if (!outputUrl.startsWith(MODEL_TEXTURE_PREFIX)) throw new Error(`Unsafe catalog texture path: ${outputUrl}`);
  const root = path.resolve(modelsDir, "tex");
  const resolved = path.resolve(root, outputUrl.slice(MODEL_TEXTURE_PREFIX.length));
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error(`Unsafe catalog texture path: ${outputUrl}`);
  }
  return resolved;
}

async function repairAlphaTextures({ library, audit, exportDirs, modelsDir, catalogPath }) {
  const replacements = new Map();
  for (const [outputUrl, record] of Object.entries(audit.textures ?? {})) {
    if (!shouldRepairAlphaTexture({ ...record, outputUrl })) continue;
    const sourcePath = resolveSourcePath(record.sourceName, exportDirs);
    if (!sourcePath) continue;
    const nextUrl = getPngOutputUrl(outputUrl);
    const destination = getOutputPath(nextUrl, modelsDir);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    await run("ffmpeg", [
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      sourcePath,
      "-vf",
      PNG_SCALE_FILTER,
      "-vcodec",
      "png",
      "-update",
      "1",
      destination,
    ]);
    replacements.set(outputUrl, nextUrl);
  }

  if (replacements.size > 0) {
    const source = fs.readFileSync(catalogPath, "utf8");
    const rewritten = rewriteCatalogAlphaMappings(source, replacements, audit.textures);
    if (rewritten !== source) fs.writeFileSync(catalogPath, rewritten, "utf8");
  }
  return replacements;
}

async function loadLibrary(catalogPath) {
  const moduleUrl = `${pathToFileURL(catalogPath).href}?model-library-import-audit=${Date.now()}`;
  return (await import(moduleUrl)).MODEL_LIBRARY;
}

function parseExportDirs() {
  return process.env.CINE57_EXPORT_DIRS?.split(";").map((value) => value.trim()).filter(Boolean)
    ?? DEFAULT_EXPORT_DIRS;
}

async function main() {
  const exportDirs = parseExportDirs();
  const repair = process.argv.includes("--repair");
  const writeAudit = process.argv.includes("--write-audit") || repair;
  const catalogPath = DEFAULT_CATALOG_PATH;
  const modelsDir = DEFAULT_MODELS_DIR;
  let library = await loadLibrary(catalogPath);
  let audit = await buildModelLibraryImportAudit(library, exportDirs);

  if (repair) {
    const replacements = await repairAlphaTextures({
      library,
      audit,
      exportDirs,
      modelsDir,
      catalogPath,
    });
    library = await loadLibrary(catalogPath);
    audit = await buildModelLibraryImportAudit(library, exportDirs);
    console.log(`repaired alpha texture mappings: ${replacements.size}`);
  }
  if (writeAudit) fs.writeFileSync(DEFAULT_AUDIT_PATH, `${JSON.stringify(audit, null, 2)}\n`, "utf8");

  const records = Object.values(audit.textures);
  const preserved = records.filter((record) => record.preserveAlpha).length;
  const unknown = records.filter((record) => record.sourceStatus !== "probed").length;
  console.log(`model import audit: textures=${records.length}; preserveAlpha=${preserved}; unknown=${unknown}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
