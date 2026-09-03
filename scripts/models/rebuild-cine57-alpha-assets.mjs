import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  hasAlphaPixelFormat,
  parseAlphaMinimum,
  parseFfprobePixelFormat,
  shouldPreserveAlpha,
} from "./textureAlpha.mjs";

const run = promisify(execFile);
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "../..");
const MODELS_DIR = path.join(REPO_ROOT, "client/public/models/cine57");
const CATALOG_PATH = path.join(REPO_ROOT, "client/src/config/modelLibrary.ts");
const AUDIT_PATH = path.join(SCRIPT_DIR, "model-library-import-audit.json");
const DEFAULT_EXPORT_DIRS = [2, 3, 4, 5, 6].map((batch) => `D:/UnrealWorkspace/Cine57-exported${batch}`);
const MODEL_TEXTURE_PREFIX = "/models/cine57/tex/";
const BASE_COLOR_EXTENSIONS = /\.(?:jpg|jpeg|png)$/i;
const JPEG_EXTENSIONS = /\.(?:jpg|jpeg)$/i;
const PNG_SCALE_FILTER = "scale='min(2048,iw)':'min(2048,ih)':force_original_aspect_ratio=decrease";

function isBaseColorUrl(value) {
  return typeof value === "string" && value.startsWith(MODEL_TEXTURE_PREFIX) && BASE_COLOR_EXTENSIONS.test(value);
}

export function getPngOutputUrl(outputUrl) {
  return outputUrl.replace(JPEG_EXTENSIONS, ".png");
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

function rewriteMaterialObject(source, replacements, importAuditByTexture) {
  let rewritten = source;
  for (const [oldUrl, nextUrl] of replacements) {
    const oldBaseColor = `"baseColor":${JSON.stringify(oldUrl)}`;
    if (!rewritten.includes(oldBaseColor)) continue;
    const nextBaseColor = `"baseColor":${JSON.stringify(nextUrl)}`;
    rewritten = rewritten.split(oldBaseColor).join(nextBaseColor);
    const audit = importAuditByTexture instanceof Map
      ? importAuditByTexture.get(oldUrl)
      : importAuditByTexture?.[oldUrl];
    if (!audit?.preserveAlpha) continue;
    const nextOpacity = `"opacity":${JSON.stringify(nextUrl)}`;
    if (/"opacity":"[^"]*"/.test(rewritten)) {
      rewritten = rewritten.replace(/"opacity":"[^"]*"/, nextOpacity);
    } else {
      rewritten = rewritten.replace(nextBaseColor, `${nextBaseColor},${nextOpacity}`);
    }
  }
  return rewritten;
}

/** Rewrite generated catalog texture URLs without hand-editing modelLibrary.ts. */
export function rewriteCatalogMaterials(source, replacements, importAuditByTexture) {
  const newline = source.includes("\r\n") ? "\r\n" : "\n";
  return source.split(/\r?\n/).map((line) => {
    const marker = "materials: ";
    const markerStart = line.indexOf(marker);
    if (markerStart < 0) return line;
    const valueStart = markerStart + marker.length;
    if (line[valueStart] !== "{") throw new Error("Generated materials field is not an object");
    const valueEnd = findMatchingDelimiter(line, valueStart);
    const materialsSource = line.slice(valueStart, valueEnd);
    let cursor = 1;
    let rewritten = materialsSource;
    const replacementsInLine = [];
    while (cursor < materialsSource.length - 1) {
      const objectStart = materialsSource.indexOf("{", cursor);
      if (objectStart < 0 || objectStart >= materialsSource.length - 1) break;
      const objectEnd = findMatchingDelimiter(materialsSource, objectStart);
      replacementsInLine.push({
        start: objectStart,
        end: objectEnd,
        value: rewriteMaterialObject(materialsSource.slice(objectStart, objectEnd), replacements, importAuditByTexture),
      });
      cursor = objectEnd;
    }
    if (replacementsInLine.length === 0) return line;
    const parts = [];
    let sourceCursor = 0;
    for (const replacement of replacementsInLine) {
      parts.push(materialsSource.slice(sourceCursor, replacement.start), replacement.value);
      sourceCursor = replacement.end;
    }
    parts.push(materialsSource.slice(sourceCursor));
    rewritten = parts.join("");
    return `${line.slice(0, valueStart)}${rewritten}${line.slice(valueEnd)}`;
  }).join(newline);
}

function resolveSourcePath(sourceName, exportDirs) {
  return exportDirs
    .map((exportDir) => path.join(exportDir, "tex", sourceName))
    .find((candidate) => fs.existsSync(candidate)) ?? null;
}

function getOutputPath(outputUrl) {
  const relative = outputUrl.slice(`${MODEL_TEXTURE_PREFIX}`.length);
  const resolved = path.resolve(MODELS_DIR, "tex", relative);
  const textureRoot = path.resolve(MODELS_DIR, "tex");
  if (resolved !== textureRoot && !resolved.startsWith(`${textureRoot}${path.sep}`)) {
    throw new Error(`Unsafe catalog texture path: ${outputUrl}`);
  }
  return resolved;
}

