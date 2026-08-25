import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (relativePath) => readFileSync(new URL(`../src/${relativePath}`, import.meta.url), "utf8");

test("系统设置提供独立旁白音色入口", () => {
  const shell = read("pages/settings/components/SettingsShell.tsx");
  const overview = read("pages/settings/views/SettingsOverviewPage.tsx");
  const router = read("router/index.tsx");
  assert.match(shell, /\/settings\/narrator-voice/);
  assert.match(overview, /旁白音色/);
  assert.match(router, /settings\/narrator-voice/);
});

test("旁白音色页面提供保存描述和重新生成试听", () => {
  const page = read("pages/settings/views/NarratorVoiceSettingsPage.tsx");
  assert.match(page, /系统旁白音色/);
  assert.match(page, /整个应用统一使用/);
  assert.match(page, /<audio[\s\S]*sampleAudioUrl/);
  assert.doesNotMatch(page, /IndexTTS25|IndexTTS 2\.5|indexTTS25/);
  assert.match(page, /重新生成并试听/);
  assert.match(page, /sampleAudioUrl/);
});

test("分镜页不再承载全局 IndexTTS 2.5 音色设置", () => {
  const panel = read("pages/drama/comicDrama/ShotVoiceListPanel.tsx");
  assert.doesNotMatch(panel, /IndexTTS 2\.5 音色设置/);
  assert.doesNotMatch(panel, /IndexTTS25|IndexTTS 2\.5|参考音频/);
  assert.doesNotMatch(panel, /VoiceStagePanel/);
  assert.doesNotMatch(panel, /NarratorVoiceCard|CharacterVoiceCard/);
});
