import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (relativePath) => readFileSync(new URL(`../src/${relativePath}`, import.meta.url), "utf8");

test("comic studio generates storyboard from the selected saved chapter", () => {
  const pageSource = read("pages/drama/comicDrama/ComicDramaStudioPage.tsx");
  const apiSource = read("api/media/drama.ts");

  assert.match(apiSource, /generateComicDramaStoryboard/);
  assert.match(apiSource, /\/drama\/studio\/\$\{encodeURIComponent\(novelId\)\}\/chapters\/\$\{order\}\/storyboard/);
  assert.match(pageSource, /AiButton/);
  assert.match(pageSource, /generateComicDramaStoryboard/);
  assert.match(pageSource, /chapterWorkspace\.currentChapter\?\.order/);
  assert.match(pageSource, /expectationText/);
  assert.match(pageSource, /生成/);
});

test("storyboard page exposes generation and episode assembly actions", () => {
  const panelSource = read("pages/drama/comicDrama/ShotVoiceListPanel.tsx");
  const assemblySource = read("pages/drama/components/DramaEpisodeAssemblyPanel.tsx");

  assert.match(panelSource, /DramaEpisodeAssemblyPanel/);
  assert.match(panelSource, /生成/);
  assert.match(panelSource, /生成分镜失败/);
  assert.match(assemblySource, /getDramaEpisodeAssembly/);
  assert.match(assemblySource, /startDramaEpisodeAssembly/);
  assert.match(assemblySource, /横屏 16:9/);
  assert.match(assemblySource, /合成/);
  assert.match(assemblySource, /assembled\?\.status === "done"/);
});