function collectBaseColorTextures(library) {
  const textures = new Map();
  for (const entry of library.filter((candidate) => candidate.fileUrl?.startsWith("/models/cine57/"))) {
    for (const [materialName, material] of Object.entries(entry.materials ?? {})) {
      if (!isBaseColorUrl(material?.baseColor)) continue;
      const outputUrl = material.baseColor;
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

async function probeSourceAlpha(sourcePath) {
  if (!sourcePath) {
    return { sourcePath: null, sourceStatus: "missing", pixelFormat: "", alphaMinimum: null, preserveAlpha: true };
  }
  try {
    const ffprobeResult = await run("ffprobe", ["-v", "quiet", "-show_streams", "-of", "json", sourcePath]);
    const pixelFormat = parseFfprobePixelFormat(ffprobeResult);
    if (!hasAlphaPixelFormat(pixelFormat)) {
      return { sourcePath, sourceStatus: "probed", pixelFormat, alphaMinimum: null, preserveAlpha: false };
    }
    try {
      const ffmpegResult = await run("ffmpeg", ["-hide_banner", "-i", sourcePath, "-vf", "alphaextract,signalstats,metadata=print", "-f", "null", "-"]);
      const output = `${ffmpegResult.stdout}${ffmpegResult.stderr}`;
      const alphaMinimum = parseAlphaMinimum(output);
      return {
        sourcePath,
        sourceStatus: "probed",
        pixelFormat,
        alphaMinimum,
        preserveAlpha: shouldPreserveAlpha({ pixelFormat, ffmpegOutput: output }),
      };
    } catch {
      return { sourcePath, sourceStatus: "probe-failed", pixelFormat, alphaMinimum: null, preserveAlpha: true };
    }
  } catch {
    return { sourcePath, sourceStatus: "probe-failed", pixelFormat: "", alphaMinimum: null, preserveAlpha: true };
  }
}

async function loadLibrary() {
  const moduleUrl = `${pathToFileURL(CATALOG_PATH).href}?model-library-alpha=${Date.now()}`;
  return (await import(moduleUrl)).MODEL_LIBRARY;
}

async function buildAudit(library, exportDirs) {
  const textures = collectBaseColorTextures(library);
  const records = {};
  for (const texture of [...textures.values()].sort((a, b) => a.outputUrl.localeCompare(b.outputUrl))) {
    const sourcePath = resolveSourcePath(texture.sourceName, exportDirs);
    const probe = await probeSourceAlpha(sourcePath);
    records[texture.outputUrl] = {
      sourcePath: probe.sourcePath,
      sourceStatus: probe.sourceStatus,
      pixelFormat: probe.pixelFormat,
      alphaMinimum: probe.alphaMinimum,
      preserveAlpha: probe.preserveAlpha,
      outputFormat: path.extname(texture.outputUrl).slice(1).toLowerCase(),
      references: texture.references.sort((a, b) => `${a.modelId}:${a.materialName}`.localeCompare(`${b.modelId}:${b.materialName}`)),
    };
  }
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    sourceRoots: exportDirs,
    textures: records,
  };
}

async function repairTextures(library, audit, exportDirs) {
  const replacements = new Map();
  for (const [outputUrl, record] of Object.entries(audit.textures)) {
    if (!record.preserveAlpha) continue;
    let nextUrl = outputUrl;
    if (JPEG_EXTENSIONS.test(outputUrl)) {
      const sourceName = path.basename(outputUrl).replace(BASE_COLOR_EXTENSIONS, ".png");
      const sourcePath = resolveSourcePath(sourceName, exportDirs);
      if (!sourcePath) continue;
      nextUrl = getPngOutputUrl(outputUrl);
      const destination = getOutputPath(nextUrl);
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      await run("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-i", sourcePath, "-vf", PNG_SCALE_FILTER, "-vcodec", "png", "-update", "1", destination]);
    } else if (!/\.png$/i.test(outputUrl)) {
      continue;
    }
    // A source alpha channel needs a real PlayCanvas opacityMap, even when
    // the catalog already points at a PNG. The URL-to-itself entry lets the
    // normalizer add or replace that binding without touching opaque maps.
    replacements.set(outputUrl, nextUrl);
  }
  if (replacements.size === 0) return { library, replacements };
  const source = fs.readFileSync(CATALOG_PATH, "utf8");
  fs.writeFileSync(CATALOG_PATH, rewriteCatalogMaterials(source, replacements, audit.textures), "utf8");
  return { library: await loadLibrary(), replacements };
}

async function main() {
  const exportDirs = process.env.CINE57_EXPORT_DIRS?.split(";").map((value) => value.trim()).filter(Boolean) ?? DEFAULT_EXPORT_DIRS;
  const repair = process.argv.includes("--repair");
  const normalizeAlpha = process.argv.includes("--normalize-alpha");
  const writeAudit = process.argv.includes("--write-audit");
  let library = await loadLibrary();
  const reuseAudit = normalizeAlpha && fs.existsSync(AUDIT_PATH);
  let audit = reuseAudit
    ? JSON.parse(fs.readFileSync(AUDIT_PATH, "utf8"))
    : await buildAudit(library, exportDirs);
  if (repair || normalizeAlpha) {
    const result = await repairTextures(library, audit, exportDirs);
    library = result.library;
    if (repair) audit = await buildAudit(library, exportDirs);
    console.log(`repaired alpha texture mappings: ${result.replacements.size}`);
  }
  if (writeAudit) fs.writeFileSync(AUDIT_PATH, `${JSON.stringify(audit, null, 2)}\n`, "utf8");
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
