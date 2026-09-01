import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const panelSource = readFileSync(
  path.join(import.meta.dirname, "DramaEpisodeAssemblyPanel.tsx"),
  "utf8",
);

test("成片置顶：播放器和信息条排在合成设置之前", () => {
  const cardIndex = panelSource.indexOf('<Card className="overflow-hidden rounded-3xl">');
  const videoIndex = panelSource.indexOf("<video");
  const contentIndex = panelSource.indexOf("<CardContent", cardIndex);
  assert.ok(cardIndex >= 0);
  assert.ok(videoIndex > cardIndex && videoIndex < contentIndex, "成片播放器必须渲染在 CardContent 之前");
  assert.match(panelSource, /<CardContent className="space-y-5">\s*\{settingsSection\}/);
  assert.match(panelSource, /时长 <span className="font-medium text-foreground">\{formatAsmDuration/);
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
