import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "../..");
const MODELS_DIR = path.join(REPO_ROOT, "client/public/models/cine57");
const AUDIT_PATH = path.join(SCRIPT_DIR, "model-library-import-audit.json");
const CATALOG_PATH = path.join(REPO_ROOT, "client/src/config/modelLibrary.ts");
const QUARANTINE_DIR = "D:/UnrealWorkspace/Cine57-model-quality-quarantine-20260902-preview";
const MANIFEST_PATH = path.join(QUARANTINE_DIR, "legacy-lossy-alpha-outputs.manifest.json");

function sha256(filePath) {
  return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function toLocalPath(textureUrl) {
  const relative = textureUrl.replace(/^\/models\//, "");
  const resolved = path.resolve(REPO_ROOT, "client/public/models", relative);
  const root = path.resolve(MODELS_DIR);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new Error("Unsafe texture path: " + textureUrl);
  }
  return resolved;
}

function getCandidates() {
  const audit = JSON.parse(fs.readFileSync(AUDIT_PATH, "utf8"));
  const catalog = fs.readFileSync(CATALOG_PATH, "utf8");
  const candidates = [];
  for (const [replacementUrl, record] of Object.entries(audit.textures ?? {})) {
    if (!record?.preserveAlpha || !/\.png$/i.test(replacementUrl)) continue;
    const oldUrl = replacementUrl.replace(/\.png$/i, ".jpg");
    const sourcePath = toLocalPath(oldUrl);
    if (!fs.existsSync(sourcePath)) continue;
    if (catalog.includes(oldUrl)) {
      throw new Error("Legacy JPG is still referenced by the generated catalog: " + oldUrl);
    }
    const stat = fs.statSync(sourcePath);
    candidates.push({
      modelIds: (record.references ?? []).map((reference) => reference.modelId),
      sourceUrl: oldUrl,
      replacementUrl,
      sourcePath,
      sizeBytes: stat.size,
      sha256: sha256(sourcePath),
      status: "planned",
      restorable: true,
    });
  }
  const sourcePaths = new Set(candidates.map((candidate) => candidate.sourcePath));
  if (sourcePaths.size !== candidates.length) throw new Error("Quarantine plan contains duplicate source paths");
  return candidates.sort((a, b) => a.sourcePath.localeCompare(b.sourcePath));
}

function getDestinationPath(candidate) {
  const destinationPath = path.resolve(QUARANTINE_DIR, "legacy-lossy-basecolor", path.basename(candidate.sourcePath));
  const quarantineRoot = path.resolve(QUARANTINE_DIR);
  const repoRoot = path.resolve(REPO_ROOT);
  if (destinationPath.startsWith(repoRoot + path.sep) || !destinationPath.startsWith(quarantineRoot + path.sep)) {
    throw new Error("Quarantine destination must remain outside the repository: " + destinationPath);
  }
  return destinationPath;
}

function buildManifest(entries) {
  return {
    version: 1,
    location: "external",
    evidence: "model-preview-alpha-reimport-2026-09-02",
    reason: "旧导入器将带 alpha 的 RGBA baseColor 输出为 JPG；现已由同源 PNG 替代，旧 JPG 不再允许进入发布目录",
    sourceRepository: REPO_ROOT,
    quarantineDirectory: QUARANTINE_DIR,
    restoreRule: "copy destinationPath back to sourcePath only after re-running the import and preview quality gates",
    entries: entries.map((entry) => ({ ...entry, location: "external" })),
  };
}

function writeManifest(entries) {
  fs.mkdirSync(path.dirname(MANIFEST_PATH), { recursive: true });
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(buildManifest(entries), null, 2) + "\n", "utf8");
}

function applyPlan(candidates) {
  const entries = candidates.map((candidate) => ({
    ...candidate,
    destinationPath: getDestinationPath(candidate),
  }));
  writeManifest(entries);
  for (const entry of entries) {
    fs.mkdirSync(path.dirname(entry.destinationPath), { recursive: true });
    if (fs.existsSync(entry.destinationPath)) {
      if (sha256(entry.destinationPath) !== entry.sha256) {
        throw new Error("Existing quarantine file hash mismatch: " + entry.destinationPath);
      }
    } else {
      fs.copyFileSync(entry.sourcePath, entry.destinationPath);
    }
    const destinationStat = fs.statSync(entry.destinationPath);
    if (destinationStat.size !== entry.sizeBytes || sha256(entry.destinationPath) !== entry.sha256) {
      throw new Error("Quarantine backup verification failed: " + entry.destinationPath);
    }
    if (fs.existsSync(entry.sourcePath)) fs.unlinkSync(entry.sourcePath);
    if (fs.existsSync(entry.sourcePath)) throw new Error("Source file was not removed after verified backup: " + entry.sourcePath);
    entry.status = "quarantined";
    writeManifest(entries);
  }
  return entries;
}

function main() {
  const candidates = getCandidates();
  if (!process.argv.includes("--apply")) {
    console.log("quarantine dry-run: " + candidates.length + " legacy alpha JPG outputs");
    for (const candidate of candidates) {
      console.log(candidate.sourceUrl + " -> " + candidate.replacementUrl + " sha256=" + candidate.sha256);
    }
    return;
  }
  if (candidates.length === 0 && fs.existsSync(MANIFEST_PATH)) {
    const existingManifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
    if (Array.isArray(existingManifest.entries)) writeManifest(existingManifest.entries);
    console.log("quarantine manifest already contains no remaining source candidates: " + MANIFEST_PATH);
    return;
  }
  const entries = applyPlan(candidates);
  console.log("quarantined legacy alpha JPG outputs: " + entries.length);
  console.log("manifest: " + MANIFEST_PATH);
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === path.resolve(fileURLToPath(import.meta.url))) main();
