import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (relativePath) => readFileSync(new URL(`../src/${relativePath}`, import.meta.url), "utf8");

test("分镜工作台以静态分镜画面作为唯一视觉产物入口", () => {
  const listSource = read("pages/drama/comicDrama/ShotVoiceListPanel.tsx");
  const boardSource = read("pages/drama/components/DramaStoryboardBoard.tsx");
  const visualSource = read("pages/drama/components/DramaVisualPanel.tsx");

  assert.match(listSource, /生成画面/);
  assert.match(listSource, /共 \{shots\.length\} 镜 · 画面/);
  assert.doesNotMatch(listSource, /首帧/);
  assert.doesNotMatch(boardSource, /首帧|视频提示词|onVideoPrompt/);
  assert.doesNotMatch(visualSource, /首帧|视频提示词|videoProviders|onVideoPrompt|onProviderTask/);
  assert.match(visualSource, /生成本集画面/);
});

test("成片阶段只保留静态画面、配音和字幕装配", () => {
  const studioSource = read("pages/drama/comicDrama/ComicDramaStudioPage.tsx");
  const nextStepSource = read("pages/drama/components/DramaNextStepPanel.tsx");
  const assemblySource = read("pages/drama/components/DramaEpisodeAssemblyPanel.tsx");
  const listSource = read("pages/drama/comicDrama/ComicDramaListPage.tsx");

  assert.match(studioSource, /video:\s*"视频"/);
  assert.match(studioSource, /DramaEpisodeAssemblyPanel/);
  assert.doesNotMatch(studioSource, /视频提示词|videoProviders/);
  assert.doesNotMatch(nextStepSource, /videoPrompt|providerTask|视频提示词|DramaVideoPrompt/);
  assert.match(assemblySource, /分镜画面兜底/);
  assert.doesNotMatch(assemblySource, /首帧图兜底/);
  assert.match(listSource, /画面 \$\{link\.keyframeReadyCount\}/);
  assert.match(listSource, /成片 \$\{link\.videoReadyCount\}/);
  assert.doesNotMatch(listSource, /首帧 \$\{|视频 \$\{link\.videoReadyCount\}/);
});

test("本地镜头素材保持静态图片，不使用 Ken Burns 动效", () => {
  const providerSource = read("../../server/src/services/drama/video/LocalFfmpegVideoProvider.ts");

  assert.doesNotMatch(providerSource, /zoompan|Ken Burns/);
  assert.match(providerSource, /-loop/);
  assert.match(providerSource, /-vf/);
});

test("角色资产文案指向分镜画面和成片链路", () => {
  const charactersSource = read("pages/drama/components/DramaCharactersPanel.tsx");

  assert.doesNotMatch(charactersSource, /视频提示词/);
  assert.match(charactersSource, /分镜画面/);
});
