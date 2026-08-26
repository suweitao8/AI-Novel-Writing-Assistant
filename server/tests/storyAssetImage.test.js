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
  assert.match(prompt, /strict three-zone equirectangular vertical layout with two fixed boundaries: the horizon line at v=0\.5 and the sky line at v=0\.3/);
  assert.match(prompt, /fully contained between v=0\.3 and v=0\.48 with a clean safety margin/);
  assert.match(prompt, /the lower half is not a perspective view of the space: it renders as one seamless floor material seen from directly above/);
  assert.match(prompt, /hard middle-line ceiling: the lowest point of every object/);
  assert.match(prompt, /lower ground zone v=0\.52-1\.0 \(the whole bottom half below v=0\.5\) contains only one continuous clean ground/);
  assert.match(prompt, /upper sky zone v=0\.0-0\.3 contains only clean sky or ceiling/);
  assert.match(prompt, /no object, furniture leg, hard contact fragment or large shadow crosses it/);
  assert.doesNotMatch(prompt, /NO characters or only tiny background figures/);
  // 室内强化行只在 sceneType=interior 时进入，未声明类型的旧调用不混入。
  assert.doesNotMatch(prompt, /interior rule: walls, windows, doors and all furniture/);
});

test("室内场景全景提示词追加强化行：家具与墙根不落下半区", () => {
  const prompt = buildScenePanoramaPrompt({
    name: "出租屋",
    environmentPrompt: "木地板，白墙，一张床靠墙",
    timeOfDay: null,
    weather: null,
    sceneType: "interior",
  }, []);

  assert.match(prompt, /interior composition: build the picture like a theater set poster in two flat layers/);
  assert.match(prompt, /treat all furniture like flat stage-prop cutouts standing on the backdrop's bottom edge/);
  assert.match(prompt, /a deep, small-looking room always wins over an object crossing the line/);
  assert.match(prompt, /the flooring swatch stays completely empty/);
  assert.match(prompt, /wall décor rule: anything framed or hung on the walls is decorative media/);
  assert.match(prompt, /photographs appear on walls only when the scene description explicitly mentions them/);
  assert.match(prompt, /each must sit inside a proper picture frame/);
  assert.match(prompt, /photo restraint: render at most one framed photograph unless the scene description explicitly names a larger amount/);
});
