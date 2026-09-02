import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { cleanGlbFile } from "./glbSanitizer.mjs";
import { validateModelLibrary } from "./modelLibraryQuality.mjs";
import { orderModelEntries } from "./modelLibraryOrdering.mjs";
import {
  CINE57_ALLOWED_MODEL_IDS,
  CINE57_CATEGORY_ORDER,
  CINE57_QUARANTINED_MODEL_FILE_NAMES,
  CINE57_REMOVED_MODEL_IDS,
  getCatalogOverride,
  getCatalogMaterialOverride,
} from "./modelLibraryPolicy.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const MODELS_DIR = path.join(REPO_ROOT, "client/public/models/cine57");
const TEXTURES_DIR = path.join(MODELS_DIR, "tex");
const CATALOG_PATH = path.join(REPO_ROOT, "client/src/config/modelLibrary.ts");
const CATEGORY_ORDER = [...CINE57_CATEGORY_ORDER, "角色"];
const ALLOWED_IDS = new Set(CINE57_ALLOWED_MODEL_IDS);
const REMOVED_IDS = new Set(CINE57_REMOVED_MODEL_IDS);
const QUARANTINED_FILE_NAMES = new Set(CINE57_QUARANTINED_MODEL_FILE_NAMES);

function parseCatalog(source) {
  const lines = source.split(/\r?\n/);
  const entries = [];
  lines.forEach((line, lineIndex) => {
    if (!/^\s*\{ id: /.test(line)) return;
    const id = /\bid: "([^"]+)"/.exec(line)?.[1];
    const name = /\bname: "([^"]+)"/.exec(line)?.[1];
    const category = /\bcategory: "([^"]+)"/.exec(line)?.[1];
    const fileName = /\bfileName: "([^"]+)"/.exec(line)?.[1];
    const fileUrl = /\bfileUrl: "([^"]+)"/.exec(line)?.[1];
    if (!id || !name || !category || !fileName || !fileUrl) throw new Error(`Cannot parse catalog entry at line ${lineIndex + 1}`);
    entries.push({ id, name, category, fileName, fileUrl, lineIndex });
  });
  if (entries.length === 0) throw new Error(`No generated model entries found in ${CATALOG_PATH}`);
  return { lines, entries };
}

function isCine57StaticEntry(entry) {
  return entry.fileUrl.startsWith("/models/cine57/");
}

function assertSafeFileName(fileName) {
  if (path.basename(fileName) !== fileName || fileName.includes("..")) {
    throw new Error(`Unsafe model file name: ${fileName}`);
  }
}

function findObjectEnd(source, objectStart) {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = objectStart; index < source.length; index += 1) {
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
    if (character === "{") depth += 1;
    if (character === "}") {
      depth -= 1;
      if (depth === 0) return index + 1;
    }
  }
  throw new Error("Cannot find end of generated materials object");
}

function replaceCatalogMaterials(line, materials) {
  const marker = "materials: ";
  const markerStart = line.indexOf(marker);
  if (markerStart < 0) throw new Error("Generated materials field is missing");
  const valueStart = markerStart + marker.length;
  if (line[valueStart] !== "{") throw new Error("Generated materials field is not an object");
  const valueEnd = findObjectEnd(line, valueStart);
  return `${line.slice(0, valueStart)}${JSON.stringify(materials)}${line.slice(valueEnd)}`;
}

function replaceCatalogEntries(source, parsed, modelsDir) {
  const newline = source.includes("\r\n") ? "\r\n" : "\n";
  const processedEntries = parsed.entries.flatMap((entry) => {
    if (!isCine57StaticEntry(entry)) return [{ ...entry, line: parsed.lines[entry.lineIndex] }];
    if (REMOVED_IDS.has(entry.id) || !ALLOWED_IDS.has(entry.id)) return [];
    const filePath = path.join(modelsDir, entry.fileName);
    if (!fs.existsSync(filePath)) throw new Error(`Cannot update size for missing ${entry.fileName}`);
    const sourceLine = parsed.lines[entry.lineIndex];
    const sizeKb = Math.round(fs.statSync(filePath).size / 1024);
    if (!/\bsizeKb: \d+/.test(sourceLine)) throw new Error(`Generated sizeKb field is missing for ${entry.id}`);
    const override = getCatalogOverride(entry.id);
    let nextLine = sourceLine.replace(/\bsizeKb: \d+/, `sizeKb: ${sizeKb}`);
    if (override) {
      nextLine = nextLine
        .replace(/\bname: "[^"]+"/, `name: "${override.name}"`)
        .replace(/\bcategory: "[^"]+"/, `category: "${override.category}"`);
    }
    const materialOverride = getCatalogMaterialOverride(entry.id);
    if (materialOverride) nextLine = replaceCatalogMaterials(nextLine, materialOverride);
    return [{
      ...entry,
      name: override?.name ?? entry.name,
      category: override?.category ?? entry.category,
      line: nextLine,
    }];
  });
  const staticEntries = processedEntries.filter(isCine57StaticEntry);
  const orderedStaticEntries = orderModelEntries(staticEntries, {
    categoryOrder: CINE57_CATEGORY_ORDER,
    staticUrlPrefix: "/models/cine57/",
  });
  const orderedEntries = [
    ...orderedStaticEntries,
    ...processedEntries.filter((entry) => !isCine57StaticEntry(entry)),
  ];
  const firstEntryLineIndex = parsed.entries[0].lineIndex;
  const lastEntryLineIndex = parsed.entries[parsed.entries.length - 1].lineIndex;
  if (lastEntryLineIndex - firstEntryLineIndex + 1 !== parsed.entries.length) {
    throw new Error("Generated model entries must occupy a contiguous block");
  }
  const outputLines = [
    ...parsed.lines.slice(0, firstEntryLineIndex),
    ...orderedEntries.map((entry) => entry.line),
    ...parsed.lines.slice(lastEntryLineIndex + 1),
  ];
  const categories = CATEGORY_ORDER.filter((category) =>
    parsed.entries.some((entry) => {
      if (!isCine57StaticEntry(entry)) return entry.category === category;
      if (REMOVED_IDS.has(entry.id) || !ALLOWED_IDS.has(entry.id)) return false;
      return (getCatalogOverride(entry.id)?.category ?? entry.category) === category;
    }),
  );
  const categoryLine = /^export const MODEL_LIBRARY_CATEGORIES = \[[^\r\n]*\] as const;$/m;
  if (!categoryLine.test(outputLines.join(newline))) throw new Error("Generated category declaration is missing");
  return outputLines.join(newline).replace(
    categoryLine,
    `export const MODEL_LIBRARY_CATEGORIES = ${JSON.stringify(categories)} as const;`,
  );
}

