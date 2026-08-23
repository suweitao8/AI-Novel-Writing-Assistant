import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const VIDEO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return fs.readFileSync(path.join(VIDEO_ROOT, relativePath), "utf8");
}

function loadTypeScriptModule(relativePath) {
  const transformed = ts.transpileModule(read(relativePath), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  });
  const module = { exports: {} };
  new Function("module", "exports", transformed.outputText)(module, module.exports);
  return module.exports;
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

test("subtitle lookup uses the ordered cue timeline instead of scanning every cue per frame", () => {
  const composition = read("src/DramaEpisodeVideo.tsx");

  assert.match(composition, /useMemo\(\(\) => buildDramaSubtitleLookup\(subtitles\)/);
  assert.match(composition, /findActiveSubtitle\(lookup, frame\)/);
  assert.doesNotMatch(composition, /const active = subtitles\.find\(/);
});

test("subtitle lookup preserves the original first-active behavior for overlapping cues", () => {
  const { buildDramaSubtitleLookup, findActiveSubtitle } = loadTypeScriptModule("src/subtitleLookup.ts");
  const subtitles = [
    { startFrame: 0, durationInFrames: 10, text: "first" },
    { startFrame: 3, durationInFrames: 2, text: "second" },
    { startFrame: 5, durationInFrames: 10, text: "third" },
  ];
  const lookup = buildDramaSubtitleLookup(subtitles);

  assert.equal(findActiveSubtitle(lookup, 0)?.text, "first");
  assert.equal(findActiveSubtitle(lookup, 4)?.text, "first");
  assert.equal(findActiveSubtitle(lookup, 7)?.text, "first");
  assert.equal(findActiveSubtitle(lookup, 10)?.text, "third");
  assert.equal(findActiveSubtitle(lookup, 15), undefined);
});

test("Remotion defaults to four workers and keeps an explicitly bounded override", () => {
  const config = read("remotion.config.ts");
  const { DEFAULT_DRAMA_REMOTION_CONCURRENCY, resolveDramaRemotionConcurrency } = loadTypeScriptModule("src/remotionConcurrency.ts");

  assert.equal(DEFAULT_DRAMA_REMOTION_CONCURRENCY, 4);
  assert.equal(resolveDramaRemotionConcurrency({}), 4);
  assert.equal(resolveDramaRemotionConcurrency({ DRAMA_REMOTION_CONCURRENCY: "1" }), 1);
  assert.equal(resolveDramaRemotionConcurrency({ DRAMA_REMOTION_CONCURRENCY: "8" }), 8);
  assert.equal(resolveDramaRemotionConcurrency({ DRAMA_REMOTION_CONCURRENCY: "99" }), 8);
  assert.equal(resolveDramaRemotionConcurrency({ DRAMA_REMOTION_CONCURRENCY: "0" }), 4);
  assert.equal(resolveDramaRemotionConcurrency({ DRAMA_REMOTION_CONCURRENCY: "4workers" }), 4);
  assert.match(config, /Config\.setConcurrency\(resolveDramaRemotionConcurrency\(\)\)/);
});
