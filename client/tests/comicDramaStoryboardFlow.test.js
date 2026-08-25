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
  const pageSource = read("pages/drama/comicDrama/ComicDramaStudioPage.tsx");
  const assemblySource = read("pages/drama/components/DramaEpisodeAssemblyPanel.tsx");

  assert.match(panelSource, /DramaEpisodeAssemblyButton/);
  assert.doesNotMatch(panelSource, /DramaEpisodeAssemblyResultPanel/);
  assert.match(panelSource, /生成/);
  assert.match(panelSource, /生成分镜失败/);
  assert.match(pageSource, /<DramaEpisodeAssemblyPanel/);
  assert.match(assemblySource, /getDramaEpisodeAssembly/);
  assert.match(assemblySource, /startDramaEpisodeAssembly/);
  assert.match(assemblySource, /横屏 16:9/);
  assert.match(assemblySource, /合成/);
  assert.match(assemblySource, /assembled\?\.status === "done"/);
});

test("分镜顶部工具栏只保留合成，并在合成前准备素材", () => {
  const panelSource = read("pages/drama/comicDrama/ShotVoiceListPanel.tsx");
  const assemblySource = read("pages/drama/components/DramaEpisodeAssemblyPanel.tsx");
  const toolbarStart = panelSource.indexOf("const storyboardToolbar");
  const toolbarEnd = panelSource.indexOf("return (", toolbarStart);
  const toolbarSource = panelSource.slice(toolbarStart, toolbarEnd);

  assert.equal((toolbarSource.match(/<DramaEpisodeAssemblyButton/g) ?? []).length, 1);
  assert.doesNotMatch(toolbarSource, /生成分镜|统一写实重生成|生成配音|AiButton/);
  assert.match(panelSource, /还没有分镜/);
  assert.match(panelSource, /onGenerateKeyframe/);
  assert.match(assemblySource, /prepare\?: \(\) => Promise<void>/);
  assert.match(assemblySource, /准备素材中/);
  assert.match(assemblySource, /合成中/);
});

test("storyboard generation never falls back to the retired Unreal 3D style", () => {
  const pageSource = read("pages/drama/comicDrama/ComicDramaStudioPage.tsx");

  assert.doesNotMatch(pageSource, /unreal_cinematic_3d/);
  assert.match(pageSource, /styleOptions\[0\]\?\.id/);
  assert.match(pageSource, /const DEFAULT_DRAMA_VISUAL_STYLE_ID = "realistic"/);
  assert.match(pageSource, /\|\| DEFAULT_DRAMA_VISUAL_STYLE_ID/);
});