function referencedTextureNames(source) {
  const names = new Set();
  for (const match of source.matchAll(/\/models\/cine57\/tex\/([^"\\]+)/g)) names.add(path.basename(match[1]));
  return names;
}

async function loadCatalog() {
  const moduleUrl = `${pathToFileURL(CATALOG_PATH).href}?model-library-check=${Date.now()}`;
  return (await import(moduleUrl)).MODEL_LIBRARY;
}

function formatErrors(errors) {
  return errors.map((error) => `- ${error}`).join("\n");
}

async function main() {
  const checkOnly = process.argv.includes("--check");
  const applyReviewOnly = process.argv.includes("--apply-review-only");
  const source = fs.readFileSync(CATALOG_PATH, "utf8");
  const parsed = parseCatalog(source);
  const removedEntries = parsed.entries.filter((entry) => isCine57StaticEntry(entry) && (REMOVED_IDS.has(entry.id) || !ALLOWED_IDS.has(entry.id)));
  const keptEntries = parsed.entries.filter((entry) => isCine57StaticEntry(entry) && ALLOWED_IDS.has(entry.id) && !REMOVED_IDS.has(entry.id));
  if (keptEntries.length !== ALLOWED_IDS.size) {
    throw new Error(`Curation expects ${ALLOWED_IDS.size} allowlisted entries, found ${keptEntries.length}`);
  }
  for (const entry of parsed.entries) assertSafeFileName(entry.fileName);

  const actualGlbs = fs.readdirSync(MODELS_DIR).filter((fileName) => fileName.endsWith(".glb"));
  const catalogFiles = new Set(parsed.entries.map((entry) => entry.fileName));
  const unknownGlbs = actualGlbs.filter(
    (fileName) => !catalogFiles.has(fileName) && !QUARANTINED_FILE_NAMES.has(fileName),
  );
  if (unknownGlbs.length > 0) throw new Error(`Unknown GLB files would be outside the catalog: ${unknownGlbs.join(", ")}`);

  if (!checkOnly) {
    let cleanedGlbs = 0;
    if (!applyReviewOnly) {
      for (const entry of keptEntries) {
        const result = cleanGlbFile(path.join(MODELS_DIR, entry.fileName));
        if (result.changed) cleanedGlbs += 1;
      }
    }

    const nextSource = replaceCatalogEntries(source, parsed, MODELS_DIR);
    fs.writeFileSync(CATALOG_PATH, nextSource);

    if (!applyReviewOnly) {
      let removedGlbs = 0;
      for (const entry of removedEntries) {
        const filePath = path.join(MODELS_DIR, entry.fileName);
        if (!fs.existsSync(filePath)) continue;
        if (QUARANTINED_FILE_NAMES.has(entry.fileName)) continue;
        fs.unlinkSync(filePath);
        removedGlbs += 1;
      }

      const usedTextures = referencedTextureNames(nextSource);
      let removedTextures = 0;
      if (fs.existsSync(TEXTURES_DIR)) {
        for (const textureName of fs.readdirSync(TEXTURES_DIR)) {
          const texturePath = path.join(TEXTURES_DIR, textureName);
          if (fs.statSync(texturePath).isFile() && !usedTextures.has(textureName)) {
            fs.unlinkSync(texturePath);
            removedTextures += 1;
          }
        }
      }
      console.log(`curated catalog: ${parsed.entries.length} -> ${keptEntries.length}`);
      console.log(`cleaned GLB files: ${cleanedGlbs}; removed GLB files: ${removedGlbs}; removed textures: ${removedTextures}`);
    } else {
      console.log("applied visual review to generated catalog without touching model assets");
    }
  }

  const library = await loadCatalog();
  const errors = validateModelLibrary({ library, modelsDir: MODELS_DIR });
  if (errors.length > 0) throw new Error(`Model library quality gate failed:\n${formatErrors(errors)}`);
  console.log(`model library quality gate passed: ${library.length} entries`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
