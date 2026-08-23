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
  assert.match(root, /landscape 16:9/);
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

test("subtitle layer uses the old-project blurred shadow without a black panel", () => {
  const composition = read("src/DramaEpisodeVideo.tsx");
  const subtitleLayer = composition.slice(composition.indexOf("function SubtitleLayer"));

  assert.match(subtitleLayer, /fontFamily:\s*['"][^\n]*SimHei, [^\n]*Microsoft YaHei/);
  assert.match(subtitleLayer, /textShadow:\s*[`\"']0 4px 12px rgba\(0,0,0,\.9\)/);
  assert.doesNotMatch(subtitleLayer, /backgroundColor:\s*[`\"']rgba\(0, 0, 0/);
  assert.doesNotMatch(subtitleLayer, /borderRadius:/);
  assert.doesNotMatch(subtitleLayer, /padding:\s*[`\"]12px 24px/);
});

test("narration subtitles omit the speaker label while dialogue subtitles keep it", () => {
  const composition = read("src/DramaEpisodeVideo.tsx");
  const subtitleLayer = composition.slice(composition.indexOf("function SubtitleLayer"));

  assert.match(subtitleLayer, /active\.type === "narration"/);
  assert.match(subtitleLayer, /!isNarration/);
  assert.match(subtitleLayer, /active\.speaker/);
});
