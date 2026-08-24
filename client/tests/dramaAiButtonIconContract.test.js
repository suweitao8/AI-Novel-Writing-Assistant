import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (relativePath) => readFileSync(new URL(`../src/${relativePath}`, import.meta.url), "utf8");
const aiButtonBlocks = (source) => [...source.matchAll(/<AiButton\b[\s\S]*?<\/AiButton>/g)].map((match) => match[0]);

test("漫剧 AI 按钮只使用 AiButton 自带的 AI 标识，不再叠加静态功能图标", () => {
  const shotVoiceSource = read("pages/drama/comicDrama/ShotVoiceListPanel.tsx");
  const voiceStageSource = read("pages/drama/comicDrama/VoiceStagePanel.tsx");
  const storyboardSource = read("pages/drama/components/DramaStoryboardBoard.tsx");
  const worldMapSource = read("pages/drama/comicDrama/components/WorldMapPanel.tsx");

  for (const source of [shotVoiceSource, voiceStageSource, storyboardSource, worldMapSource]) {
    for (const block of aiButtonBlocks(source)) {
      assert.doesNotMatch(block, /<(?:Sparkles|RefreshCw|Volume2|Wand2|Mic|ImageIcon)\b/);
    }
  }
});
