const fs = require("node:fs");
const path = require("node:path");

function readGlb(filePath) {
  const buffer = fs.readFileSync(filePath);
  if (buffer.toString("ascii", 0, 4) !== "glTF") throw new Error(`not a GLB: ${filePath}`);
  const jsonLength = buffer.readUInt32LE(12);
  const jsonStart = 20;
  return {
    buffer,
    json: JSON.parse(buffer.subarray(jsonStart, jsonStart + jsonLength).toString("utf8")),
    binaryStart: jsonStart + jsonLength + 8,
  };
}

function animationDuration(glb, animation) {
  return Math.max(
    0,
    ...(animation.samplers ?? []).flatMap((sampler) => {
      const accessor = glb.json.accessors[sampler.input];
      const view = glb.json.bufferViews[accessor.bufferView];
      const offset = glb.binaryStart + (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
      return Array.from({ length: accessor.count }, (_, index) => glb.buffer.readFloatLE(offset + index * 4));
    }),
  );
}

const [selectionArg, glbArg] = process.argv.slice(2);
if (!selectionArg || !glbArg) {
  throw new Error("usage: node sync_animation_catalog_durations.cjs <selection.json> <catalog.glb>");
}

const selectionPath = path.resolve(selectionArg);
const glbPath = path.resolve(glbArg);
const selection = JSON.parse(fs.readFileSync(selectionPath, "utf8"));
const glb = readGlb(glbPath);
const animations = new Map((glb.json.animations ?? []).map((animation) => [animation.name, animation]));
let updated = 0;
for (const clip of selection.clips ?? []) {
  const animation = animations.get(clip.clipName);
  if (!animation) throw new Error(`GLB missing selected clip: ${clip.clipName}`);
  const duration = Number(animationDuration(glb, animation).toFixed(4));
  clip.sourceDurationSeconds ??= clip.durationSeconds;
  clip.catalogDurationSeconds = duration;
  clip.durationSeconds = duration;
  updated += 1;
}
fs.writeFileSync(selectionPath, `${JSON.stringify(selection, null, 2)}\n`, "utf8");
console.log(`synced ${updated} catalog durations from ${glbPath} -> ${selectionPath}`);
