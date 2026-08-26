import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("../src/pages/drama/comicDrama/ShotVoiceListPanel.tsx", import.meta.url),
  "utf8",
);

test("每一镜始终显示分镜设计，不受配音段存在与否影响", () => {
  const infoStart = source.indexOf("/* 分镜信息 + 配音段 */");
  const designCall = source.indexOf("<ShotDesignSummary shot={shot} />", infoStart);
  const audioBranch = source.indexOf("{segments.length > 0 ?", infoStart);

  assert.ok(infoStart >= 0, "找不到镜头信息区域");
  assert.ok(designCall > infoStart, "镜头信息区域应渲染分镜摘要");
  assert.ok(audioBranch > designCall, "配音条件不能包住分镜摘要");
  assert.match(source, /function ShotDesignSummary/);
  assert.match(source, /shot\.action/);
});

test("分镜摘要覆盖镜头语言、场景、角色状态和画面提示词", () => {
  assert.match(source, /shot\.shotSize/);
  assert.match(source, /shot\.cameraMove/);
  assert.match(source, /shot\.location/);
  assert.match(source, /shot\.characterRefs/);
  assert.match(source, /shot\.characterStates/);
  assert.match(source, /shot\.visualPrompt/);
  assert.match(source, /<details/);
  assert.match(source, /画面提示词/);
});

test("没有配音段时只用 dialogue 显示台词，不把 action 当台词兜底", () => {
  assert.doesNotMatch(source, /shot\.dialogue \? `「\$\{shot\.dialogue\}` : shot\.action/);
  assert.match(source, /台词\/旁白/);
});
