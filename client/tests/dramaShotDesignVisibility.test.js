import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("../src/pages/drama/comicDrama/ShotVoiceListPanel.tsx", import.meta.url),
  "utf8",
);

test("每一镜始终显示分镜设计，不受配音段存在与否影响", () => {
  const infoStart = source.indexOf("/* 分镜信息 + 配音 */");
  const designCall = source.indexOf("<ShotDesignSummary shot={shot} />", infoStart);
  const audioBranch = source.indexOf("{segments.length > 0 ?", infoStart);

  assert.ok(infoStart >= 0, "找不到镜头信息区域");
  assert.ok(designCall > infoStart, "镜头信息区域应渲染分镜摘要");
  assert.ok(audioBranch > designCall, "配音条件不能包住分镜摘要");
  assert.match(source, /function ShotDesignSummary/);
  assert.match(source, /shot\.action/);
});

test("紧凑分镜卡片把设计和场景角色收敛为两行", () => {
  assert.match(source, /shot\.shotSize/);
  assert.match(source, /分镜设计/);
  assert.match(source, /场景\/角色/);
  assert.match(source, /shot\.location/);
  assert.match(source, /shot\.characterRefs/);
  assert.match(source, /shot\.characterStates/);
  assert.doesNotMatch(source, /shot\.cameraMove/);
  assert.doesNotMatch(source, /shot\.visualPrompt/);
  assert.doesNotMatch(source, /运镜/);
  assert.doesNotMatch(source, /画面提示词/);
  assert.doesNotMatch(source, /<details/);
});

test("旁白和配音各占一行，并且没有配音段时只用 dialogue", () => {
  assert.doesNotMatch(source, /shot\.dialogue \? `「\$\{shot\.dialogue\}` : shot\.action/);
  assert.match(source, /旁白\/对白/);
  assert.match(source, /配音/);
  assert.match(source, /AudioSegmentPlayer/);
  assert.match(source, /segments\.length > 0 \|\| Boolean\(shot\.dialogue\?\.trim\(\)\)/);
});
