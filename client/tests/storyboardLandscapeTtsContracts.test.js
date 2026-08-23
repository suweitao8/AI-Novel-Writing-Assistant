import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (relativePath) => readFileSync(new URL(`../src/${relativePath}`, import.meta.url), "utf8");

test("分镜列表把合成操作放进右侧统一操作区，并使用横屏缩略图", () => {
  const panelSource = read("pages/drama/comicDrama/ShotVoiceListPanel.tsx");
  const assemblySource = read("pages/drama/components/DramaEpisodeAssemblyPanel.tsx");

  assert.match(panelSource, /DramaEpisodeAssemblyButton/);
  assert.match(panelSource, /DramaEpisodeAssemblyResultPanel/);
  assert.match(panelSource, /className="ml-auto flex flex-wrap gap-2"/);
  assert.match(panelSource, /aspect-video/);
  assert.match(panelSource, /w-32 shrink-0 sm:w-40/);
  assert.doesNotMatch(panelSource, /listDramaTTSProviders|providersQuery|const \[provider,/);
  const boardSource = read("pages/drama/components/DramaStoryboardBoard.tsx");
  const nextStepSource = read("pages/drama/components/DramaNextStepPanel.tsx");
  assert.doesNotMatch(boardSource, /aspect-\[9\/16\]|isVertical/);
  assert.match(boardSource, /aspect-video/);
  assert.doesNotMatch(nextStepSource, /竖屏视频生成提示词/);
  assert.match(assemblySource, /export function useDramaEpisodeAssembly/);
  assert.match(assemblySource, /export function DramaEpisodeAssemblyButton/);
  assert.match(assemblySource, /export function DramaEpisodeAssemblyResultPanel/);
  assert.doesNotMatch(assemblySource, /合成整集|重新合成整集/);
});

test("配音界面不再提供页面级通道选择", () => {
  const audioPanelSource = read("pages/drama/components/DramaEpisodeAudioPanel.tsx");
  const projectPageSource = read("pages/drama/DramaProjectPage.tsx");
  const comicDramaApiSource = read("api/media/comicDrama.ts");

  assert.doesNotMatch(audioPanelSource, /ttsProviders|selectedProvider|SelectControl/);
  assert.doesNotMatch(audioPanelSource, /provider:\s*activeProvider/);
  assert.doesNotMatch(projectPageSource, /ttsProvidersQuery|ttsProviders=/);
  assert.doesNotMatch(comicDramaApiSource, /payload: \{ provider\?: string; force\?: boolean \}/);
});
