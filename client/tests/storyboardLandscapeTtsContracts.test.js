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

test("每个分镜行都能试听，并按当前状态生成或重新生成本镜配音", () => {
  const panelSource = read("pages/drama/comicDrama/ShotVoiceListPanel.tsx");

  assert.match(panelSource, /<audio[\s\S]*?controls[\s\S]*?preload="metadata"/);
  assert.match(panelSource, /生成配音/);
  assert.match(panelSource, /重新生成/);
  assert.match(panelSource, /onClick=\{\(\) => props\.onRegenerate\(shot, shouldForceRegenerate\)\}/);
  assert.match(panelSource, /regenerateDramaShotAudio\(projectId, shot\.id, \{ force \}\)/);
  assert.match(panelSource, /audioActionLabel = shouldForceRegenerate \? "重新生成" : "生成配音"/);
  assert.match(panelSource, /title=\{`\$\{audioActionLabel\}这一镜的配音`\}/);
});

test("分镜行把配音操作集中到音频区，并隐藏已由音频段展示的重复文本", () => {
  const panelSource = read("pages/drama/comicDrama/ShotVoiceListPanel.tsx");

  assert.doesNotMatch(panelSource, />音频<\/span>/);
  assert.match(panelSource, /segments\.length > 0 \?/);
  assert.doesNotMatch(panelSource, /\{segments\.length > 0 \? \([\s\S]*?\{shot\.dialogue \|\| shot\.action \?/);
  assert.match(panelSource, /audioActionLabel[\s\S]*?<audio[\s\S]*?controls[\s\S]*?preload="metadata"/);
});

test("分镜配音行把正文与试听控制分层，并用真实配音时长标注镜头", () => {
  const panelSource = read("pages/drama/comicDrama/ShotVoiceListPanel.tsx");
  const boardSource = read("pages/drama/components/DramaStoryboardBoard.tsx");

  assert.match(panelSource, /function formatDurationSec\(/);
  assert.match(panelSource, /const voiceDurationSec = readyVoiceSegments\.length === segments\.length/);
  assert.match(panelSource, /formatDurationSec\(shotDurationSec\)/);
  assert.match(panelSource, /formatDurationSec\(segment\.durationSec\)/);
  assert.match(panelSource, /sm:flex-row/);
  assert.doesNotMatch(panelSource, />音频<\/span>/);
  assert.doesNotMatch(panelSource, /配音 \{readyCount\}\/\{segments\.length\}/);
  assert.doesNotMatch(panelSource, /shot\.cameraMove/);
  assert.doesNotMatch(boardSource, /cameraMove|运镜/);
});
