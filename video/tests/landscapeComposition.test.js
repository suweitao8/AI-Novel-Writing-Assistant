import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const VIDEO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return fs.readFileSync(path.join(VIDEO_ROOT, relativePath), "utf8");
}

test("Remotion root exposes the landscape DramaEpisodeVideo composition", () => {
  const root = read("src/Root.tsx");
  assert.match(root, /id="DramaEpisodeVideo"/);
  assert.match(root, /width:\s*1280/);
  assert.match(root, /height:\s*720/);
  assert.match(root, /fps:\s*24/);
});

test("scene props carry a deterministic frame range and landscape media source", () => {
  const types = read("src/types.ts");
  const composition = read("src/DramaEpisodeVideo.tsx");
  assert.match(types, /startFrame/);
  assert.match(types, /durationInFrames/);
  assert.match(types, /image\?/);
  assert.match(types, /kind/);
  assert.match(composition, /Sequence/);
  assert.match(composition, /useVideoConfig/);
});
