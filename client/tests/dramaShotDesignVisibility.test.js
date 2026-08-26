import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("../src/pages/drama/comicDrama/ShotVoiceListPanel.tsx", import.meta.url),
  "utf8",
);

test("每一镜始终显示分镜设计，不受配音段存在与否影响", () => {
  const infoStart = source.indexOf("/* 分镜信息 + 配音 */");
  const rowStart = source.indexOf("const ShotVoiceRow = memo");
  const designCall = source.indexOf("<ShotInfoList", rowStart);

  assert.ok(infoStart >= 0, "找不到镜头信息区域");
  assert.ok(rowStart >= 0, "找不到分镜行");
  assert.ok(infoStart > rowStart, "镜头信息区域应属于分镜行");
  assert.ok(designCall > rowStart, "分镜行应渲染统一信息列表");
  assert.match(source, /function ShotInfoList/);
  assert.match(source, /shot\.action/);
});

test("紧凑分镜卡片使用左标签轨道和竖线对齐四类信息", () => {
  assert.match(source, /shot\.shotSize/);
  assert.match(source, /grid-cols-\[4\.75rem_minmax\(0,1fr\)\]/);
  assert.match(source, /border-r border-border\/60/);
  assert.match(source, /分镜设计/);
  assert.match(source, /资产/);
  assert.match(source, /语音/);
  assert.match(source, /配音/);
  assert.match(source, /shot\.location/);
  assert.match(source, /shot\.characterRefs/);
  assert.match(source, /shot\.characterStates/);
  assert.doesNotMatch(source, /场景\/角色/);
  assert.doesNotMatch(source, /旁白\/对白/);
  assert.doesNotMatch(source, /shot\.cameraMove/);
  assert.doesNotMatch(source, /shot\.visualPrompt/);
  assert.doesNotMatch(source, /运镜/);
  assert.doesNotMatch(source, /画面提示词/);
  assert.doesNotMatch(source, /<details/);
});

test("资产标签区分场景和角色，语音行标明说话人和语气", () => {
  assert.match(source, /bg-primary\/10/);
  assert.match(source, /text-primary/);
  assert.match(source, /bg-secondary/);
  assert.match(source, /text-secondary-foreground/);
  assert.match(source, /function audioSegmentSpeechLabel/);
  assert.match(source, /audioSegmentLabel\(segment\)/);
  assert.match(source, /segment\.emotion/);
});

test("配音行只展示真实播放器或生成入口，并且没有配音段时只用 dialogue", () => {
  assert.doesNotMatch(source, /shot\.dialogue \? `「\$\{shot\.dialogue\}` : shot\.action/);
  assert.match(source, /配音/);
  assert.match(source, /AudioSegmentPlayer/);
  assert.match(source, /segments\.length > 0 \|\| Boolean\(shot\.dialogue\?\.trim\(\)\)/);
  assert.doesNotMatch(source, /<span className="shrink-0 text-\[11px\] font-medium text-muted-foreground">\{audioSegmentLabel\(segment\)\}/);
});
