import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const panelSource = readFileSync(
  path.join(import.meta.dirname, "DramaEpisodeAssemblyPanel.tsx"),
  "utf8",
);

test("成片阶段使用中央播放器与左右信息栏", () => {
  const cardIndex = panelSource.indexOf('<Card className="overflow-hidden rounded-3xl">');
  const videoIndex = panelSource.indexOf("<video");
  assert.ok(cardIndex >= 0);
  assert.ok(videoIndex >= 0, "视频阶段必须提供成片播放器");
  assert.match(panelSource, /data-testid="video-stage-layout"/);
  assert.match(panelSource, /xl:grid-cols-\[minmax\(13rem/);
  assert.match(panelSource, /data-testid="video-stage-player"/);
  assert.match(panelSource, /data-testid="video-stage-left-rail"/);
  assert.match(panelSource, /data-testid="video-stage-right-rail"/);
  assert.match(panelSource, /min-h-0[^"]*xl:min-h-\[clamp\(/);
  assert.match(panelSource, /max-h-\[calc\(100dvh-/);
  assert.doesNotMatch(panelSource, /max-w-\[124vh\]/);
  // 时长等固定信息在独立的右侧信息栏展示，且信息栏贴合内容高度。
  assert.match(panelSource, /<aside data-testid="video-stage-right-rail" className="[^"]*min-w-0[^"]*space-y-4/);
  for (const label of ["时长", "镜头", "字幕", "规格", "生成时间"]) {
    assert.ok(panelSource.includes(`>${label}</dt>`), `信息栏缺少 ${label}`);
  }
  // 信息栏提供直接的成片下载入口，从成片地址推导 mp4 文件名。
  assert.match(panelSource, /const assembledVideoFileName = assembledVideoUrl/);
  assert.match(panelSource, /\.pop\(\) \?\? "episode"\}\.mp4/);
  assert.match(panelSource, /download=\{assembledVideoFileName\}/);
  assert.match(panelSource, /下载视频/);
  assert.match(panelSource, /下载字幕（SRT）/);
  assert.match(panelSource, /新窗口打开/);
  // 成片信息并入播放器下方的信息条，不再单设「视频预览」「视频信息」小节。
  assert.doesNotMatch(panelSource, />视频预览</);
  assert.doesNotMatch(panelSource, />视频信息</);
});

test("合成设置与合成按钮同区，概览保留镜头与缺口统计", () => {
  const settingsIndex = panelSource.indexOf("合成设置");
  const buttonIndex = panelSource.indexOf("<DramaEpisodeAssemblyButton");
  assert.ok(settingsIndex >= 0);
  assert.ok(buttonIndex > settingsIndex && buttonIndex - settingsIndex < 400, "合成按钮必须紧跟合成设置标题");
  assert.match(panelSource, /合成概览/);
  assert.match(panelSource, /缺少配音/);
  assert.doesNotMatch(panelSource, /开始合成前选择视频中要包含的内容。/);
});

test("studio 视频阶段以成片卡片为主体，不再叠加素材概览行", () => {
  const studioSource = readFileSync(
    path.join(import.meta.dirname, "..", "comicDrama", "ComicDramaStudioPage.tsx"),
    "utf8",
  );
  assert.doesNotMatch(studioSource, /StageMetric/);
  const videoSectionStart = studioSource.indexOf("function VideoSection");
  const videoSection = studioSource.slice(
    videoSectionStart,
    studioSource.indexOf("}", studioSource.indexOf("DramaEpisodeAssemblyPanel", videoSectionStart)),
  );
  assert.match(videoSection, /DramaEpisodeAssemblyPanel/);
  assert.doesNotMatch(videoSection, /分镜画面|配音/);
});
