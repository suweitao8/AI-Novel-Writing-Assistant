const test = require("node:test");
const assert = require("node:assert/strict");

const { buildScenePanoramaPrompt } = require("../dist/modules/novel/story-settings/application/StoryAssetImageService.js");

test("场景全景提示词只允许空环境，不把怪物或人物画进场景", () => {
  const prompt = buildScenePanoramaPrompt({
    name: "末世血角兽猎场",
    environmentPrompt: "血红雾气中的荒原，远处有巨型带血角猛兽轮廓",
    timeOfDay: null,
    weather: null,
  }, []);

  assert.match(prompt, /pure empty environment reference/);
  assert.match(prompt, /no people/);
  assert.match(prompt, /no animals/);
  assert.match(prompt, /no monsters/);
  assert.match(prompt, /environmental traces/);
  assert.doesNotMatch(prompt, /NO characters or only tiny background figures/);
});
