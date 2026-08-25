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
  assert.match(
    page,
    /placeholder="例如：成年女性，约30岁，明亮自然的女中音；普通话标准清晰，声音温暖亲和，像真实的人在近距离讲故事；语速中等，停顿自然，句尾平稳但有轻微语气变化；吐字清楚、连贯，有真实呼吸感；不要播音腔、主持腔、新闻腔，不要低沉或男性化。"/,
  );
});

test("分镜页不再承载全局 IndexTTS 2.5 音色设置", () => {
  const panel = read("pages/drama/comicDrama/ShotVoiceListPanel.tsx");
  assert.doesNotMatch(panel, /IndexTTS 2\.5 音色设置/);
  assert.doesNotMatch(panel, /IndexTTS25|IndexTTS 2\.5|参考音频/);
  assert.doesNotMatch(panel, /VoiceStagePanel/);
  assert.doesNotMatch(panel, /NarratorVoiceCard|CharacterVoiceCard/);
});
