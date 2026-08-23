import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (relativePath) => readFileSync(new URL(`../src/${relativePath}`, import.meta.url), "utf8");

test("分镜列表把合成操作放进右侧统一操作区，并使用横屏缩略图", () => {
  const panelSource = read("pages/drama/comicDrama/ShotVoiceListPanel.tsx");
  const assemblySource = read("pages/drama/components/DramaEpisodeAssemblyPanel.tsx");

  assert.match(panelSource, /DramaEpisodeAssemblyButton/);
  assert.match(panelSource, /createPortal/);
  assert.match(panelSource, /toolbarTarget/);
  assert.doesNotMatch(panelSource, /DramaEpisodeAssemblyResultPanel/);
  assert.match(panelSource, /aspect-video/);
  assert.match(panelSource, /w-32 shrink-0 space-y-1\.5 sm:w-40/);
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

test("视频阶段按设置、进度、预览和信息分组，并使用清晰的设置文案", () => {
  const assemblySource = read("pages/drama/components/DramaEpisodeAssemblyPanel.tsx");

  assert.match(assemblySource, /合成设置/);
  assert.match(assemblySource, /字幕写入视频/);
  assert.match(assemblySource, /片头和片尾/);
  assert.match(assemblySource, /合成进度/);
  assert.match(assemblySource, /视频预览/);
  assert.match(assemblySource, /视频信息/);
  assert.doesNotMatch(assemblySource, /max-w-3xl/);
});

test("漫剧视频页不再跳转到旧视频工作台", () => {
  const studioSource = read("pages/drama/comicDrama/ComicDramaStudioPage.tsx");

  assert.doesNotMatch(studioSource, /打开视频工作台/);
});

test("分镜批量操作位于上层页签操作槽，并使用简洁的生成分镜文案", () => {
  const panelSource = read("pages/drama/comicDrama/ShotVoiceListPanel.tsx");
  const pageSource = read("pages/drama/comicDrama/ComicDramaStudioPage.tsx");

  assert.match(pageSource, /video: "视频"/);
  assert.match(pageSource, /storyboardToolbarTarget/);
  assert.match(pageSource, /toolbarTarget=\{storyboardToolbarTarget\}/);
  assert.match(panelSource, /createPortal\([\s\S]*生成分镜/);
  assert.doesNotMatch(panelSource, /生成分镜\$\{keyframeSummary\.missing/);
  assert.doesNotMatch(panelSource, /<ImageIcon className="mr-1\.5 h-3\.5 w-3\.5"/);
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

  assert.match(panelSource, /AudioSegmentPlayer/);
  assert.match(panelSource, /<audio[\s\S]*?preload="metadata"/);
  assert.match(panelSource, /type="range"/);
  assert.match(panelSource, /currentTime/);
  assert.match(panelSource, /duration/);
  assert.match(panelSource, /生成配音/);
  assert.match(panelSource, /重新生成/);
  assert.match(panelSource, /onClick=\{\(\) => props\.onRegenerate\(shot, shouldForceRegenerate\)\}/);
  assert.match(panelSource, /regenerateDramaShotAudio\(projectId, shot\.id, \{ force \}\)/);
  assert.match(panelSource, /audioActionLabel = shouldForceRegenerate \? "重新生成" : "生成配音"/);
  assert.match(panelSource, /title=\{`\$\{audioActionLabel\}这一镜的配音`\}/);
});

test("没有可播放音频时只保留生成入口，并隐藏空播放器占位", () => {
  const panelSource = read("pages/drama/comicDrama/ShotVoiceListPanel.tsx");

  assert.match(panelSource, /const readySegments = segments\.filter\(/);
  assert.match(panelSource, /segment\.status === "ready" && Boolean\(segment\.audioUrl\)/);
  assert.match(panelSource, /readySegments\.map\(\(segment\) =>/);
  assert.match(panelSource, /const hasReadyAudio = readySegments\.length > 0/);
  assert.match(panelSource, /!hasReadyAudio && "ml-auto"/);
  assert.doesNotMatch(panelSource, /SegmentStatusDot status=\{segment\.status\}/);
  assert.doesNotMatch(panelSource, /segment\.status === "stale" \? "需重配" : "未生成"/);
});

test("分镜行把配音操作集中到音频区，并隐藏已由音频段展示的重复文本", () => {
  const panelSource = read("pages/drama/comicDrama/ShotVoiceListPanel.tsx");

  assert.doesNotMatch(panelSource, />音频<\/span>/);
  assert.match(panelSource, /segments\.length > 0 \?/);
  assert.doesNotMatch(panelSource, /\{segments\.length > 0 \? \([\s\S]*?\{shot\.dialogue \|\| shot\.action \?/);
  assert.match(panelSource, /AudioSegmentPlayer/);
  assert.match(panelSource, /audioActionLabel/);
  assert.match(panelSource, /<audio[\s\S]*?preload="metadata"/);
});

test("分镜配音行只在播放器内显示真实当前与总时长，不重复显示分镜时长", () => {
  const panelSource = read("pages/drama/comicDrama/ShotVoiceListPanel.tsx");
  const boardSource = read("pages/drama/components/DramaStoryboardBoard.tsx");

  assert.doesNotMatch(panelSource, /function formatDurationSec\(/);
  assert.doesNotMatch(panelSource, /voiceDurationSec|shotDurationSec/);
  assert.match(panelSource, /const shotMeta = \[shot\.shotSize\]/);
  assert.match(panelSource, /formatAudioTime\(currentTime\)[\s\S]*formatAudioTime\(duration\)/);
  assert.doesNotMatch(panelSource, /segment\.durationSec/);
  assert.match(panelSource, /sm:flex-row/);
  assert.doesNotMatch(panelSource, />音频<\/span>/);
  assert.doesNotMatch(panelSource, /配音 \{readyCount\}\/\{segments\.length\}/);
  assert.doesNotMatch(panelSource, /shot\.cameraMove/);
  assert.doesNotMatch(boardSource, /cameraMove|运镜/);
});

test("分镜工具栏使用父级章节并收敛为三个批量入口", () => {
  const panelSource = read("pages/drama/comicDrama/ShotVoiceListPanel.tsx");
  const pageSource = read("pages/drama/comicDrama/ComicDramaStudioPage.tsx");

  assert.match(panelSource, /chapterOrder/);
  assert.doesNotMatch(panelSource, /SelectControl|selectedOrder|音色设置/);
  assert.match(panelSource, /生成分镜/);
  assert.match(panelSource, /生成配音/);
  assert.match(panelSource, /重新配音/);
  assert.match(panelSource, /DramaEpisodeAssemblyButton/);
  assert.match(pageSource, /<ShotVoiceListPanel[\s\S]*chapterOrder=/);
});
